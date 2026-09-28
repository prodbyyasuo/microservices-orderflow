import asyncio
from contextlib import asynccontextmanager, suppress

from app.consumer import consume_events

import pymongo
from app.database import events_collection, mongodb_client
from fastapi import FastAPI


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(consume_events(events_collection))

    try:
        yield
    finally:
        task.cancel()

        with suppress(asyncio.CancelledError):
            await task

        await mongodb_client.close()


app = FastAPI(lifespan=lifespan)


@app.get("/events")
async def get_events(limit: int = 20):
    query = (
        events_collection.find({}, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
    )
    return await query.to_list(limit)
