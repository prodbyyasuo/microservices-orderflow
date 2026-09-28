from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = (
        "postgresql+asyncpg://payments:payments@payment-db:5432/payments"
    )
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672"
    kafka_bootstrap_server: str = "localhost:9092"
    kafka_analytic_payment_topic: str = "payment-events"
    payment_succeeded_routing_key: str = "payment.succeeded"
    payment_exchange_name: str = "payment.events"


settings = Settings()


class NotFoundError(Exception):
    pass
