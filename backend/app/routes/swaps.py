import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user, get_role
from ..models import ShiftSwapRequest, Schedule, User, Officer, ShiftAssignment, Team
from ..logger import logger
from .notifications import create_notification

router = APIRouter(prefix="/api/swaps", tags=["swaps"])


class SwapCreate(BaseModel):
    target_name:    str
    requester_date: str
    target_date:    str
    reason:         Optional[str] = None
    schedule_id:    Optional[int] = None


class SwapResolve(BaseModel):
    action: str


def _dict(r: ShiftSwapRequest) -> dict:
    return {
        "id":             r.id,
        "team_id":        r.team_id,
        "schedule_id":    r.schedule_id,
        "requester_name": r.requester_name,
        "target_name":    r.target_name,
        "requester_date": r.requester_date,
        "target_date":    r.target_date,
        "requester_shift": getattr(r, "requester_shift", None),
        "target_shift":   getattr(r, "target_shift", None),
        "reason":         r.reason,
        "status":         r.status,
        "resolved_by":    r.resolved_by,
        "created_at":     str(r.created_at),
        "resolved_at":    str(r.resolved_at) if r.resolved_at else None,
    }


@router.get("/")
def list_swaps(
    status: Optional[str] = Query(None),
    db:     Session       = Depends(get_db),
    user:   User          = Depends(get_current_user),
):
    if not user.team_id:
        return []
    role = get_role(user, db)
    q = db.query(ShiftSwapRequest).filter(
        ShiftSwapRequest.team_id == user.team_id   # TEAM ISOLATION
    )
    if role != "teamlead":
        # Officers see only swaps where they are requester, target, or public swaps that are open
        o = db.query(Officer).filter(
            Officer.email   == user.email,
            Officer.team_id == user.team_id,
        ).first()
        officer_name = o.name if o else (user.display_name or user.email.split("@")[0])
        q = q.filter(
            (ShiftSwapRequest.requester_name == officer_name)
            | (ShiftSwapRequest.target_name == officer_name)
            | (ShiftSwapRequest.status == "open")
        )
    if status:
        q = q.filter(ShiftSwapRequest.status == status)
    return [_dict(r) for r in q.order_by(ShiftSwapRequest.created_at.desc()).limit(100).all()]


