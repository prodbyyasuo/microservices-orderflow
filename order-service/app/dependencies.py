from fastapi import Depends
from sqlalchemy.orm import Session

from .api_clients import CatalogClient, PaymentClient
from .database import get_db
from .service import OrderService
from .config import settings


def get_catalog_client() -> CatalogClient:
    return CatalogClient(
        base_url=settings.catalog_service_url,
    )


def get_payment_client() -> PaymentClient:
    return PaymentClient(
        base_url=settings.payment_service_url,
    )


def get_order_service(
    db: Session = Depends(get_db),
    catalog_client: CatalogClient = Depends(get_catalog_client),
    payment_client: PaymentClient = Depends(get_payment_client),
) -> OrderService:
    return OrderService(db, catalog_client, payment_client)
