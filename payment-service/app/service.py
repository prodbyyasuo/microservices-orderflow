import asyncio
from aio_pika.abc import AbstractExchange
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .events import build_payment_succeeded_event

from .models import PaymentORM
from .config import NotFoundError, settings
from .schemas import PaymentCreateSchema, PaymentReadSchema
from .rabbitmq import event_publish_json

class PaymentService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, payment_data: PaymentCreateSchema) -> PaymentReadSchema:
        payment = PaymentORM(
            order_id=payment_data.order_id,
            status="created",
            amount=payment_data.amount
        )
        self.session.add(payment)
        await self.session.commit()

        return payment

    async def get(self, payment_id: str):
        payment = await self.session.get(payment, payment_id)
        if payment is None:
            raise NotFoundError

        return payment

    async def get_all(self):
        stmt = select(PaymentORM)
        return list((await self.session.scalars(stmt)).all())

    async def complete_payment(
            self,
            payment: PaymentORM,
            order_id: str,
            amount: int,
            exchange: AbstractExchange,
    ):
        await asyncio.sleep(4)

        payment.status = "succeeded"
        await self.session.commit()

        event = build_payment_succeeded_event(payment.id, order_id, amount)

        await event_publish_json(exchange, settings.payment_succeeded_routing_key, data=event)

        return PaymentReadSchema.model_validate(payment)
