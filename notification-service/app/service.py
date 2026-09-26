from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import NotFoundError
from .models import Notification
from .schemas import NotificationCreateSchema, NotificationReadSchema


class NotificationService:
    def __init__(self, session: Session):
        self.session = session

    def create(self, data: NotificationCreateSchema) -> NotificationReadSchema:
        notification = Notification(**data.model_dump())
        self.session.add(notification)
        self.session.commit()
        self.session.refresh(notification)
        return NotificationReadSchema.model_validate(notification)

    def get(self, notification_id: str) -> NotificationReadSchema:
        notification = self.session.get(Notification, notification_id)
        if notification is None:
            raise NotFoundError

        return notification

    def get_all(self) -> list[NotificationReadSchema]:
        stmt = select(Notification).order_by(Notification.created_at.desc())
        return list(self.session.scalars(stmt).all())
