from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationCreateSchema(BaseModel):
    order_id: str
    payment_id: str | None = None
    amount: int
    status: str = "succeeded"


class NotificationReadSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str | None
    order_id: str
    payment_id: str | None
    amount: int
    status: str
    created_at: datetime
