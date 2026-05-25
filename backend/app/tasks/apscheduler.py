from apscheduler.schedulers.asyncio import AsyncIOScheduler
from ..logger import logger
from ..services.auto_draft import auto_generate_drafts

scheduler = AsyncIOScheduler(timezone="Africa/Lagos")


def start_scheduler():
    try:
        # Auto-generate draft schedules on the 25th of every month at 8:00 AM
        scheduler.add_job(
            auto_generate_drafts,
            "cron",
            day=25,
            hour=8,
            minute=0,
            id="auto_draft_generation",
            replace_existing=True,
        )
        logger.info("[SCHEDULER] Auto-draft job scheduled for 25th of every month at 8:00 AM")

        scheduler.start()
        logger.info("[SCHEDULER] Started (Africa/Lagos timezone)")
    except Exception as e:
        logger.warning(f"[SCHEDULER] Could not start: {e}")