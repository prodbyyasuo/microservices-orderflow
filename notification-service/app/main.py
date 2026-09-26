from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status

from .config import NotFoundError
from .database import engine
from .dependencies import get_notification_service
from .models import Base
from .rabbitmq import connect_rabbitmq, start_payments_consume
from .schemas import NotificationCreateSchema, NotificationReadSchema
from .service import NotificationService


@asynccontextmanager
async def lifespan(_: FastAPI):
    from .models import Notification

    Base.metadata.create_all(bind=engine)

    connection = await connect_rabbitmq()
    await start_payments_consume(connection)

    try:
        yield
    finally:
        await connection.close()


app = FastAPI(lifespan=lifespan)


@app.get("/notifications", response_model=list[NotificationReadSchema])
def get_notifications(
    notification_service: NotificationService = Depends(get_notification_service),
):
    return notification_service.get_all()


@app.get("/notifications/{notification_id}", response_model=NotificationReadSchema)
def get_notification(
    notification_id: str,
    notification_service: NotificationService = Depends(get_notification_service),
):
    try:
        return notification_service.get(notification_id)
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Уведомление не найдено",
        )


@app.post(
    "/notifications",
    response_model=NotificationReadSchema,
    status_code=status.HTTP_201_CREATED,
)
def create_notification(
    payload: NotificationCreateSchema,
    notification_service: NotificationService = Depends(get_notification_service),
):
    return notification_service.create(payload)
