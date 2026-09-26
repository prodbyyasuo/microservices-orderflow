from pydantic import BaseModel, ConfigDict


class PaymentCreateSchema(BaseModel):
    order_id: str
    amount: int


class PaymentReadSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_id: str
    status: str
    amount: int
