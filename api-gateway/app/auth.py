import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, ValidationError

from .config import settings


class CurrentUser(BaseModel):
    id: str
    email: EmailStr


def decode_access_token(
    token: str,
) -> CurrentUser:
    try:
        payload = jwt.decode(
            jwt=token,
            key=settings.jwt_secret.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
        )
        return CurrentUser(id=payload["user_id"], email=payload["email"])
    except (jwt.PyJWTError, ValidationError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(HTTPBearer()),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    return decode_access_token(credentials.credentials)
