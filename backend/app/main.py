"""
Agentic AI Flight Engine — FastAPI Backend Entry Point
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.routes import flights, agents, notifications, health
from app.core.config import settings
from app.core.logging import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    yield


app = FastAPI(
    title="Agentic AI Flight Engine",
    version="1.0.0",
    description="AI-powered agentic flight search, booking, and monitoring engine.",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health.router, prefix="/health", tags=["Health"])
app.include_router(flights.router, prefix="/api/v1/flights", tags=["Flights"])
app.include_router(agents.router, prefix="/api/v1/agents", tags=["Agents"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])
