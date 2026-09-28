from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_topic: str = "payment-events"
    mongodb_url: str = "mongodb://analytics:analytics@localhost:27017/"
    mongodb_database: str = "analytics"
    mongodb_collection: str = "events"


settings = Settings()
