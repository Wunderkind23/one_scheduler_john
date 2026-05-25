import json
from datetime import date as date_type
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user, require_teamlead
from ..models import User, Schedule, Officer, ShiftModel, ShiftAssignment, PublicHoliday
from ..services.schedule_generator import (
    generate_schedule, build_summary, extract_assignments,
    check_coverage, expand_leave_with_weekends_and_holidays,
)
from ..logger import logger

router = APIRouter(prefix="/api/schedules", tags=["schedules"])
SMO_MAX_LEAVE = 1


class LeaveEntry(BaseModel):
    officer: str
    dates:   List[str]


class GenerateRequest(BaseModel):
    year:           int
    month:          int
    leave_schedule: List[LeaveEntry] = []
    shift_model_id: Optional[int]   = None
    reset_rotation: bool             = False
    exclude_team_lead: bool          = False
    no_night_before_leave: bool      = False
    use_ai: bool                     = False


class SaveRequest(BaseModel):
    year:            int
    month:           int
    data:            List[Dict[str, Any]]
    rotation_offset: int = 0


def _holiday_dates(team_id: int, year: int, month: int, db: Session):
    holidays = db.query(PublicHoliday).filter(
        PublicHoliday.month == month,
        (PublicHoliday.team_id == team_id) | (PublicHoliday.team_id == None),
    ).all()
    dates = set()
    for h in holidays:
        if h.recurring:
            try:
                dates.add(date_type(year, h.month, h.day).isoformat())
            except ValueError:
                pass
        elif h.year == year:
            dates.add(h.date)
    return dates


@router.post("/preview")
def preview(
    data: GenerateRequest,
    db:   Session = Depends(get_db),
    user: User    = Depends(require_teamlead),
):
    # All officers — ONLY from this team
    officers_query = db.query(Officer).filter(
        Officer.team_id   == user.team_id,
        Officer.is_active == True,
    )
    if data.exclude_team_lead:
        officers_query = officers_query.filter(Officer.is_teamlead == False)
        
    officers = officers_query.all()
    if not officers:
        raise HTTPException(422, "No officers available for scheduling in your team.")

    officer_names = [o.name for o in officers]

    # Shift model — ONLY from this team
    shift_model = None
    if data.shift_model_id:
        shift_model = db.query(ShiftModel).filter(
            ShiftModel.id      == data.shift_model_id,
            ShiftModel.team_id == user.team_id,
        ).first()
        if not shift_model:
            raise HTTPException(404, "Shift model not found or does not belong to your team")

    max_concurrent = (
        getattr(shift_model, "max_concurrent_leave", SMO_MAX_LEAVE)
        if shift_model else SMO_MAX_LEAVE
    )
    holiday_dates = _holiday_dates(user.team_id, data.year, data.month, db)

    raw_leave = {e.officer: e.dates for e in data.leave_schedule}
    leave_map = {
        officer: expand_leave_with_weekends_and_holidays(dates, holiday_dates, extend_forward=True)
        for officer, dates in raw_leave.items()
    }

    # Automatically pull approved leave requests for this team
    from ..models import LeaveRequest
    approved_leaves = db.query(LeaveRequest).filter(
        LeaveRequest.team_id == user.team_id,
        LeaveRequest.status == "approved"
    ).all()

    for req in approved_leaves:
        officer = req.officer_name
        # The LeaveRequest only has start_date and end_date.
        # expand_leave_with_weekends_and_holidays will correctly fill all dates between start and end.
        expanded_db_dates = expand_leave_with_weekends_and_holidays([req.start_date, req.end_date], holiday_dates, extend_forward=True)
        
        if officer not in leave_map:
            leave_map[officer] = []
        
        for d in expanded_db_dates:
            if d not in leave_map[officer]:
                leave_map[officer].append(d)

    problems = check_coverage(leave_map, max_concurrent)
    errors   = [p for p in problems if p["severity"] == "error"]
    warnings = [p for p in problems if p["severity"] == "warning"]

    if errors:
        raise HTTPException(
            422,
            f"Leave conflict: {len(errors)} date(s) exceed the max {max_concurrent} "
            f"officer(s) on leave. First conflict on {errors[0]['date']}: "
            f"{', '.join(errors[0]['officers_on_leave'])}. "
            f"Reduce leave days or increase the max leave limit in your shift model."
        )

    # Rotation continues from last saved schedule for THIS TEAM ONLY
    start_offset = 0
    if not data.reset_rotation:
        last = db.query(Schedule).filter(
            Schedule.team_id == user.team_id
        ).order_by(Schedule.id.desc()).first()
        if last:
            start_offset = last.rotation_offset

    # Historical Fairness Engine: Fetch shift counts from the last 2 months
    from sqlalchemy import func
    from datetime import date, timedelta
    two_months_ago = (date.today() - timedelta(days=60)).isoformat()
    
    historical_counts = {}
    shift_counts_query = db.query(
        Officer.name, func.count(ShiftAssignment.id)
    ).join(ShiftAssignment, Officer.id == ShiftAssignment.officer_id)\
     .filter(
         Officer.team_id == user.team_id,
         ShiftAssignment.is_leave == False,
         ShiftAssignment.shift_name != "Off",
         ShiftAssignment.date >= two_months_ago
    ).group_by(Officer.name).all()
    
    for name, count in shift_counts_query:
        historical_counts[name] = count

    # Fetch officer preferences for this month
    from ..models import ShiftPreference
    preferred_off = {}
    prefs = db.query(ShiftPreference).filter(
        ShiftPreference.team_id == user.team_id,
        ShiftPreference.year    == data.year,
        ShiftPreference.month   == data.month,
    ).all()
    for p in prefs:
        off = db.query(Officer).filter(Officer.id == p.officer_id).first()
        if off:
            import json as _json
            preferred_off[off.name] = _json.loads(p.dates_json)

    if data.use_ai:
        from ..services.ai_optimizer import optimize_schedule
        try:
            schedule_data, next_offset = optimize_schedule(
                data.year, data.month, officer_names, leave_map, shift_model, historical_counts, preferred_off, data.no_night_before_leave
            )
        except Exception as e:
            raise HTTPException(422, f"AI Optimizer failed: {str(e)}")
    else:
        schedule_data, next_offset = generate_schedule(
            data.year, data.month, officer_names, leave_map, shift_model, start_offset, data.no_night_before_leave, historical_counts, preferred_off
        )
    
    summary = build_summary(schedule_data)

    logger.info(f"[PREVIEW] team={user.team_id} {data.year}-{data.month:02d} officers={len(officer_names)}")
    return {
        "schedule":      schedule_data,
        "summary":       summary,
        "next_offset":   next_offset,
        "officers_used": officer_names,
        "warnings":      warnings,
        "holidays":      list(holiday_dates),
        "leave_map":     leave_map,
    }


