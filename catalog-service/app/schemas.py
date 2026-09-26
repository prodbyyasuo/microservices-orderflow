from pydantic import BaseModel, ConfigDict


class ProductCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    description: str
    price: int
    image: str
    category: str


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    price: int
    image: str
    category: str
