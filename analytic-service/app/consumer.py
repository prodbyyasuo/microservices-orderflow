import json

from aiokafka import AIOKafkaConsumer, ConsumerRecord
from pymongo.collection import Collection

from .config import settings


async def save_event(
        collection: Collection,
        message: ConsumerRecord
):
    event = json.loads(message.value)
    await collection.insert_one(event)


async def consume_events(collection: Collection):
    consumer = AIOKafkaConsumer(
        settings.kafka_topic,
        bootstrap_servers=settings.kafka_bootstrap_servers
    )

    await consumer.start()

    try:
        async for message in consumer:
            await save_event(collection, message)
    finally:
        await consumer.stop()
