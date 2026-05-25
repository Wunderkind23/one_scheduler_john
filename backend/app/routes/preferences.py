"""
Officer Shift Preferences — preferred days off for a given month.
Officers submit dates they'd prefer not to work; the generator will
try to honor them without breaking coverage.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user, get_role
from ..models import ShiftPreference, Officer, User
import json

router = APIRouter(prefix="/api/preferences", tags=["preferences"])


class PreferenceCreate(BaseModel):
    year: int
    month: int
    preferred_off_dates: List[str]  # ["2026-06-05", "2026-06-12", ...]


def _dict(p: ShiftPreference) -> dict:
    return {
        "id":         p.id,
        "team_id":    p.team_id,
        "officer_id": p.officer_id,
        "year":       p.year,
        "month":      p.month,
        "preferred_off_dates": json.loads(p.dates_json),
        "created_at": str(p.created_at),
    }


@router.get("/")
def list_preferences(
    year:  Optional[int] = None,
    month: Optional[int] = None,
    db:    Session       = Depends(get_db),
    user:  User          = Depends(get_current_user),
):
    if not user.team_id:
        return []

    role = get_role(user, db)

    # Find the officer record for the current user
    officer = db.query(Officer).filter(
        Officer.email   == user.email,
        Officer.team_id == user.team_id,
    ).first()

    q = db.query(ShiftPreference).filter(
        ShiftPreference.team_id == user.team_id,
    )

    # Officers see only their own preferences
    if role != "teamlead" and officer:
        q = q.filter(ShiftPreference.officer_id == officer.id)

    if year:
        q = q.filter(ShiftPreference.year == year)
    if month:
        q = q.filter(ShiftPreference.month == month)

    prefs = q.order_by(ShiftPreference.created_at.desc()).all()

    # Enrich with officer name
    results = []
    for p in prefs:
        d = _dict(p)
        off = db.query(Officer).filter(Officer.id == p.officer_id).first()
        d["officer_name"] = off.name if off else "Unknown"
        results.append(d)
    return results


@router.post("/")
def create_preference(
    data: PreferenceCreate,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if not user.team_id:
        raise HTTPException(400, "You are not in a team")

    officer = db.query(Officer).filter(
        Officer.email   == user.email,
        Officer.team_id == user.team_id,
    ).first()
    if not officer:
        raise HTTPException(404, "Officer record not found for your account")

    if len(data.preferred_off_dates) > 10:
        raise HTTPException(400, "You can submit a maximum of 10 preferred off dates per month")

    # Upsert — replace any existing preference for this officer/month
    existing = db.query(ShiftPreference).filter(
        ShiftPreference.team_id    == user.team_id,
        ShiftPreference.officer_id == officer.id,
        ShiftPreference.year       == data.year,
        ShiftPreference.month      == data.month,
    ).first()

    if existing:
        existing.dates_json = json.dumps(data.preferred_off_dates)
        db.commit()
        db.refresh(existing)
        return _dict(existing)

    pref = ShiftPreference(
        team_id    = user.team_id,
        officer_id = officer.id,
        year       = data.year,
        month      = data.month,
        dates_json = json.dumps(data.preferred_off_dates),
    )
    db.add(pref)
    db.commit()
    db.refresh(pref)
    return _dict(pref)


@router.delete("/{pref_id}")
def delete_preference(
    pref_id: int,
    db:      Session = Depends(get_db),
    user:    User    = Depends(get_current_user),
):
    pref = db.query(ShiftPreference).filter(
        ShiftPreference.id      == pref_id,
        ShiftPreference.team_id == user.team_id,
    ).first()
    if not pref:
        raise HTTPException(404, "Preference not found")

    role = get_role(user, db)
    officer = db.query(Officer).filter(
        Officer.email   == user.email,
        Officer.team_id == user.team_id,
    ).first()

    if role != "teamlead" and (not officer or pref.officer_id != officer.id):
        raise HTTPException(403, "You can only delete your own preferences")

    db.delete(pref)
    db.commit()
    return {"message": "Preference deleted"}
