from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Text, JSON, DateTime
from sqlalchemy.orm import relationship
from .database import Base


class Team(Base):
    """
    One team per schedule group.
    created_by = email of the team lead.
    Role is determined dynamically: user.email == team.created_by → TeamLead
    """
    __tablename__ = "teams"
    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, unique=True, nullable=False)
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    officers  = relationship("Officer",  back_populates="team", cascade="all, delete-orphan")
    schedules = relationship("Schedule", back_populates="team", cascade="all, delete-orphan")


class User(Base):
    """Login user. Role is NEVER stored — always derived from team.created_by."""
    __tablename__ = "users"
    id           = Column(Integer, primary_key=True, index=True)
    email        = Column(String, unique=True, index=True, nullable=False)
    password     = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    team_id      = Column(Integer, ForeignKey("teams.id"), nullable=True)
    is_superadmin = Column(Boolean, default=False)
    team         = relationship("Team", foreign_keys=[team_id])


class Officer(Base):
    """Team member including the team lead. Appears in every schedule."""
    __tablename__ = "officers"
    id                  = Column(Integer, primary_key=True, index=True)
    name                = Column(String, nullable=False)
    email               = Column(String, nullable=False)
    team_id             = Column(Integer, ForeignKey("teams.id"), nullable=False)
    is_active           = Column(Boolean, default=True)
    last_assigned_shift = Column(String, nullable=True)
    created_at          = Column(DateTime, default=datetime.utcnow)

    team        = relationship("Team", back_populates="officers")
    assignments = relationship("ShiftAssignment", back_populates="officer", cascade="all, delete-orphan")


class ShiftModel(Base):
    """Custom shift configuration per team."""
    __tablename__ = "shift_models"
    id                   = Column(Integer, primary_key=True, index=True)
    team_id              = Column(Integer, ForeignKey("teams.id"), nullable=False)
    unit_name            = Column(String, nullable=False)
    shift_types          = Column(JSON, nullable=False)
    working_days         = Column(JSON, nullable=True)
    max_concurrent_leave = Column(Integer, default=1)
    night_continues      = Column(Boolean, default=True)
    no_night_before_leave = Column(Boolean, default=False)
    rotation_pattern     = Column(JSON, nullable=True)  # List of shift names or "Off"
    max_consecutive_workdays = Column(Integer, default=6)
    min_rest_hours_between_shifts = Column(Integer, default=12)

    @property
    def morning_count(self):
        for s in (self.shift_types or []):
            if s.get("name") == "Morning":
                return int(s.get("count", 2))
        return 2

    @property
    def night_count(self):
        for s in (self.shift_types or []):
            if s.get("name") == "Night":
                return int(s.get("count", 2))
        return 2


class Schedule(Base):
    """One schedule per month per team."""
    __tablename__ = "schedules"
    id                 = Column(Integer, primary_key=True, index=True)
    team_id            = Column(Integer, ForeignKey("teams.id"), nullable=False)
    created_by         = Column(String, nullable=False)
    year               = Column(Integer, nullable=False)
    month              = Column(Integer, nullable=False)
    data               = Column(Text, nullable=False)
    rotation_offset    = Column(Integer, default=0)
    monthly_email_sent = Column(Boolean, default=False)
    is_published       = Column(Boolean, default=True)
    created_at         = Column(DateTime, default=datetime.utcnow)

    team        = relationship("Team", back_populates="schedules")
    assignments = relationship("ShiftAssignment", back_populates="schedule", cascade="all, delete-orphan")


class ShiftAssignment(Base):
    __tablename__ = "shift_assignments"
    id          = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=False)
    officer_id  = Column(Integer, ForeignKey("officers.id"), nullable=False)
    date        = Column(String, nullable=False)
    shift_name  = Column(String, nullable=False)
    is_leave    = Column(Boolean, default=False)

    schedule = relationship("Schedule", back_populates="assignments")
    officer  = relationship("Officer",  back_populates="assignments")


class EmailLog(Base):
    __tablename__ = "email_logs"
    id         = Column(Integer, primary_key=True, index=True)
    officer_id = Column(Integer, ForeignKey("officers.id"), nullable=False)
    email_type = Column(String, nullable=False)
    subject    = Column(String, nullable=True)
    year       = Column(Integer, nullable=True)
    month      = Column(Integer, nullable=True)
    sent_at    = Column(DateTime, default=datetime.utcnow)
    success    = Column(Boolean, default=True)


class PublicHoliday(Base):
    __tablename__ = "public_holidays"
    id        = Column(Integer, primary_key=True, index=True)
    team_id   = Column(Integer, ForeignKey("teams.id"), nullable=True)
    name      = Column(String, nullable=False)
    date      = Column(String, nullable=False)
    month     = Column(Integer, nullable=False)
    day       = Column(Integer, nullable=False)
    recurring = Column(Boolean, default=True)
    year      = Column(Integer, nullable=True)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    id            = Column(Integer, primary_key=True, index=True)
    team_id       = Column(Integer, ForeignKey("teams.id"), nullable=False)
    officer_email = Column(String, nullable=False)
    officer_name  = Column(String, nullable=False)
    start_date    = Column(String, nullable=False)
    end_date      = Column(String, nullable=False)
    reason        = Column(String, nullable=True)
    status        = Column(String, default="pending")
    reviewed_by   = Column(String, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    reviewed_at   = Column(DateTime, nullable=True)


class ShiftSwapRequest(Base):
    __tablename__ = "shift_swap_requests"
    id             = Column(Integer, primary_key=True, index=True)
    team_id        = Column(Integer, ForeignKey("teams.id"), nullable=False)
    schedule_id    = Column(Integer, ForeignKey("schedules.id"), nullable=True)
    requester_name = Column(String, nullable=False)
    target_name    = Column(String, nullable=True)
    requester_date = Column(String, nullable=False)
    target_date    = Column(String, nullable=False)
    requester_shift = Column(String, nullable=True)
    target_shift    = Column(String, nullable=True)
    reason         = Column(String, nullable=True)
    status         = Column(String, default="pending")
    resolved_by    = Column(String, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
    resolved_at    = Column(DateTime, nullable=True)


class ShiftPreference(Base):
    __tablename__ = "shift_preferences"
    id          = Column(Integer, primary_key=True, index=True)
    team_id     = Column(Integer, ForeignKey("teams.id"), nullable=False)
    officer_id  = Column(Integer, ForeignKey("officers.id"), nullable=False)
    year        = Column(Integer, nullable=False)
    month       = Column(Integer, nullable=False)
    dates_json  = Column(String, nullable=False) # JSON array of date strings
    created_at  = Column(DateTime, default=datetime.utcnow)

class AppSettings(Base):
    __tablename__ = "app_settings"
    id      = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    key     = Column(String, nullable=False)
    value   = Column(String, nullable=True)


class Notification(Base):
    __tablename__ = "notifications"
    id         = Column(Integer, primary_key=True, index=True)
    team_id    = Column(Integer, ForeignKey("teams.id"), nullable=False)
    user_email = Column(String, nullable=False)
    message    = Column(String, nullable=False)
    is_read    = Column(Boolean, default=False)
    link       = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class AppNotification(Base):
    __tablename__ = "app_notifications"
    id         = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True)
    title      = Column(String)
    message    = Column(String)
    is_read    = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True)
    endpoint = Column(String)
    p256dh = Column(String)
    auth = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)