from pydantic import BaseModel, ConfigDict, EmailStr, Field


class OrderItemCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    product_id: str = Field(min_length=1, max_length=64)
    quantity: int = Field(gt=0)


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[OrderItemCreate] = Field(min_length=1)


class UserCredentials(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserRegister(UserCredentials):
    pass


class UserLogin(UserCredentials):
    pass


class UserRead(BaseModel):
    id: str
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserRead
