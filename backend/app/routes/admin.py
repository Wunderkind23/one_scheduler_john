from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import User, Team, Schedule
from ..auth import get_current_user
from ..logger import logger
import json

router = APIRouter()

def require_superadmin(user: User = Depends(get_current_user)):
    if not getattr(user, "is_superadmin", False):
        raise HTTPException(status_code=403, detail="Super Admin access required.")
    return user

@router.get("/dashboard")
def get_superadmin_dashboard(
    db: Session = Depends(get_db),
    admin: User = Depends(require_superadmin)
):
    """
    Returns global metrics across all teams for the Super Admin dashboard.
    """
    total_users = db.query(func.count(User.id)).scalar()
    total_teams = db.query(func.count(Team.id)).scalar()
    
    # Get all active schedules
    all_schedules = db.query(Schedule).all()
    
    # Simple global analytics
    global_avg_fairness = 0
    valid_schedules = 0
    
    team_stats = []
    
    for team in db.query(Team).all():
        team_users = db.query(func.count(User.id)).filter(User.team_id == team.id).scalar()
        
        # Find latest schedule for this team
        latest_sched = db.query(Schedule).filter(Schedule.team_id == team.id, Schedule.is_published == True).order_by(Schedule.year.desc(), Schedule.month.desc()).first()
        
        fairness = "N/A"
        if latest_sched and latest_sched.data_json:
            try:
                data = json.loads(latest_sched.data_json)
                shifts_count = []
                for row in data:
                    for k, v in row.items():
                        if k not in ["Date", "Day", "Off", "Leave"] and v:
                            shifts_count.extend([o.replace(" ★", "").strip() for o in v.split(",") if o.strip()])
                
                from collections import Counter
                counts = Counter(shifts_count)
                if counts:
                    vals = list(counts.values())
                    diff = max(vals) - min(vals)
                    score = max(0, 100 - (diff * 5))
                    fairness = f"{score}%"
                    global_avg_fairness += score
                    valid_schedules += 1
            except:
                pass
                
        team_stats.append({
            "id": team.id,
            "name": team.name,
            "members": team_users,
            "latest_fairness": fairness
        })
        
    avg_fairness = round(global_avg_fairness / valid_schedules) if valid_schedules > 0 else 0

    return {
        "metrics": {
            "total_users": total_users,
            "total_teams": total_teams,
            "avg_fairness": f"{avg_fairness}%"
        },
        "teams": team_stats
    }

@router.post("/promote/{user_id}")
def promote_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_superadmin)
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
        
    target.is_superadmin = True
    db.commit()
    return {"message": f"{target.email} is now a Super Admin"}
