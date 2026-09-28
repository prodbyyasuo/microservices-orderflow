from contextlib import asynccontextmanager
from typing import AsyncIterator

from aiokafka import AIOKafkaProducer
from fastapi import Depends, FastAPI, HTTPException, Request, status

from .config import NotFoundError, settings
from .database import engine
from .dependencies import get_payment_service
from .kafka import create_kafka_producer
from .models import Base
from .rabbitmq import connect_rabbitmq, declare_payment_exchange
from .schemas import PaymentCreateSchema, PaymentReadSchema
from .service import PaymentService


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    async with engine.begin() as database_connection:
        await database_connection.run_sync(Base.metadata.create_all)

    rabbitmq_connection = await connect_rabbitmq(url=settings.rabbitmq_url)
    channel = await rabbitmq_connection.channel()
    app.state.payment_exchange = await declare_payment_exchange(
        channel, settings.payment_exchange_name
    )

    kafka_producer: AIOKafkaProducer = create_kafka_producer()
    await kafka_producer.start()
    app.state.kafka_producer = kafka_producer

    try:
        yield
    finally:
        await kafka_producer.stop()
        await rabbitmq_connection.close()


app = FastAPI(lifespan=lifespan)


@app.get("/payments/{payment_id}", response_model=PaymentReadSchema)
async def get_payment(
    payment_id: str, payment_service: PaymentService = Depends(get_payment_service)
):
    try:
        return await payment_service.get(payment_id)
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Платёж не найден",
        )


@app.get("/payments", response_model=list[PaymentReadSchema])
async def get_payments(payment_service: PaymentService = Depends(get_payment_service)):
    return await payment_service.get_all()


@app.post("/payments", response_model=PaymentReadSchema)
async def create_payment(
    request: Request,
    payload: PaymentCreateSchema,
    payment_service: PaymentService = Depends(get_payment_service),
):
    payment = await payment_service.create(payload)

    return await payment_service.complete_payment(
        payment,
        user_id=payload.user_id,
        exchange=request.app.state.payment_exchange,
        kafka_producer=request.app.state.kafka_producer,
    )
