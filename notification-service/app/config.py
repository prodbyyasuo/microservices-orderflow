from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://notifications:notifications@orderflow-notification-db:5432/notifications"
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672"
    payment_succeeded_routing_key: str = "payment.succeeded"
    payment_queue_name: str = "notification.payments"
    payment_exchange_name: str = "payment.events"


settings = Settings()


class NotFoundError(Exception):
    pass
