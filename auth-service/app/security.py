from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from .config import settings
from .models import User

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded_password: str) -> bool:
    return password_hash.verify(password, encoded_password)


def create_access_token(user: User) -> str:
    now = datetime.now(UTC)
    expires_in = now + timedelta(seconds=3600)
    payload = {
        "user_id": user.id,
        "email": user.email,
        "role": "user",
        "exp": expires_in,
    }

    token = jwt.encode(
        payload,
        key=settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )

    return token
