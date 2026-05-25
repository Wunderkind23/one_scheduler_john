from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

from .database import Base, engine, get_db
from .models import User, Team, Officer
from .auth import hash_password, verify_password, create_token, get_current_user, get_role
from .middleware import LoggingMiddleware
from .logger import logger
from .routes.teams       import router as teams_router
from .routes.officers    import router as officers_router
from .routes.schedules   import router as schedules_router
from .routes.shiftmodels import router as shiftmodels_router
from .routes.settings    import router as settings_router
from .routes.emails      import router as emails_router
from .routes.holidays    import router as holidays_router
from .routes.swaps       import router as swaps_router
from .routes.leave_req   import router as leave_req_router
from .routes.my_schedule import router as my_schedule_router
from .routes.analytics   import router as analytics_router
from .routes.preferences import router as preferences_router
from .routes.notifications import router as notifications_router
from .routes.calendar    import router as calendar_router
from .routes.admin       import router as admin_router
from .routes.chat        import router as chat_router
from .tasks.apscheduler  import start_scheduler

Base.metadata.create_all(bind=engine)

def run_migrations():
    from sqlalchemy import text
    with engine.begin() as conn:
        try:
            conn.execute(text("SELECT max_consecutive_workdays FROM shift_models LIMIT 1"))
        except Exception:
            logger.info("Migrating: adding max_consecutive_workdays to shift_models")
            try:
                conn.execute(text("ALTER TABLE shift_models ADD COLUMN max_consecutive_workdays INTEGER DEFAULT 6"))
            except Exception as e:
                logger.warning(f"Failed to add max_consecutive_workdays: {e}")
                
        try:
            conn.execute(text("SELECT min_rest_hours_between_shifts FROM shift_models LIMIT 1"))
        except Exception:
            logger.info("Migrating: adding min_rest_hours_between_shifts to shift_models")
            try:
                conn.execute(text("ALTER TABLE shift_models ADD COLUMN min_rest_hours_between_shifts INTEGER DEFAULT 12"))
            except Exception as e:
                logger.warning(f"Failed to add min_rest_hours_between_shifts: {e}")

        try:
            conn.execute(text("SELECT is_superadmin FROM users LIMIT 1"))
        except Exception:
            logger.info("Migrating: adding is_superadmin to users")
            try:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_superadmin BOOLEAN DEFAULT FALSE"))
            except Exception as e:
                logger.warning(f"Failed to add is_superadmin: {e}")

run_migrations()

app = FastAPI(title="SMO Team Scheduler", version="4.0.0")

app.add_middleware(LoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000",
                   "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(teams_router)
app.include_router(officers_router)
app.include_router(schedules_router)
app.include_router(shiftmodels_router)
app.include_router(settings_router)
app.include_router(emails_router)
app.include_router(holidays_router)
app.include_router(swaps_router)
app.include_router(leave_req_router)
app.include_router(my_schedule_router)
app.include_router(analytics_router)
app.include_router(preferences_router)
app.include_router(calendar_router, prefix="/api/calendar", tags=["calendar"])
app.include_router(notifications_router)
app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
app.include_router(chat_router, prefix="/api/chat", tags=["chat"])


@app.on_event("startup")
async def startup():
    start_scheduler()
    logger.info("SMO Team Scheduler v4.0 started")


class LoginRequest(BaseModel):
    email:    str
    password: str


@app.post("/login", tags=["auth"])
def login(data: LoginRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()

    if not email.endswith("@sterling.ng"):
        raise HTTPException(401, "Only @sterling.ng email addresses are allowed")

    user = db.query(User).filter(User.email == email).first()

    if user:
        if not verify_password(data.password, user.password):
            raise HTTPException(401, "Incorrect password")
    else:
        local   = email.split("@")[0]
        display = " ".join(p.capitalize() for p in local.split("."))
        user    = User(email=email, password=hash_password(data.password), display_name=display)
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"Auto-registered: {email}")

    role = get_role(user, db)
    team = db.query(Team).filter(Team.id == user.team_id).first() if user.team_id else None
    token = create_token({"sub": user.email})
    logger.info(f"Login: {email} role={role} team={team.name if team else None}")

    return {
        "token":        token,
        "email":        user.email,
        "display_name": user.display_name or email,
        "role":         role,
        "team_id":      user.team_id,
        "team_name":    team.name if team else None,
        "is_superadmin": getattr(user, "is_superadmin", False),
    }


@app.get("/me", tags=["auth"])
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    role = get_role(user, db)
    team = db.query(Team).filter(Team.id == user.team_id).first() if user.team_id else None
    return {
        "email":        user.email,
        "display_name": user.display_name,
        "role":         role,
        "team_id":      user.team_id,
        "team_name":    team.name if team else None,
        "is_superadmin": getattr(user, "is_superadmin", False),
    }


@app.get("/", tags=["health"])
def root():
    return {"message": "SMO Team Scheduler v4.0 is running"}