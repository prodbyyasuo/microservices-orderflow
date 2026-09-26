import json

from aio_pika.abc import AbstractRobustConnection, AbstractChannel, AbstractExchange

import aio_pika


async def connect_rabbitmq(url: str) -> AbstractRobustConnection:
    return await aio_pika.connect_robust(url)


async def declare_payment_exchange(channel: AbstractChannel, exchange_name: str):
    return await channel.declare_exchange(exchange_name)


async def event_publish_json(exchange: AbstractExchange, routing_key: str, data: dict):
    message = aio_pika.Message(json.dumps(data).encode())
    await exchange.publish(message, routing_key)