@router.post("/save")
def save_schedule(
    data: SaveRequest,
    db:   Session = Depends(get_db),
    user: User    = Depends(require_teamlead),
):
    # Replace existing schedule for same month — ONLY within this team
    existing = db.query(Schedule).filter(
        Schedule.team_id == user.team_id,
        Schedule.year    == data.year,
        Schedule.month   == data.month,
    ).first()
    if existing:
        db.delete(existing)
        db.flush()

    new_s = Schedule(
        team_id         = user.team_id,
        created_by      = user.email,
        year            = data.year,
        month           = data.month,
        data            = json.dumps(data.data),
        rotation_offset = data.rotation_offset,
    )
    db.add(new_s)
    db.flush()

    # Assignments — ONLY officers from this team
    officers = db.query(Officer).filter(
        Officer.team_id   == user.team_id,
        Officer.is_active == True,
    ).all()
    for a in extract_assignments(data.data):
        o = next((x for x in officers if x.name == a["officer_name"]), None)
        if o:
            db.add(ShiftAssignment(
                schedule_id = new_s.id,
                officer_id  = o.id,
                date        = a["date_iso"],
                shift_name  = a["shift_name"],
                is_leave    = a["is_leave"],
            ))
            o.last_assigned_shift = a["shift_name"]

    db.commit()
    db.refresh(new_s)
    logger.info(f"[SAVE] team={user.team_id} {data.year}-{data.month:02d} id={new_s.id}")
    return {"message": "Schedule saved", "id": new_s.id}


@router.get("/")
def list_schedules(
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    """Returns ONLY schedules belonging to the logged-in user's team."""
    if not user.team_id:
        return []
    rows = db.query(Schedule).filter(
        Schedule.team_id == user.team_id   # STRICT TEAM ISOLATION
    ).order_by(Schedule.year.desc(), Schedule.month.desc()).all()
    return [
        {
            "id":                 s.id,
            "year":               s.year,
            "month":              s.month,
            "monthly_email_sent": s.monthly_email_sent,
            "rotation_offset":    s.rotation_offset,
            "is_published":       s.is_published if s.is_published is not None else True,
        }
        for s in rows
    ]


@router.get("/{schedule_id}")
def get_schedule(
    schedule_id: int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    """
    Fetch a specific schedule.
    TEAM ISOLATION: team_id is always checked — a user can NEVER
    access a schedule from another team even with a valid token.
    """
    if not user.team_id:
        raise HTTPException(403, "You are not in a team")

    s = db.query(Schedule).filter(
        Schedule.id      == schedule_id,
        Schedule.team_id == user.team_id,   # STRICT TEAM ISOLATION
    ).first()
    if not s:
        raise HTTPException(404, "Schedule not found or you do not have access to it")

    return {
        "id":                 s.id,
        "year":               s.year,
        "month":              s.month,
        "data":               json.loads(s.data),
        "monthly_email_sent": s.monthly_email_sent,
        "is_published":       s.is_published if s.is_published is not None else True,
    }


@router.put("/{schedule_id}/publish")
def publish_schedule(
    schedule_id: int,
    db:   Session = Depends(get_db),
    user: User    = Depends(require_teamlead),
):
    """Publish a draft schedule so officers can see it."""
    s = db.query(Schedule).filter(
        Schedule.id      == schedule_id,
        Schedule.team_id == user.team_id,
    ).first()
    if not s:
        raise HTTPException(404, "Schedule not found")
    s.is_published = True
    db.commit()
    logger.info(f"[PUBLISH] Schedule #{s.id} published by {user.email}")
    
    from .notifications import create_notification
    officers = db.query(Officer).filter(Officer.team_id == user.team_id, Officer.is_active == True).all()
    for o in officers:
        create_notification(db, user.team_id, o.email, f"The schedule for {s.month}/{s.year} has been published.", link="/dashboard")
        
    return {"message": "Schedule published", "id": s.id}


@router.post("/auto-draft")
def trigger_auto_draft(
    db:   Session = Depends(get_db),
    user: User    = Depends(require_teamlead),
):
    """Manually trigger auto-draft generation for next month."""
    from ..services.auto_draft import auto_generate_drafts
    auto_generate_drafts()
    return {"message": "Auto-draft generation triggered"}