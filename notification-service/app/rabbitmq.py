import json
from datetime import UTC, datetime

import aio_pika
from aio_pika.abc import (
    AbstractConnection,
    AbstractIncomingMessage,
    AbstractRobustConnection,
)
from sqlalchemy import select

from .config import settings
from .database import SessionLocal
from .models import Notification


async def connect_rabbitmq() -> AbstractRobustConnection:
    return await aio_pika.connect_robust(settings.rabbitmq_url)


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.now(UTC)
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return datetime.now(UTC)


async def handle_payment_events(message: AbstractIncomingMessage):
    async with message.process():
        event = json.loads(message.body.decode("utf-8"))

        with SessionLocal() as session:
            event_id = event.get("event_id")
            if event_id:
                existing = session.scalar(
                    select(Notification).where(Notification.event_id == event_id)
                )
                if existing is not None:
                    return

            session.add(
                Notification(
                    event_id=event_id,
                    order_id=event.get("order_id"),
                    payment_id=event.get("payment_id"),
                    amount=event.get("amount", 0),
                    status=event.get("status", "succeeded"),
                    created_at=_parse_datetime(event.get("created_at")),
                )
            )
            session.commit()


async def start_payments_consume(connection: AbstractConnection):
    channel = await connection.channel()
    payment_exchange = await channel.declare_exchange(settings.payment_exchange_name)
    payment_queue = await channel.declare_queue(settings.payment_queue_name)

    await payment_queue.bind(
        payment_exchange,
        routing_key=settings.payment_succeeded_routing_key,
    )
    await payment_queue.consume(handle_payment_events)
