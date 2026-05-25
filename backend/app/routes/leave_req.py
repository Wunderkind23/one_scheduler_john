from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user, get_role
from ..models import LeaveRequest, User, Officer, Schedule, Team
from ..logger import logger
import json
from ..services.schedule_generator import sync_assignments_for_schedule
from .notifications import create_notification

router = APIRouter(prefix="/api/leave-requests", tags=["leave-requests"])


class LeaveCreate(BaseModel):
    start_date: str
    end_date:   str
    reason:     Optional[str] = None


class LeaveReview(BaseModel):
    action: str


def _dict(r: LeaveRequest) -> dict:
    return {
        "id":            r.id,
        "team_id":       r.team_id,
        "officer_email": r.officer_email,
        "officer_name":  r.officer_name,
        "start_date":    r.start_date,
        "end_date":      r.end_date,
        "reason":        r.reason,
        "status":        r.status,
        "reviewed_by":   r.reviewed_by,
        "created_at":    str(r.created_at),
        "reviewed_at":   str(r.reviewed_at) if r.reviewed_at else None,
    }


@router.get("/")
def list_leave(
    status: Optional[str] = Query(None),
    db:     Session       = Depends(get_db),
    user:   User          = Depends(get_current_user),
):
    if not user.team_id:
        return []
    role = get_role(user, db)
    q = db.query(LeaveRequest).filter(
        LeaveRequest.team_id == user.team_id   # TEAM ISOLATION
    )
    if role != "teamlead":
        # Officers see only their own requests
        q = q.filter(LeaveRequest.officer_email == user.email)
    if status:
        q = q.filter(LeaveRequest.status == status)
    return [_dict(r) for r in q.order_by(LeaveRequest.created_at.desc()).all()]


