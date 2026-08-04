"""
Flight service — orchestrates agent runs and DB persistence
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional

from langchain_core.messages import HumanMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import flight_graph, FlightAgentState
from app.models.flight import AgentRun, FlightSearch, PriceAlert


class FlightService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    async def initiate_search(self, request: Any, user_id: str) -> str:
        """Persist search record and enqueue agent run. Returns run_id."""
        run_id = str(uuid.uuid4())

        search = FlightSearch(
            user_id=user_id,
            origin=request.origin,
            destination=request.destination,
            departure_date=request.departure_date,
            return_date=request.return_date,
            passengers=request.passengers,
            cabin_class=request.cabin_class,
            agent_run_id=run_id,
        )
        self.db.add(search)

        agent_run = AgentRun(
            id=uuid.UUID(run_id),
            user_id=user_id,
            run_type="search",
            status="pending",
        )
        self.db.add(agent_run)
        await self.db.commit()

        # In production, push to a task queue (Celery / SQS / Service Bus)
        # For simplicity, run inline (non-blocking via background task)
        return run_id

    async def stream_agent_run(self, run_id: str) -> AsyncGenerator[str, None]:
        """Stream agent events for a run."""
        agent_run = await self._get_run(run_id)
        if not agent_run:
            yield json.dumps({"error": "Run not found"})
            return

        # Rebuild intent from stored state or re-run
        query = agent_run.state.get("query", "") if agent_run.state else ""
        state: FlightAgentState = {
            "messages": [HumanMessage(content=query)],
            "intent": None,
            "raw_results": None,
            "ranked_results": None,
            "recommendation": None,
            "error": None,
            "run_id": run_id,
        }

        async for event in flight_graph.astream_events(state, version="v2"):
            yield json.dumps({"event": event["event"], "data": str(event.get("data", ""))})

    async def get_run_result(self, run_id: str) -> Optional[Dict]:
        run = await self._get_run(run_id)
        if not run:
            return None
        return {
            "run_id": run_id,
            "status": run.status,
            "result": run.state,
            "error": run.error,
        }

    async def _get_run(self, run_id: str) -> Optional[AgentRun]:
        result = await self.db.execute(
            select(AgentRun).where(AgentRun.id == uuid.UUID(run_id))
        )
        return result.scalar_one_or_none()

    # ------------------------------------------------------------------
    # Price Alerts
    # ------------------------------------------------------------------

    async def create_price_alert(self, request: Any, user_id: str) -> PriceAlert:
        alert = PriceAlert(
            user_id=user_id,
            origin=request.origin,
            destination=request.destination,
            departure_date=request.departure_date,
            target_price=request.target_price,
            push_token=request.push_token,
            is_active=True,
        )
        self.db.add(alert)
        await self.db.commit()
        await self.db.refresh(alert)
        return alert

    async def list_alerts(self, user_id: str) -> List[PriceAlert]:
        result = await self.db.execute(
            select(PriceAlert).where(
                PriceAlert.user_id == user_id,
                PriceAlert.is_active == True,  # noqa
            )
        )
        return list(result.scalars().all())

    async def delete_alert(self, alert_id: str, user_id: str) -> None:
        result = await self.db.execute(
            select(PriceAlert).where(
                PriceAlert.id == uuid.UUID(alert_id),
                PriceAlert.user_id == user_id,
            )
        )
        alert = result.scalar_one_or_none()
        if alert:
            alert.is_active = False
            await self.db.commit()
