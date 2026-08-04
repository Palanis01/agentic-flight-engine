"""
Agent conversation endpoint — chat-style interface to the flight graph
"""
from typing import List, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.graph import flight_graph, FlightAgentState
from app.core.dependencies import get_db, verify_token
from langchain_core.messages import HumanMessage
import json

router = APIRouter()


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class AgentChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    history: Optional[List[ChatMessage]] = []


@router.post("/chat")
async def agent_chat(
    request: AgentChatRequest,
    db: AsyncSession = Depends(get_db),
    _token: dict = Depends(verify_token),
):
    """
    Single-turn agent invocation. Returns the full response.
    """
    state: FlightAgentState = {
        "messages": [HumanMessage(content=request.message)],
        "intent": None,
        "raw_results": None,
        "ranked_results": None,
        "recommendation": None,
        "error": None,
        "run_id": request.session_id,
    }
    result = await flight_graph.ainvoke(state)
    last_msg = result["messages"][-1]
    return {
        "response": last_msg.content,
        "recommendation": result.get("recommendation"),
        "ranked_results": result.get("ranked_results", [])[:5],
        "error": result.get("error"),
    }


@router.post("/chat/stream")
async def agent_chat_stream(
    request: AgentChatRequest,
    _token: dict = Depends(verify_token),
):
    """
    Streaming chat — yields SSE tokens as the LLM responds.
    """
    state: FlightAgentState = {
        "messages": [HumanMessage(content=request.message)],
        "intent": None,
        "raw_results": None,
        "ranked_results": None,
        "recommendation": None,
        "error": None,
        "run_id": request.session_id,
    }

    async def token_stream():
        async for event in flight_graph.astream_events(state, version="v2"):
            if event["event"] == "on_chat_model_stream":
                chunk = event["data"]["chunk"].content
                if chunk:
                    yield f"data: {json.dumps({'token': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(token_stream(), media_type="text/event-stream")