@router.post("/")
def create_leave(
    data: LeaveCreate,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if not user.team_id:
        raise HTTPException(400, "You are not in a team")

    # Get officer name from the officers table — team scoped
    o = db.query(Officer).filter(
        Officer.email     == user.email,
        Officer.team_id   == user.team_id,
    ).first()
    officer_name = o.name if o else (user.display_name or user.email.split("@")[0])

    existing = db.query(LeaveRequest).filter(
        LeaveRequest.team_id       == user.team_id,
        LeaveRequest.officer_email == user.email,
        LeaveRequest.start_date    == data.start_date,
        LeaveRequest.status        == "pending",
    ).first()
    if existing:
        raise HTTPException(400, "A pending leave request already exists for this start date")

    req = LeaveRequest(
        team_id       = user.team_id,
        officer_email = user.email,
        officer_name  = officer_name,
        start_date    = data.start_date,
        end_date      = data.end_date,
        reason        = data.reason,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    logger.info(f"Leave request: {user.email} {data.start_date}->{data.end_date} team={user.team_id}")
    
    team = db.query(Team).filter(Team.id == user.team_id).first()
    if team:
        create_notification(db, user.team_id, team.created_by, f"New leave request from {officer_name} ({data.start_date} to {data.end_date}).", link="/dashboard?tab=leave")
        
    return _dict(req)


@router.put("/{req_id}/review")
def review_leave(
    req_id: int,
    data:   LeaveReview,
    db:     Session = Depends(get_db),
    user:   User    = Depends(get_current_user),
):
    role = get_role(user, db)
    if role != "teamlead":
        raise HTTPException(403, "Only team leads can approve or reject leave requests")
    if data.action not in ("approve", "reject"):
        raise HTTPException(422, "action must be 'approve' or 'reject'")

    # TEAM ISOLATION — can only review your own team's requests
    req = db.query(LeaveRequest).filter(
        LeaveRequest.id      == req_id,
        LeaveRequest.team_id == user.team_id,
    ).first()
    if not req:
        raise HTTPException(404, "Leave request not found in your team")
    if req.status != "pending":
        raise HTTPException(400, f"This request is already {req.status}")

    if data.action == "approve":
        req.status = "approved"
        _apply_leave(req, db, user.team_id)
    else:
        req.status = "rejected"
    req.reviewed_by = user.display_name or user.email
    req.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    
    create_notification(db, req.team_id, req.officer_email, f"Your leave request for {req.start_date} was {req.status}.", link="/dashboard?tab=leave")
    
    return _dict(req)


def _apply_leave(req: LeaveRequest, db: Session, team_id: int):
    from datetime import date, timedelta
    from ..models import PublicHoliday
    try:
        start = date.fromisoformat(req.start_date)
        end   = date.fromisoformat(req.end_date)
    except ValueError:
        return
        
    # Retrieve all public holidays for this team or global ones
    holidays = db.query(PublicHoliday).filter(
        (PublicHoliday.team_id == team_id) | (PublicHoliday.team_id == None)
    ).all()

    holiday_dates = set()
    for y in range(start.year, end.year + 2):
        for h in holidays:
            if h.recurring:
                try:
                    holiday_dates.add(date(y, h.month, h.day).isoformat())
                except ValueError:
                    pass
            elif h.year == y:
                holiday_dates.add(h.date)

    # Extend end date to include weekends and holidays
    while True:
        nxt = end + timedelta(days=1)
        if nxt.weekday() >= 5 or nxt.isoformat() in holiday_dates:
            end = nxt
        else:
            break

    dates_to_leave = set()
    curr = start
    while curr <= end:
        dates_to_leave.add(curr.isoformat())
        curr += timedelta(days=1)

    schedule_keys = set()
    for d_iso in dates_to_leave:
        y, m, _ = d_iso.split("-")
        schedule_keys.add((int(y), int(m)))

    for y, m in schedule_keys:
        s = db.query(Schedule).filter(
            Schedule.year    == y,
            Schedule.month   == m,
            Schedule.team_id == team_id,
        ).first()
        if not s:
            continue

        try:
            rows = json.loads(s.data)
            changed = False
            for row in rows:
                try:
                    row_iso = datetime.strptime(row["Date"], "%d-%b-%y").strftime("%Y-%m-%d")
                except Exception:
                    row_iso = row["Date"]
                
                if row_iso in dates_to_leave:
                    current_col = None
                    for col, content in row.items():
                        if col in ["Date", "Day", "12AM - 7AM (prev night)"]: continue
                        if not content: continue
                        parsed = [c.replace(" (Leave)", "").strip() for c in content.split(", ") if c.strip()]
                        if req.officer_name in parsed:
                            current_col = col
                            break
                    
                    if current_col == "Off":
                        entries = [e.strip() for e in row["Off"].split(", ") if e.strip()]
                        new_entries = []
                        for e in entries:
                            if e.replace(" (Leave)", "").strip() == req.officer_name and " (Leave)" not in e:
                                new_entries.append(f"{req.officer_name} (Leave)")
                                changed = True
                            else:
                                new_entries.append(e)
                        row["Off"] = ", ".join(new_entries)
                        
                    elif current_col:
                        entries = [e.strip() for e in row[current_col].split(", ") if e.strip()]
                        # Remove the leaving officer
                        entries = [e for e in entries if e.replace(" (Leave)", "").strip() != req.officer_name]
                        
                        off_entries = [e.strip() for e in row.get("Off", "").split(", ") if e.strip()]
                        off_entries.append(f"{req.officer_name} (Leave)")
                        
                        # Find a replacement from "Off" column
                        available = [e for e in off_entries if " (Leave)" not in e and e != req.officer_name]
                        
                        if available:
                            candidate_counts = {c: 0 for c in available}
                            for r in rows:
                                for c_name, cnt in r.items():
                                    if c_name in ["Date", "Day", "Off", "12AM - 7AM (prev night)"]: continue
                                    if not cnt: continue
                                    for entry in [x.strip() for x in cnt.split(", ") if x.strip()]:
                                        core = entry.replace(" (Leave)", "").strip()
                                        if core in candidate_counts:
                                            candidate_counts[core] += 1
                                            
                            best_candidate = min(available, key=lambda x: candidate_counts[x])
                            off_entries.remove(best_candidate)
                            entries.append(best_candidate)
                            
                        row[current_col] = ", ".join(entries)
                        row["Off"] = ", ".join(off_entries)
                        changed = True
            
            if changed:
                s.data = json.dumps(rows)
                logger.info(f"Leave #{req.id} applied to schedule #{s.id} (team {team_id})")
                sync_assignments_for_schedule(s, db)
        except Exception as e:
            logger.error(f"Leave apply failed for schedule {s.id}: {e}")

@router.delete("/{req_id}")
def cancel_leave(
    req_id: int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    # TEAM ISOLATION
    req = db.query(LeaveRequest).filter(
        LeaveRequest.id      == req_id,
        LeaveRequest.team_id == user.team_id,
    ).first()
    if not req:
        raise HTTPException(404, "Leave request not found")

    role = get_role(user, db)
    if role != "teamlead" and req.officer_email != user.email:
        raise HTTPException(403, "You can only cancel your own requests")
    if req.status != "pending":
        raise HTTPException(400, "Cannot cancel a request that has already been reviewed")

    db.delete(req)
    db.commit()
    return {"message": "Leave request cancelled"}