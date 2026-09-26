import json

import aio_pika
from aio_pika.abc import (
    AbstractConnection,
    AbstractIncomingMessage,
    AbstractRobustConnection,
)

from .config import settings
from .database import SessionLocal
from .models import Order


async def connect_rabbitmq() -> AbstractRobustConnection:
    return await aio_pika.connect_robust(settings.rabbitmq_url)


async def handle_payment_events(message: AbstractIncomingMessage):
    async with message.process():
        event = json.loads(message.body.decode("utf-8"))
        with SessionLocal() as session:
            order = session.get(Order, event["order_id"])
            if order is None:
                return
            order.status = "paid"
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
