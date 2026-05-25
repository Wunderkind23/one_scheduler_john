import os
import hashlib
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, Header, Depends
from sqlalchemy.orm import Session

from .database import get_db
from .models import User, Team

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "smo-sterling-secret-2024")
ALGORITHM  = "HS256"
EXPIRE_HRS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _prehash(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    return pwd_context.hash(_prehash(password))


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(_prehash(plain), hashed)


def create_token(data: dict) -> str:
    payload = {**data, "exp": datetime.now(timezone.utc) + timedelta(hours=EXPIRE_HRS)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _decode(token: str) -> dict:
    """Decode JWT. Accepts both raw token and 'Bearer token' format."""
    raw = token.strip()
    if raw.lower().startswith("bearer "):
        raw = raw[7:].strip()
    try:
        return jwt.decode(raw, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token. Please log in again.")


def get_current_user(
    authorization: str = Header(..., alias="authorization"),
    db: Session = Depends(get_db),
) -> User:
    payload = _decode(authorization)
    email = payload.get("sub")
    if not email:
        raise HTTPException(401, "Token is missing user identity")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(401, "User account not found. Please log in again.")
    return user

async def get_current_user_ws(token: str):
    from .database import SessionLocal
    db = SessionLocal()
    try:
        payload = _decode(token)
        email: str = payload.get("sub")
        if email is None:
            return None
        return db.query(User).filter(User.email == email).first()
    except Exception:
        return None
    finally:
        db.close()


def get_role(user: User, db: Session) -> str:
    """
    Role is NEVER stored — always derived live from DB.
    user.email == team.created_by  ->  teamlead
    user has team but isn't lead   ->  officer
    no team                        ->  no_team
    """
    if not user.team_id:
        return "no_team"
    team = db.query(Team).filter(Team.id == user.team_id).first()
    if not team:
        return "no_team"
    return "teamlead" if team.created_by == user.email else "officer"


def require_teamlead(
    authorization: str = Header(..., alias="authorization"),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency — enforces team lead role."""
    payload = _decode(authorization)
    email = payload.get("sub")
    if not email:
        raise HTTPException(401, "Token is missing user identity")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(401, "User account not found")
    if not user.team_id:
        raise HTTPException(403, "You must belong to a team to perform this action")
    role = get_role(user, db)
    if role != "teamlead":
        raise HTTPException(403, "This action requires Team Lead permission")
    return user