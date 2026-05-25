"""
Auto-Draft Schedule Generator
Runs on a configurable day each month to auto-generate next month's schedule
for every team and save it as a draft (is_published=False).
"""
from datetime import date, timedelta
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models import Team, Officer, Schedule, ShiftModel, LeaveRequest, ShiftPreference, PublicHoliday, ShiftAssignment
from ..services.schedule_generator import generate_schedule, build_summary, sync_assignments_for_schedule, expand_leave_with_weekends_and_holidays
from ..logger import logger
import json
from sqlalchemy import func


def auto_generate_drafts():
    """Generate draft schedules for next month for all teams."""
    db: Session = SessionLocal()
    try:
        today = date.today()
        # Target next month
        if today.month == 12:
            target_year = today.year + 1
            target_month = 1
        else:
            target_year = today.year
            target_month = today.month + 1

        teams = db.query(Team).all()
        generated = 0

        for team in teams:
            # Skip if schedule already exists for this month
            existing = db.query(Schedule).filter(
                Schedule.team_id == team.id,
                Schedule.year    == target_year,
                Schedule.month   == target_month,
            ).first()
            if existing:
                logger.info(f"[AUTO-DRAFT] Schedule already exists for {team.name} {target_year}-{target_month:02d}, skipping.")
                continue

            # Get officers
            officers = db.query(Officer).filter(Officer.team_id == team.id).all()
            if not officers:
                logger.info(f"[AUTO-DRAFT] No officers for team {team.name}, skipping.")
                continue
            
            officer_names = [o.name for o in officers]

            # Get shift model (use the first one for the team, or default)
            shift_model = db.query(ShiftModel).filter(ShiftModel.team_id == team.id).first()

            # Get holidays
            holidays = db.query(PublicHoliday).filter(
                (PublicHoliday.team_id == team.id) | (PublicHoliday.team_id == None)
            ).all()
            holiday_dates = set()
            for y in range(target_year - 1, target_year + 2):
                for h in holidays:
                    if h.recurring:
                        try:
                            holiday_dates.add(date(y, h.month, h.day).isoformat())
                        except ValueError:
                            pass

            # Get approved leave requests
            leave_map = {}
            approved_leaves = db.query(LeaveRequest).filter(
                LeaveRequest.team_id == team.id,
                LeaveRequest.status == "approved",
            ).all()
            for req in approved_leaves:
                officer_name = req.officer_name
                try:
                    expanded = expand_leave_with_weekends_and_holidays(
                        [req.start_date, req.end_date], list(holiday_dates), extend_forward=True
                    )
                    if officer_name not in leave_map:
                        leave_map[officer_name] = []
                    for d in expanded:
                        if d not in leave_map[officer_name]:
                            leave_map[officer_name].append(d)
                except Exception:
                    pass

            # Get historical counts
            two_months_ago = (today - timedelta(days=60)).isoformat()
            historical_counts = {}
            shift_counts_query = db.query(
                Officer.name, func.count(ShiftAssignment.id)
            ).join(ShiftAssignment, Officer.id == ShiftAssignment.officer_id).filter(
                Officer.team_id == team.id,
                ShiftAssignment.is_leave == False,
                ShiftAssignment.shift_name != "Off",
                ShiftAssignment.date >= two_months_ago,
            ).group_by(Officer.name).all()
            for name, count in shift_counts_query:
                historical_counts[name] = count

            # Get preferences
            preferred_off = {}
            prefs = db.query(ShiftPreference).filter(
                ShiftPreference.team_id == team.id,
                ShiftPreference.year    == target_year,
                ShiftPreference.month   == target_month,
            ).all()
            for p in prefs:
                off = db.query(Officer).filter(Officer.id == p.officer_id).first()
                if off:
                    preferred_off[off.name] = json.loads(p.dates_json)

            # Get rotation offset
            last = db.query(Schedule).filter(
                Schedule.team_id == team.id
            ).order_by(Schedule.id.desc()).first()
            start_offset = last.rotation_offset if last else 0

            # Generate schedule
            try:
                schedule_data, next_offset = generate_schedule(
                    target_year, target_month, officer_names, leave_map,
                    shift_model, start_offset, False, historical_counts, preferred_off
                )

                new_schedule = Schedule(
                    team_id         = team.id,
                    created_by      = "system-auto-draft",
                    year            = target_year,
                    month           = target_month,
                    data            = json.dumps(schedule_data),
                    rotation_offset = next_offset,
                    is_published    = False,
                )
                db.add(new_schedule)
                db.commit()
                db.refresh(new_schedule)
                sync_assignments_for_schedule(new_schedule, db)

                generated += 1
                logger.info(f"[AUTO-DRAFT] Draft schedule created for {team.name} {target_year}-{target_month:02d}")
            except Exception as e:
                logger.error(f"[AUTO-DRAFT] Failed for {team.name}: {e}")
                db.rollback()

        logger.info(f"[AUTO-DRAFT] Completed. Generated {generated} draft schedules.")
    except Exception as e:
        logger.error(f"[AUTO-DRAFT] Critical error: {e}")
    finally:
        db.close()
