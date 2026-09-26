from pydantic import BaseModel, ConfigDict


class OrderCreateSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    items: list["OrderItemCreateSchema"]


class OrderItemCreateSchema(BaseModel):
    product_id: str
    quantity: int


class OrderItemReadSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: str
    product_name: str
    quantity: int
    unit_price: int


class OrderReadSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    status: str
    total_amount: int
    items: list[OrderItemReadSchema]
