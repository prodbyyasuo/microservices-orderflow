import json

from aiokafka import AIOKafkaProducer

from .config import settings


def create_kafka_producer():
    return AIOKafkaProducer(bootstrap_servers=settings.kafka_bootstrap_server,)


async def publish_kafka_event(
        producer: AIOKafkaProducer,
        topic: str,
        event: dict
):
    payload = json.dumps(event).encode()
    return await producer.send_and_wait(topic=topic, value=payload)
