from datetime import UTC, datetime
from uuid import uuid4


def build_payment_succeeded_event(
    payment_id: str,
    order_id: str,
    amount: int,
) -> dict:
    return {
        "event_id": str(uuid4()),
        "created_at": datetime.now(UTC).isoformat(),
        "payment_id": payment_id,
        "order_id": order_id,
        "amount": amount,
        "status": "succeeded",
    }
