from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from typing import List, Optional
from ..database import get_db
from ..auth import get_current_user, get_role
from ..models import ShiftModel, User
from ..logger import logger

router = APIRouter(prefix="/api/shift-models", tags=["shift-models"])


class ShiftTypeIn(BaseModel):
    name:       str
    start_time: Optional[str] = None
    end_time:   Optional[str] = None
    count:      int           = 2
    color:      Optional[str] = "#6b7280"

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Shift name cannot be empty")
        return v.strip()

    @field_validator("count")
    @classmethod
    def count_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Officer count must be at least 1")
        return v


class ShiftModelIn(BaseModel):
    unit_name:            str
    shift_types:          List[ShiftTypeIn]
    working_days:         Optional[List[str]] = None
    max_concurrent_leave: int                 = 1
    night_continues:      bool                = True
    no_night_before_leave: bool               = False
    rotation_pattern:     Optional[List[str]] = None
    max_consecutive_workdays: int             = 6
    min_rest_hours_between_shifts: int        = 12

    @field_validator("unit_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Model name cannot be empty")
        return v.strip()

    @field_validator("max_concurrent_leave")
    @classmethod
    def leave_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Max concurrent leave must be at least 1")
        return v


def _assert_teamlead(user: User, db: Session):
    role = get_role(user, db)
    if role == "no_team":
        raise HTTPException(403, "You must be in a team to manage shift models")
    if role != "teamlead":
        raise HTTPException(403, "Only team leads can manage shift models")


def _to_dict(m: ShiftModel) -> dict:
    return {
        "id":                   m.id,
        "team_id":              m.team_id,
        "unit_name":            m.unit_name,
        "shift_types":          m.shift_types,
        "working_days":         m.working_days,
        "max_concurrent_leave": m.max_concurrent_leave,
        "night_continues":      m.night_continues,
        "no_night_before_leave": m.no_night_before_leave,
        "rotation_pattern":     m.rotation_pattern,
        "max_consecutive_workdays": m.max_consecutive_workdays if m.max_consecutive_workdays is not None else 6,
        "min_rest_hours_between_shifts": m.min_rest_hours_between_shifts if m.min_rest_hours_between_shifts is not None else 12,
    }


@router.get("/")
def list_models(
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if not user.team_id:
        return []
    return [
        _to_dict(m)
        for m in db.query(ShiftModel).filter(
            ShiftModel.team_id == user.team_id
        ).all()
    ]


@router.post("/")
def create_model(
    data: ShiftModelIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    _assert_teamlead(user, db)

    if db.query(ShiftModel).filter(
        ShiftModel.team_id   == user.team_id,
        ShiftModel.unit_name == data.unit_name,
    ).first():
        raise HTTPException(400, f"A model named '{data.unit_name}' already exists in your team")

    m = ShiftModel(
        team_id              = user.team_id,
        unit_name            = data.unit_name,
        shift_types          = [s.model_dump() for s in data.shift_types],
        working_days         = data.working_days,
        max_concurrent_leave = data.max_concurrent_leave,
        night_continues      = data.night_continues,
        no_night_before_leave = data.no_night_before_leave,
        rotation_pattern     = data.rotation_pattern,
        max_consecutive_workdays = data.max_consecutive_workdays,
        min_rest_hours_between_shifts = data.min_rest_hours_between_shifts,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    logger.info(f"Shift model created: '{m.unit_name}' team={user.team_id}")
    return _to_dict(m)


@router.put("/{model_id}")
def update_model(
    model_id: int,
    data:     ShiftModelIn,
    db:       Session = Depends(get_db),
    user:     User    = Depends(get_current_user),
):
    _assert_teamlead(user, db)
    m = db.query(ShiftModel).filter(
        ShiftModel.id      == model_id,
        ShiftModel.team_id == user.team_id,
    ).first()
    if not m:
        raise HTTPException(404, "Model not found in your team")
    m.unit_name            = data.unit_name
    m.shift_types          = [s.model_dump() for s in data.shift_types]
    m.working_days         = data.working_days
    m.max_concurrent_leave = data.max_concurrent_leave
    m.night_continues      = data.night_continues
    m.no_night_before_leave = data.no_night_before_leave
    m.rotation_pattern     = data.rotation_pattern
    m.max_consecutive_workdays = data.max_consecutive_workdays
    m.min_rest_hours_between_shifts = data.min_rest_hours_between_shifts
    db.commit()
    db.refresh(m)
    return _to_dict(m)


@router.delete("/{model_id}")
def delete_model(
    model_id: int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    _assert_teamlead(user, db)
    m = db.query(ShiftModel).filter(
        ShiftModel.id      == model_id,
        ShiftModel.team_id == user.team_id,
    ).first()
    if not m:
        raise HTTPException(404, "Model not found in your team")
    db.delete(m)
    db.commit()
    return {"message": f"'{m.unit_name}' deleted"}