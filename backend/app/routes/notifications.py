from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user
from ..models import Notification, User, PushSubscription
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import json
import os
import logging
try:
    from pywebpush import webpush, WebPushException
    HAS_WEBPUSH = True
except ImportError:
    HAS_WEBPUSH = False
    webpush = None
    WebPushException = Exception

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "uE2-yF_QG_L_8aLg1j9EZb_r9h1VpXpQoHw8e4L8x9I")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "BGh-J7kL9_H8k7uP_aF5yE_8L3yN9jQ4T_zR5vU9L1w2eJ_3qV5cZ_7sM4vX_6bA2tV_9yK_6H3rL_5nP_3tF_4=")

class PushSubReq(BaseModel):
    endpoint: str
    p256dh: str
    auth: str

class NotificationResponse(BaseModel):
    id: int
    message: str
    is_read: bool
    link: Optional[str] = None
    created_at: datetime

    class Config:
        orm_mode = True

@router.get("/", response_model=List[NotificationResponse])
def get_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.team_id:
        return []
    notifications = db.query(Notification).filter(
        Notification.team_id == user.team_id,
        Notification.user_email == user.email
    ).order_by(Notification.created_at.desc()).limit(50).all()
    return notifications

@router.put("/mark-read")
def mark_notifications_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.team_id:
        return {"status": "ok"}
    db.query(Notification).filter(
        Notification.team_id == user.team_id,
        Notification.user_email == user.email,
        Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"status": "ok"}

@router.post("/subscribe")
def subscribe_push(
    sub: PushSubReq,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    existing = db.query(PushSubscription).filter(PushSubscription.endpoint == sub.endpoint).first()
    if not existing:
        new_sub = PushSubscription(
            user_email=user.email,
            endpoint=sub.endpoint,
            p256dh=sub.p256dh,
            auth=sub.auth
        )
        db.add(new_sub)
        db.commit()
    return {"status": "ok"}

def create_notification(db: Session, team_id: int, user_email: str, message: str, link: Optional[str] = None):
    notif = Notification(
        team_id=team_id,
        user_email=user_email,
        message=message,
        link=link
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    
    if HAS_WEBPUSH:
        try:
            subs = db.query(PushSubscription).filter(PushSubscription.user_email == user_email).all()
            for sub in subs:
                try:
                    webpush(
                        subscription_info={
                            "endpoint": sub.endpoint,
                            "keys": {
                                "p256dh": sub.p256dh,
                                "auth": sub.auth
                            }
                        },
                        data=json.dumps({"title": "One Schedular", "body": message, "url": link or "/"}),
                        vapid_private_key=VAPID_PRIVATE_KEY,
                        vapid_claims={"sub": "mailto:admin@sterling.ng"}
                    )
                except WebPushException as ex:
                    logger.error(f"Web push failed: {ex}")
                    db.delete(sub)
            db.commit()
        except Exception as e:
            logger.error(f"Error sending push: {e}")
        
    return notif
