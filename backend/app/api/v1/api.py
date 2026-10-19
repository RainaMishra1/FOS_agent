from fastapi import APIRouter
from app.api.v1 import health
from app.api.v1 import auth
from app.api.v1 import agents
from app.api.v1 import customers
from app.api.v1 import visits
from app.api.v1 import dashboard

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(agents.router)
api_router.include_router(customers.router)
api_router.include_router(visits.router)
