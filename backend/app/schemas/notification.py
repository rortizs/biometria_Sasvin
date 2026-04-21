from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    message: str
    type: str
    read: bool
    request_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
