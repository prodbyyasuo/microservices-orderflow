from app.api.routers.auth import router as auth_router
from app.api.routers.catalog import router as catalog_router
from app.api.routers.orders import router as orders_router
from fastapi import APIRouter

router = APIRouter(prefix="/api")

router.include_router(auth_router)
router.include_router(orders_router)
router.include_router(catalog_router)
