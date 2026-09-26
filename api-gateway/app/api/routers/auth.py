from app.api_client import request_service
from app.auth import CurrentUser, get_current_user
from app.config import settings
from app.schemas import TokenResponse, UserLogin, UserRegister
from fastapi import APIRouter, Depends, status

router = APIRouter(prefix="/auth")


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: UserRegister,
) -> TokenResponse:
    return await request_service(
        method="POST",
        url=f"{settings.AUTH_SERVICE_URL}/register",
        json_body=payload.model_dump(mode="json"),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLogin,
) -> TokenResponse:
    return await request_service(
        method="POST",
        url=f"{settings.AUTH_SERVICE_URL}/login",
        json_body=payload.model_dump(mode="json"),
    )


@router.get("/me", response_model=CurrentUser)
async def get_me(current_user=Depends(get_current_user)):
    return current_user
