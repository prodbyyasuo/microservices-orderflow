from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status

from .config import NotFoundError
from .database import engine
from .models import Base
from .schemas import OrderCreateSchema, OrderReadSchema
from .service import OrderService
from .dependencies import get_order_service
from .rabbitmq import connect_rabbitmq, start_payments_consume


@asynccontextmanager
async def lifespan(_: FastAPI):
    from .models import OrderItem, Order

    Base.metadata.create_all(bind=engine)

    connection = await connect_rabbitmq()
    await start_payments_consume(connection)

    try:
        yield
    finally:
        await connection.close()


app = FastAPI(lifespan=lifespan)


@app.get("/orders/{order_id}", response_model=OrderReadSchema)
def get_order(
    order_id: str,
    order_service: OrderService = Depends(get_order_service),
):
    try:
        return order_service.get(order_id)
    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден",
        )


@app.get("/orders", response_model=list[OrderReadSchema])
def list_orders(
    order_service: OrderService = Depends(get_order_service),
):
    return order_service.get_all()


@app.post("/orders", response_model=OrderReadSchema)
def create_order(
    payload: OrderCreateSchema,
    order_service: OrderService = Depends(get_order_service),
):
    return order_service.create(payload)
