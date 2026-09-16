"""
Unit tests for notification_service._send_email_notification.

Client QA report: email sending was broken in silence.
`_send_email_notification` referenced `settings.resend_api_key` /
`settings.email_from_name` / `settings.email_from`, none of which existed
on `app.core.config.Settings` -- every attempt raised `AttributeError`
before the early "not configured" return was ever reached, and a bare
`except Exception: pass` swallowed it with zero logging, so the failure
was invisible even to whoever set the Resend env vars correctly.
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.core.config import Settings
from app.models.user import User
from app.services.notification_service import _send_email_notification


def _mock_db_with_user(user_id, email: str | None):
    user = MagicMock(spec=User)
    user.id = user_id
    user.email = email

    result = MagicMock()
    result.scalar_one_or_none.return_value = user if email is not None else None

    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


def test_settings_declares_email_fields_with_safe_defaults():
    settings = Settings()
    assert settings.resend_api_key == ""
    assert settings.email_from_name
    assert settings.email_from


@pytest.mark.asyncio
async def test_skips_silently_when_resend_not_configured():
    user_id = uuid4()
    db = _mock_db_with_user(user_id, "user@miumg.edu.gt")
    settings = Settings(resend_api_key="")

    with patch("app.core.config.get_settings", return_value=settings), \
         patch("resend.Emails.send") as mock_send, \
         patch("app.services.notification_service.logger") as mock_logger:
        await _send_email_notification(user_id, "Titulo", "Mensaje", db)

    mock_send.assert_not_called()
    mock_logger.exception.assert_not_called()
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_sends_via_resend_when_configured():
    user_id = uuid4()
    db = _mock_db_with_user(user_id, "user@miumg.edu.gt")
    settings = Settings(
        resend_api_key="re_fake_key",
        email_from_name="Sistema Biométrico UMG",
        email_from="notificaciones@sistemaslab.dev",
    )

    with patch("app.core.config.get_settings", return_value=settings), \
         patch("resend.Emails.send") as mock_send:
        await _send_email_notification(user_id, "Titulo", "Mensaje", db)

    mock_send.assert_called_once()
    call_kwargs = mock_send.call_args[0][0]
    assert call_kwargs["to"] == "user@miumg.edu.gt"
    assert call_kwargs["from"] == "Sistema Biométrico UMG <notificaciones@sistemaslab.dev>"
    assert call_kwargs["subject"] == "Titulo"


@pytest.mark.asyncio
async def test_logs_instead_of_silently_swallowing_send_failures():
    user_id = uuid4()
    db = _mock_db_with_user(user_id, "user@miumg.edu.gt")
    settings = Settings(resend_api_key="re_fake_key")

    with patch("app.core.config.get_settings", return_value=settings), \
         patch("resend.Emails.send", side_effect=RuntimeError("Resend API down")), \
         patch("app.services.notification_service.logger") as mock_logger:
        await _send_email_notification(user_id, "Titulo", "Mensaje", db)

    mock_logger.exception.assert_called_once()
    assert mock_logger.exception.call_args[0][0] == "email_notification_failed"


@pytest.mark.asyncio
async def test_skips_silently_when_user_has_no_email():
    user_id = uuid4()
    db = _mock_db_with_user(user_id, email=None)
    settings = Settings(resend_api_key="re_fake_key")

    with patch("app.core.config.get_settings", return_value=settings), \
         patch("resend.Emails.send") as mock_send, \
         patch("app.services.notification_service.logger") as mock_logger:
        await _send_email_notification(user_id, "Titulo", "Mensaje", db)

    mock_send.assert_not_called()
    mock_logger.exception.assert_not_called()
