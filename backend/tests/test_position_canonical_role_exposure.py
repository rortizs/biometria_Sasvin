"""Task 4.7 prerequisite (named `4.7a`, same convention as `4.3a`): expose
`positions.canonical_role` (D6, `backend/app/models/position.py`, added by
task 3.4) through `PositionResponse` so the frontend can mirror the
backend's `require_teacher_position` restriction (task 3.9's
`_require_teacher_target_position` in `employees.py`) client-side --
filtering the position dropdown in `employees.component.ts`'s create/edit
form to `canonical_role == "CATEDRATICO"` options only, instead of only
discovering the 403 after submit.

Before this change, `PositionResponse` (`backend/app/schemas/position.py`)
did not declare `canonical_role` at all, so `GET /positions/` and
`GET /positions/{id}` never returned it -- confirmed by reading the schema
and the `list_positions`/`get_position` endpoint handlers (`positions.py`),
neither of which selects/serializes `canonical_role` explicitly; both
return the raw ORM `Position` object via `response_model=PositionResponse`
(`from_attributes = True`), so adding the field to the schema is
sufficient -- no endpoint code change needed.
"""

from datetime import datetime
from uuid import uuid4

from app.schemas.position import PositionResponse


def _orm_like_position(canonical_role: str | None):
    from types import SimpleNamespace

    return SimpleNamespace(
        id=uuid4(),
        name="Catedrático de Cálculo I",
        description=None,
        is_active=True,
        created_at=datetime(2026, 1, 1),
        canonical_role=canonical_role,
    )


def test_position_response_exposes_canonical_role_when_set():
    position = _orm_like_position("CATEDRATICO")

    response = PositionResponse.model_validate(position)

    assert response.canonical_role == "CATEDRATICO"


def test_position_response_exposes_canonical_role_as_none_when_unset():
    position = _orm_like_position(None)

    response = PositionResponse.model_validate(position)

    assert response.canonical_role is None
