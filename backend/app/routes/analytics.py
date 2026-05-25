import json
import math
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user
from ..models import User, Schedule

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

MONTHS        = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
MORNING_HOURS = 10
NIGHT_HOURS   = 14


def _parse_month(team_id: int, year: int, month: int, db: Session) -> dict:
    # TEAM ISOLATION — only this team's schedule
    s = db.query(Schedule).filter(
        Schedule.team_id == team_id,
        Schedule.year    == year,
        Schedule.month   == month,
    ).order_by(Schedule.id.desc()).first()

    if not s:
        return {"officers": [], "summary": {}, "exists": False}

    rows = json.loads(s.data)
    raw  = {}
    cols = {
        "Morning (7AM - 5PM)": ("Morning", MORNING_HOURS),
        "Night (5PM - 12AM)":  ("Night",   NIGHT_HOURS),
        "Off":                 ("Off",      0),
    }

    for row in rows:
        for col, (label, hrs) in cols.items():
            for entry in row.get(col, "").split(", "):
                e = entry.strip()
                if not e:
                    continue
                on_leave = "(Leave)" in e
                name     = e.replace(" (Leave)", "").strip()
                if not name:
                    continue
                if name not in raw:
                    raw[name] = {
                        "officer": name, "morning": 0, "night": 0,
                        "off": 0, "leave": 0, "total_hours": 0,
                    }
                d = raw[name]
                if on_leave:
                    d["leave"] += 1
                elif label == "Morning":
                    d["morning"]     += 1
                    d["total_hours"] += hrs
                elif label == "Night":
                    d["night"]       += 1
                    d["total_hours"] += hrs
                else:
                    d["off"] += 1

    officers = list(raw.values())
    if officers:
        am = sum(o["morning"]     for o in officers) / len(officers)
        an = sum(o["night"]       for o in officers) / len(officers)
        ah = sum(o["total_hours"] for o in officers) / len(officers)
        tl = sum(o["leave"]       for o in officers)
    else:
        am = an = ah = tl = 0

    return {
        "officers": officers,
        "summary": {
            "total_officers":   len(officers),
            "avg_morning":      round(am, 1),
            "avg_night":        round(an, 1),
            "avg_hours":        round(ah, 1),
            "total_leave_days": tl,
        },
        "exists": True,
    }


def _fairness(officers: list) -> dict:
    if not officers:
        return {"score": 100, "label": "No data", "detail": ""}
    w = [o["morning"] + o["night"] for o in officers]
    if not w or max(w) == 0:
        return {"score": 100, "label": "No shifts", "detail": ""}
    mean = sum(w) / len(w)
    if mean == 0:
        return {"score": 100, "label": "No shifts", "detail": ""}
    cv    = math.sqrt(sum((x - mean) ** 2 for x in w) / len(w)) / mean
    score = max(0, round(100 * (1 - cv * 2)))
    label = ("Excellent" if score >= 90 else "Good" if score >= 75
             else "Fair" if score >= 50 else "Needs attention")
    mx = officers[w.index(max(w))]["officer"]
    mn = officers[w.index(min(w))]["officer"]
    detail = (
        f"{mx} has most shifts ({max(w)}), {mn} has fewest ({min(w)})"
        if max(w) != min(w) else "All officers have equal working days"
    )
    return {"score": score, "label": label, "detail": detail}

def _fatigue(officers: list) -> dict:
    if not officers:
        return {"score": 0, "label": "No data", "detail": ""}
    total_nights = sum(o.get("night", 0) for o in officers)
    total_mornings = sum(o.get("morning", 0) for o in officers)
    if total_nights + total_mornings == 0:
        return {"score": 0, "label": "No shifts", "detail": ""}
    
    fatigue_ratio = total_nights / (total_nights + total_mornings)
    score = min(100, int(fatigue_ratio * 150)) # Heuristic scale
    label = "High" if score > 70 else "Medium" if score > 40 else "Low"
    return {"score": score, "label": label, "detail": f"{int(fatigue_ratio*100)}% of shifts are night shifts"}

def _satisfaction(db: Session, team_id: int, year: int, month: int) -> dict:
    from ..models import LeaveRequest
    reqs = db.query(LeaveRequest).filter(
        LeaveRequest.team_id == team_id,
        LeaveRequest.start_date.like(f"{year}-{month:02d}%")
    ).all()
    if not reqs:
        return {"score": 100, "label": "Excellent", "detail": "No leave requests to review"}
    
    approved = sum(1 for r in reqs if r.status == "approved")
    rate = approved / len(reqs)
    score = int(rate * 100)
    label = "Excellent" if score >= 80 else "Good" if score >= 50 else "Poor"
    return {"score": score, "label": label, "detail": f"{score}% of leave requests approved"}


@router.get("/")
def analytics(
    year:        int = Query(default=0),
    month:       int = Query(default=0),
    months_back: int = Query(default=6),
    db:          Session = Depends(get_db),
    user:        User    = Depends(get_current_user),
):
    if not user.team_id:
        return {
            "current":  {"officers": [], "summary": {}, "exists": False},
            "trend":    [],
            "fairness": {"score": 0, "label": "No team", "detail": "You are not in a team"},
            "fatigue":  {"score": 0, "label": "No team", "detail": "You are not in a team"},
            "satisfaction": {"score": 0, "label": "No team", "detail": "You are not in a team"},
        }

    now = datetime.now()
    if year  == 0: year  = now.year
    if month == 0: month = now.month

    # Current month — team isolated
    current = _parse_month(user.team_id, year, month, db)

    # Trend — team isolated
    trend = []
    y, m = year, month
    for _ in range(months_back):
        d = _parse_month(user.team_id, y, m, db)
        trend.insert(0, {
            "label":   f"{MONTHS[m-1]} {y}",
            "year":    y,
            "month":   m,
            "summary": d.get("summary", {}),
        })
        m -= 1
        if m == 0:
            m = 12
            y -= 1

    return {
        "current":  current,
        "trend":    trend,
        "fairness": _fairness(current.get("officers", [])),
        "fatigue":  _fatigue(current.get("officers", [])),
        "satisfaction": _satisfaction(db, user.team_id, year, month),
    }