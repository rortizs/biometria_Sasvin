from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.permission_requests import approve_permission_request
from app.models.permission_request import PermissionRequestStatus
from app.models.user import UserRole
from app.schemas.permission_request import PermissionRequestApprove


APPROVED_DETAIL = "La solicitud ya fue aprobada. Indique al colaborador que ingrese una nueva solicitud."


def approved_request() -> MagicMock:
    return MagicMock(status=PermissionRequestStatus.approved)


def database_for(request: MagicMock) -> AsyncMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = request
    database = AsyncMock()
    database.execute.return_value = result
    return database


@pytest.mark.asyncio
async def test_approved_request_returns_exact_detail_after_authorization():
    database = database_for(approved_request())

    with pytest.raises(HTTPException) as error:
        await approve_permission_request(
            database,
            MagicMock(role=UserRole.admin),
            uuid4(),
            PermissionRequestApprove(),
        )

    assert error.value.status_code == 400
    assert error.value.detail == APPROVED_DETAIL


@pytest.mark.asyncio
async def test_unauthorized_approver_cannot_receive_approved_detail():
    database = database_for(approved_request())

    with pytest.raises(HTTPException) as error:
        await approve_permission_request(
            database,
            MagicMock(role=UserRole.coordinador),
            uuid4(),
            PermissionRequestApprove(),
        )

    assert error.value.status_code == 403
    assert error.value.detail != APPROVED_DETAIL
