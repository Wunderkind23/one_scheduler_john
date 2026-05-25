from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from datetime import datetime, time, date

from ..database import get_db
from ..models import Schedule, User
from ..auth import get_current_user

router = APIRouter()

@router.get("/")
def export_calendar(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Exports the user's schedule for a specific month as an .ics file.
    """
    schedule = db.query(Schedule).filter(
        Schedule.team_id == user.team_id,
        Schedule.year == year,
        Schedule.month == month,
        Schedule.is_published == True
    ).first()

    if not schedule:
        raise HTTPException(status_code=404, detail="Published schedule not found for this month.")

    try:
        from ics import Calendar, Event
    except ImportError:
        raise HTTPException(status_code=500, detail="ics library not installed.")

    import json
    data = json.loads(schedule.data_json)
    
    cal = Calendar()
    
    for row in data:
        row_date_str = row.get("Date")
        if not row_date_str:
            continue
            
        row_date = datetime.strptime(row_date_str, "%Y-%m-%d").date()
        
        # Check all shifts in the row
        assigned_shift = None
        for key, value in row.items():
            if key in ["Date", "Day", "Off", "Leave"]:
                continue
            
            if value and user.display_name in [v.replace(" ★", "").strip() for v in value.split(",")]:
                assigned_shift = key
                break
                
        if assigned_shift:
            e = Event()
            e.name = f"Shift: {assigned_shift}"
            
            # Very basic time parsing based on string (e.g. "Morning (7AM - 5PM)")
            if "morning" in assigned_shift.lower() or "7am" in assigned_shift.lower():
                e.begin = datetime.combine(row_date, time(7, 0))
                e.end = datetime.combine(row_date, time(17, 0))
            elif "night" in assigned_shift.lower() or "5pm" in assigned_shift.lower():
                e.begin = datetime.combine(row_date, time(17, 0))
                # Next day 7 AM
                from datetime import timedelta
                e.end = datetime.combine(row_date + timedelta(days=1), time(7, 0))
            else:
                # Fallback to all-day event
                e.make_all_day()
                e.begin = row_date
            
            cal.events.add(e)
            
    # Serialize to string
    ics_string = cal.serialize()
    
    # Return as a file download
    filename = f"schedule_{year}_{month:02d}.ics"
    return Response(content=ics_string, media_type="text/calendar", headers={
        "Content-Disposition": f"attachment; filename={filename}"
    })
