"""
Flight search, price alert, and itinerary routes
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, verify_token
from app.models.flight import FlightSearch, PriceAlert
from app.services.flight_service import FlightService

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class FlightSearchRequest(BaseModel):
    origin: str = Field(..., min_length=3, max_length=4, example="DFW")
    destination: str = Field(..., min_length=3, max_length=4, example="JFK")
    departure_date: str = Field(..., example="2026-09-15")
    return_date: Optional[str] = Field(None, example="2026-09-22")
    passengers: int = Field(1, ge=1, le=9)
    cabin_class: str = Field("economy", pattern="^(economy|premium_economy|business|first)$")
    max_price: Optional[float] = None
    flexible_dates: bool = False


class PriceAlertRequest(BaseModel):
    origin: str
    destination: str
    departure_date: str
    target_price: float
    push_token: Optional[str] = None


class PriceAlertResponse(BaseModel):
    id: str
    origin: str
    destination: str
    departure_date: str
    target_price: float
    is_active: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/search")
async def search_flights(
    request: FlightSearchRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _token: dict = Depends(verify_token),
):
    """
    Kick off an agentic flight search. Returns a run_id for SSE streaming.
    """
    service = FlightService(db)
    run_id = await service.initiate_search(request, user_id=_token["sub"])
    return {"run_id": run_id, "status": "queued"}


@router.get("/search/{run_id}/stream")
async def stream_search_results(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    _token: dict = Depends(verify_token),
):
    """
    Server-Sent Events stream for live agent updates during flight search.
    """
    from fastapi.responses import StreamingResponse
    from app.services.flight_service import FlightService

    service = FlightService(db)

    async def event_generator():
        async for chunk in service.stream_agent_run(run_id):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/search/{run_id}/result")
async def get_search_result(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    _token: dict = Depends(verify_token),
):
    """Poll for completed search result."""
    service = FlightService(db)
    result = await service.get_run_result(run_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return result


@router.post("/alerts", response_model=PriceAlertResponse, status_code=status.HTTP_201_CREATED)
async def create_price_alert(
    request: PriceAlertRequest,
    db: AsyncSession = Depends(get_db),
    _token: dict = Depends(verify_token),
):
    """Register a price drop alert for a specific route."""
    service = FlightService(db)
    alert = await service.create_price_alert(request, user_id=_token["sub"])
    return PriceAlertResponse(
        id=str(alert.id),
        origin=alert.origin,
        destination=alert.destination,
        departure_date=alert.departure_date,
        target_price=alert.target_price,
        is_active=alert.is_active,
    )


@router.get("/alerts", response_model=List[PriceAlertResponse])
async def list_price_alerts(
    db: AsyncSession = Depends(get_db),
    _token: dict = Depends(verify_token),
):
    """List all active price alerts for the authenticated user."""
    service = FlightService(db)
    alerts = await service.list_alerts(user_id=_token["sub"])
    return [
        PriceAlertResponse(
            id=str(a.id),
            origin=a.origin,
            destination=a.destination,
            departure_date=a.departure_date,
            target_price=a.target_price,
            is_active=a.is_active,
        )
        for a in alerts
    ]


@router.delete("/alerts/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_price_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    _token: dict = Depends(verify_token),
):
    service = FlightService(db)
    await service.delete_alert(alert_id, user_id=_token["sub"])
