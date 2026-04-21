import asyncio
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.services.websocket_manager import ws_manager


async def notify_user(
    db: AsyncSession,
    user_id: str,
    title: str,
    message: str,
    notification_type: str,
    request_id: str | None = None,
) -> None:
    """
    Save notification to DB and push via WebSocket if user is connected.
    Also sends email (fire-and-forget — never blocks the main flow).

    Uses db.flush() to get the generated id without committing.
    The calling endpoint owns the transaction and must call db.commit().
    """
    # 1. Save to DB (flush only — caller commits)
    notif = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=notification_type,
        request_id=request_id,
    )
    db.add(notif)
    await db.flush()  # get the id without committing

    # 2. Push via WebSocket (fire-and-forget)
    payload = {
        "id": str(notif.id),
        "title": title,
        "message": message,
        "type": notification_type,
        "request_id": str(request_id) if request_id else None,
        "created_at": datetime.utcnow().isoformat(),
    }
    asyncio.create_task(ws_manager.send_to_user(str(user_id), payload))

    # 3. Email (fire-and-forget — import deferred to avoid circular imports)
    asyncio.create_task(_send_email_notification(user_id, title, message, db))


async def _send_email_notification(
    user_id: str,
    title: str,
    message: str,
    db: AsyncSession,
) -> None:
    """Send email via Resend. Silently fails if not configured or on any error."""
    try:
        from sqlalchemy import select

        import resend

        from app.core.config import get_settings
        from app.models.user import User

        settings = get_settings()
        if not settings.resend_api_key:
            return

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.email:
            return

        resend.api_key = settings.resend_api_key
        resend.Emails.send(
            {
                "from": f"{settings.email_from_name} <{settings.email_from}>",
                "to": user.email,
                "subject": title,
                "html": f"<p>{message}</p><br><small>Sistema Biométrico UMG</small>",
            }
        )
    except Exception:
        pass  # Never block the main flow for email failures
