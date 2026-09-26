from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db
from .service import PaymentService


def get_payment_service(
    db: AsyncSession = Depends(get_db),
) -> PaymentService:
    return PaymentService(db)