@router.post("/")
def create_swap(
    data: SwapCreate,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if not user.team_id:
        raise HTTPException(400, "You are not in a team")

    o = db.query(Officer).filter(
        Officer.email   == user.email,
        Officer.team_id == user.team_id,
        Officer.is_active == True,
    ).first()
    if not o:
        raise HTTPException(403, "You must be an active officer in the team to request a swap")
    
    requester_name = o.name
    requester = o

    is_public = not data.target_name or data.target_name.strip() in ["", "Open", "open", "None", "null"]

    if not is_public and requester_name == data.target_name:
        raise HTTPException(422, "You cannot swap a shift with yourself")

    # Verify requester is actually scheduled on their requested date
    req_assignment = db.query(ShiftAssignment).join(Schedule).filter(
        ShiftAssignment.officer_id == o.id,
        ShiftAssignment.date == data.requester_date,
        Schedule.team_id == user.team_id,
    ).first()
    
    if not req_assignment or req_assignment.shift_name == "Off" or req_assignment.is_leave:
        raise HTTPException(400, f"You are not scheduled for an active shift on {data.requester_date}")

    # Fatigue Protection: 12-hour rest rule (Night -> Morning)
    from datetime import date, timedelta
    
    def _check_fatigue(officer_id: int, swap_date: str, new_shift: str):
        try:
            d = date.fromisoformat(swap_date)
            prev_d = (d - timedelta(days=1)).isoformat()
            next_d = (d + timedelta(days=1)).isoformat()
            
            # Check previous day
            prev_assignment = db.query(ShiftAssignment).filter(
                ShiftAssignment.officer_id == officer_id, ShiftAssignment.date == prev_d
            ).first()
            if prev_assignment and "Night" in prev_assignment.shift_name and "Morning" in new_shift:
                return f"Working a Morning shift on {swap_date} after a Night shift on {prev_d} violates the 12-hour rest rule."
                
            # Check next day
            next_assignment = db.query(ShiftAssignment).filter(
                ShiftAssignment.officer_id == officer_id, ShiftAssignment.date == next_d
            ).first()
            if next_assignment and "Night" in new_shift and "Morning" in next_assignment.shift_name:
                return f"Working a Night shift on {swap_date} before a Morning shift on {next_d} violates the 12-hour rest rule."
        except ValueError:
            pass
        return None

    # Handle peer-to-peer checks vs public swap
    target_shift_name = None
    target_name_val = "Open"
    
    if not is_public:
        target_name_val = data.target_name
        # Verify target officer is in the same team
        target_officer = db.query(Officer).filter(
            Officer.name    == data.target_name,
            Officer.team_id == user.team_id,
            Officer.is_active == True,
        ).first()
        if not target_officer:
            raise HTTPException(404, f"Officer '{data.target_name}' not found in your team")

        # Verify target is actually scheduled on their requested date
        tgt_assignment = db.query(ShiftAssignment).join(Schedule).filter(
            ShiftAssignment.officer_id == target_officer.id,
            ShiftAssignment.date == data.target_date,
            Schedule.team_id == user.team_id,
        ).first()

        if not tgt_assignment or tgt_assignment.shift_name == "Off" or tgt_assignment.is_leave:
            raise HTTPException(400, f"Officer '{data.target_name}' is not scheduled for an active shift on {data.target_date}")

        target_shift_name = tgt_assignment.shift_name

        # Check requester fatigue
        req_fatigue = _check_fatigue(requester.id, data.target_date, target_shift_name)
        if req_fatigue:
            raise HTTPException(400, f"Fatigue Protection Blocked Swap: For {requester.name}, {req_fatigue}")
            
        # Check target fatigue
        tgt_fatigue = _check_fatigue(target_officer.id, data.requester_date, req_assignment.shift_name)
        if tgt_fatigue:
            raise HTTPException(400, f"Fatigue Protection Blocked Swap: For {target_officer.name}, {tgt_fatigue}")

    existing = db.query(ShiftSwapRequest).filter(
        ShiftSwapRequest.team_id        == user.team_id,
        ShiftSwapRequest.requester_name == requester_name,
        ShiftSwapRequest.requester_date == data.requester_date,
        ShiftSwapRequest.status         == "pending",
    ).first()
    if existing:
        raise HTTPException(400, "A pending swap request already exists for this date")

    # Validate schedule belongs to this team if provided
    if data.schedule_id:
        sched = db.query(Schedule).filter(
            Schedule.id      == data.schedule_id,
            Schedule.team_id == user.team_id,
        ).first()
        if not sched:
            raise HTTPException(404, "Schedule not found in your team")

    swap = ShiftSwapRequest(
        team_id        = user.team_id,
        schedule_id    = data.schedule_id,
        requester_name = requester_name,
        target_name    = target_name_val,
        requester_date = data.requester_date,
        target_date    = data.target_date,
        requester_shift = req_assignment.shift_name,
        target_shift    = target_shift_name,
        reason         = data.reason,
        status         = "open" if is_public else "pending"
    )
    db.add(swap)
    db.commit()
    db.refresh(swap)
    
    if not is_public and target_officer:
        create_notification(db, user.team_id, target_officer.email, f"{requester_name} wants to swap shifts with you on {data.target_date}.", link="/dashboard?tab=swaps")
    elif is_public:
        # Notify team lead
        team = db.query(Team).filter(Team.id == user.team_id).first()
        if team:
            create_notification(db, user.team_id, team.created_by, f"{requester_name} posted an open swap request for {data.requester_date}.", link="/dashboard?tab=swaps")

    return _dict(swap)


@router.put("/{swap_id}/claim")
def claim_swap(
    swap_id: int,
    db:      Session = Depends(get_db),
    user:    User    = Depends(get_current_user),
):
    if not user.team_id:
        raise HTTPException(400, "You are not in a team")

    swap = db.query(ShiftSwapRequest).filter(
        ShiftSwapRequest.id      == swap_id,
        ShiftSwapRequest.team_id == user.team_id,
    ).first()
    if not swap:
        raise HTTPException(404, "Swap request not found")

    if swap.status != "open":
        raise HTTPException(400, "This swap is not open for claiming")

    claimant = db.query(Officer).filter(
        Officer.email   == user.email,
        Officer.team_id == user.team_id,
        Officer.is_active == True,
    ).first()
    if not claimant:
        raise HTTPException(403, "You must be an active officer to claim a swap")

    if claimant.name == swap.requester_name:
        raise HTTPException(400, "You cannot claim your own swap request")

    # Verify claimant is scheduled on target_date
    tgt_assignment = db.query(ShiftAssignment).join(Schedule).filter(
        ShiftAssignment.officer_id == claimant.id,
        ShiftAssignment.date       == swap.target_date,
        Schedule.team_id           == user.team_id,
    ).first()

    if not tgt_assignment or tgt_assignment.shift_name == "Off" or tgt_assignment.is_leave:
        raise HTTPException(400, f"You are not scheduled for an active shift on {swap.target_date}")

    # Verify claimant is off on requester_date
    req_assignment_claimant = db.query(ShiftAssignment).join(Schedule).filter(
        ShiftAssignment.officer_id == claimant.id,
        ShiftAssignment.date       == swap.requester_date,
        Schedule.team_id           == user.team_id,
    ).first()
    if req_assignment_claimant and req_assignment_claimant.shift_name != "Off" and not req_assignment_claimant.is_leave:
        raise HTTPException(400, f"You are already scheduled to work on {swap.requester_date}")

    # Fatigue Protection: 12-hour rest rule
    from datetime import date, timedelta
    def _check_fatigue(officer_id: int, swap_date: str, new_shift: str):
        try:
            d = date.fromisoformat(swap_date)
            prev_d = (d - timedelta(days=1)).isoformat()
            next_d = (d + timedelta(days=1)).isoformat()
            
            # Check previous day
            prev_assignment = db.query(ShiftAssignment).filter(
                ShiftAssignment.officer_id == officer_id, ShiftAssignment.date == prev_d
            ).first()
            if prev_assignment and "Night" in prev_assignment.shift_name and "Morning" in new_shift:
                return f"Working a Morning shift on {swap_date} after a Night shift on {prev_d} violates the 12-hour rest rule."
                
            # Check next day
            next_assignment = db.query(ShiftAssignment).filter(
                ShiftAssignment.officer_id == officer_id, ShiftAssignment.date == next_d
            ).first()
            if next_assignment and "Night" in new_shift and "Morning" in next_assignment.shift_name:
                return f"Working a Night shift on {swap_date} before a Morning shift on {next_d} violates the 12-hour rest rule."
        except ValueError:
            pass
        return None

    # Check claimant fatigue working requester's shift
    claimant_fatigue = _check_fatigue(claimant.id, swap.requester_date, swap.requester_shift)
    if claimant_fatigue:
        raise HTTPException(400, f"Fatigue violation for claimant: {claimant_fatigue}")

    # Check requester fatigue working claimant's shift
    requester = db.query(Officer).filter(
        Officer.name    == swap.requester_name,
        Officer.team_id == user.team_id,
    ).first()
    if requester:
        req_fatigue = _check_fatigue(requester.id, swap.target_date, tgt_assignment.shift_name)
        if req_fatigue:
            raise HTTPException(400, f"Fatigue violation for requester: {req_fatigue}")

    # Update swap to pending
    swap.target_name = claimant.name
    swap.target_shift = tgt_assignment.shift_name
    swap.status = "pending"
    db.commit()
    db.refresh(swap)
    
    if requester:
        create_notification(db, user.team_id, requester.email, f"{claimant.name} has claimed your open swap. Waiting for team lead approval.", link="/dashboard?tab=swaps")
    
    team = db.query(Team).filter(Team.id == user.team_id).first()
    if team:
        create_notification(db, user.team_id, team.created_by, f"Swap between {requester.name} and {claimant.name} is ready for review.", link="/dashboard?tab=swaps")
        
    return _dict(swap)


@router.put("/{swap_id}/resolve")
def resolve_swap(
    swap_id: int,
    data:    SwapResolve,
    db:      Session = Depends(get_db),
    user:    User    = Depends(get_current_user),
):
    role = get_role(user, db)
    if role != "teamlead":
        raise HTTPException(403, "Only team leads can accept or reject swap requests")
    if data.action not in ("accept", "reject", "cancel"):
        raise HTTPException(422, "action must be: accept, reject, or cancel")

    # TEAM ISOLATION
    swap = db.query(ShiftSwapRequest).filter(
        ShiftSwapRequest.id      == swap_id,
        ShiftSwapRequest.team_id == user.team_id,
    ).first()
    if not swap:
        raise HTTPException(404, "Swap request not found in your team")
    if swap.status != "pending":
        raise HTTPException(400, f"This swap is already {swap.status}")

    if data.action == "accept":
        swap.status = "accepted"
        _apply_swap(swap, db, user.team_id)
    elif data.action == "reject":
        swap.status = "rejected"
    else:
        swap.status = "cancelled"

    swap.resolved_by = user.display_name or user.email
    swap.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(swap)
    
    req_officer = db.query(Officer).filter(Officer.name == swap.requester_name, Officer.team_id == user.team_id).first()
    tgt_officer = db.query(Officer).filter(Officer.name == swap.target_name, Officer.team_id == user.team_id).first()
    
    msg = f"Swap request for {swap.requester_date} was {swap.status}."
    if req_officer:
        create_notification(db, user.team_id, req_officer.email, msg, link="/dashboard?tab=swaps")
    if tgt_officer:
        create_notification(db, user.team_id, tgt_officer.email, msg, link="/dashboard?tab=swaps")
        
    return _dict(swap)


def _apply_swap(swap: ShiftSwapRequest, db: Session, team_id: int):
    from ..services.schedule_generator import sync_assignments_for_schedule

    # Identify unique year/months for the swap dates
    dates_to_swap = [swap.requester_date, swap.target_date]
    schedule_keys = set()
    for d_iso in dates_to_swap:
        try:
            y, m, _ = d_iso.split("-")
            schedule_keys.add((int(y), int(m)))
        except ValueError:
            pass

    for y, m in schedule_keys:
        # TEAM ISOLATION — only update schedules in this team
        s = db.query(Schedule).filter(
            Schedule.year    == y,
            Schedule.month   == m,
            Schedule.team_id == team_id,
        ).first()
        if not s:
            continue
            
        try:
            rows = json.loads(s.data)
            
            # Map dates to officer replacements for simultaneous swapping
            date_mappings = {}
            # Requester gives their shift on requester_date to target
            date_mappings.setdefault(swap.requester_date, {})[swap.requester_name] = swap.target_name
            # Target gives their shift on target_date to requester
            date_mappings.setdefault(swap.target_date, {})[swap.target_name] = swap.requester_name

            for row in rows:
                try:
                    row_iso = datetime.strptime(row["Date"], "%d-%b-%y").strftime("%Y-%m-%d")
                except Exception:
                    row_iso = row["Date"]
                
                if row_iso not in date_mappings:
                    continue
                    
                mapping = date_mappings[row_iso]
                for col in row:
                    if col in ["Date", "Day", "12AM - 7AM (prev night)"]:
                        continue
                    if not row[col]:
                        continue
                    entries = [e.strip() for e in row[col].split(", ") if e.strip()]
                    new_entries = []
                    for e in entries:
                        core_name = e.replace(" (Leave)", "").strip()
                        if core_name in mapping:
                            new_entries.append(e.replace(core_name, mapping[core_name]))
                        else:
                            new_entries.append(e)
                    row[col] = ", ".join(new_entries)
            
            s.data = json.dumps(rows)
            logger.info(f"Swap #{swap.id} applied to schedule #{s.id} (team {team_id})")
            
            # Sync assignments
            sync_assignments_for_schedule(s, db)
        except Exception as e:
            logger.error(f"Swap apply failed for schedule {s.id}: {e}")