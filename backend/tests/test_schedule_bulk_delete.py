from datetime import date
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.deps import get_current_user
from app.db.session import get_db
from app.api.v1.endpoints.schedules import delete_bulk_assignments
from app.main import app
from app.models.user import UserRole
from app.schemas.schedule import BulkAssignmentDelete, BulkAssignmentDeleteResponse


def request() -> BulkAssignmentDelete:
    return BulkAssignmentDelete(
        employee_ids=[uuid4()],
        start_date=date(2026, 7, 13),
        end_date=date(2026, 7, 19),
    )


def test_bulk_delete_request_rejects_empty_ids_and_reversed_dates():
    with pytest.raises(ValidationError):
        BulkAssignmentDelete(
            employee_ids=[], start_date=date(2026, 7, 19), end_date=date(2026, 7, 13)
        )


def test_bulk_delete_requires_authentication_and_admin_role():
    async def database_override():
        yield AsyncMock()

    app.dependency_overrides[get_db] = database_override
    with TestClient(app) as client:
        response = client.request("DELETE", "/api/v1/schedules/assignments/bulk", json={
            "employee_ids": [str(uuid4())], "start_date": "2026-07-13", "end_date": "2026-07-19"
        })
        assert response.status_code == 401
        assert "assignment" not in response.text.lower()

        app.dependency_overrides[get_current_user] = lambda: MagicMock(role=UserRole.secretaria)
        response = client.request("DELETE", "/api/v1/schedules/assignments/bulk", json={
            "employee_ids": [str(uuid4())], "start_date": "2026-07-13", "end_date": "2026-07-19"
        })
        assert response.status_code == 403
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_bulk_delete_uses_one_inclusive_statement_and_returns_deleted_count():
    deleted_ids = [uuid4(), uuid4()]
    result = MagicMock()
    result.scalars.return_value.all.return_value = deleted_ids
    db = AsyncMock()
    db.execute.return_value = result

    response = await delete_bulk_assignments(db, MagicMock(), request())

    assert response == BulkAssignmentDeleteResponse(deleted_count=2)
    statement = str(db.execute.call_args.args[0])
    assert "DELETE FROM schedule_assignments" in statement
    assert "IN" in statement and ">=" in statement and "<=" in statement
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_bulk_delete_is_idempotent_and_rolls_back_failed_transactions():
    empty_result = MagicMock()
    empty_result.scalars.return_value.all.return_value = []
    db = AsyncMock()
    db.execute.return_value = empty_result
    assert (await delete_bulk_assignments(db, MagicMock(), request())).deleted_count == 0

    db.commit.side_effect = RuntimeError("database failure")
    with pytest.raises(HTTPException, match="Unable to delete assignments") as error:
        await delete_bulk_assignments(db, MagicMock(), request())
    assert error.value.status_code == 500
    db.rollback.assert_awaited_once()
