from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = (
        "postgresql+psycopg2://auth:auth@localhost:5436/auth"
    )
    jwt_secret: SecretStr
    jwt_algorithm: str = "HS256"


settings = Settings()
