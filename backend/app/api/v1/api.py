from fastapi import APIRouter
from app.api.v1 import health
from app.api.v1 import auth
from app.api.v1 import agents
from app.api.v1 import customers
from app.api.v1 import visits
from app.api.v1 import dashboard
from app.api.v1 import agent
from app.api.v1 import territories
from app.api.v1 import leads
from app.api.v1 import agent_leads
from app.api.v1 import dispatch
from app.api.v1 import settings_view

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(agents.router)
api_router.include_router(customers.router)
api_router.include_router(visits.router)
api_router.include_router(agent.router)
api_router.include_router(agent_leads.router)
api_router.include_router(territories.router)
api_router.include_router(leads.router)
api_router.include_router(dispatch.router)
api_router.include_router(settings_view.router)

