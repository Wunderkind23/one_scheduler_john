from pydantic import BaseModel, field_validator
from typing import List, Optional, Any, Dict


class UserLogin(BaseModel):
    email:    str
    password: str


class TokenResponse(BaseModel):
    token:        str
    display_name: Optional[str] = None
    role:         str           = "team_lead"
    officer_id:   Optional[int] = None


class ShiftTypeConfig(BaseModel):
    name:       str
    start_time: Optional[str] = None
    end_time:   Optional[str] = None
    count:      int           = 2
    color:      Optional[str] = None


class ShiftModelCreate(BaseModel):
    unit_name:            str
    shift_types:          List[ShiftTypeConfig]
    working_days:         Optional[List[str]] = None
    pattern_type:         str                 = "rotation"
    enforce_pattern:      bool                = False
    max_concurrent_leave: int                 = 1
    night_continues:      bool                = True
    no_night_before_leave: bool               = False
    max_consecutive_workdays: int             = 6
    min_rest_hours_between_shifts: int        = 12


class ShiftModelResponse(ShiftModelCreate):
    id: int

    class Config:
        from_attributes = True


class LeaveEntry(BaseModel):
    officer: str
    dates:   List[str]


class GenerateRequest(BaseModel):
    year:           int
    month:          int
    officers:       List[str]
    leave_schedule: List[LeaveEntry] = []
    unit_name:      Optional[str]    = None
    reset_rotation: bool             = False


class ScheduleSaveRequest(BaseModel):
    unit_name:       Optional[str]       = None
    year:            int
    month:           int
    data:            List[Dict[str, Any]]
    rotation_offset: int                 = 0


class AutoSendSettings(BaseModel):
    send_day:          int
    send_hour:         int = 8
    auto_generate_day: int = 25

    @field_validator("send_day", "auto_generate_day")
    @classmethod
    def valid_day(cls, v: int) -> int:
        if not (1 <= v <= 28):
            raise ValueError("Day must be 1-28")
        return v

    @field_validator("send_hour")
    @classmethod
    def valid_hour(cls, v: int) -> int:
        if not (0 <= v <= 23):
            raise ValueError("Hour must be 0-23")
        return v


class PublicHolidayCreate(BaseModel):
    name:      str
    month:     int
    day:       int
    recurring: bool          = True
    year:      Optional[int] = None


class PublicHolidayResponse(BaseModel):
    id:        int
    name:      str
    date:      str
    month:     int
    day:       int
    recurring: bool
    year:      Optional[int]

    class Config:
        from_attributes = True


class ShiftSwapCreate(BaseModel):
    requester_name: str
    target_name:    str
    requester_date: str
    target_date:    str
    reason:         Optional[str] = None
    schedule_id:    Optional[int] = None


class SwapResolve(BaseModel):
    action:      str
    resolved_by: str


class LeaveRequestCreate(BaseModel):
    officer_name:  str
    officer_email: str
    start_date:    str
    end_date:      str
    reason:        Optional[str] = None


class LeaveRequestResolve(BaseModel):
    action:      str   # "approve" | "reject"
    resolved_by: str


class LeaveRequestResponse(BaseModel):
    id:            int
    officer_name:  str
    officer_email: str
    start_date:    str
    end_date:      str
    reason:        Optional[str]
    status:        str
    resolved_by:   Optional[str]
    created_at:    str
    resolved_at:   Optional[str]

    class Config:
        from_attributes = True