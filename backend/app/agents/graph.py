"""
Agentic Flight Engine — LangGraph Agent Graph
Nodes: intent_parser → flight_search → price_compare → recommendation → respond
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Annotated, Any, Dict, List, Literal, Optional, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from app.agents.tools import (
    amadeus_search_tool,
    duffel_search_tool,
    price_history_tool,
    serpapi_flights_tool,
)
from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# State definition
# ---------------------------------------------------------------------------

class FlightAgentState(TypedDict):
    messages: Annotated[List[Any], add_messages]
    intent: Optional[Dict[str, Any]]           # parsed search intent
    raw_results: Optional[List[Dict]]           # merged results from all providers
    ranked_results: Optional[List[Dict]]        # price-compared + ranked itineraries
    recommendation: Optional[Dict[str, Any]]    # AI-chosen best option with rationale
    error: Optional[str]
    run_id: Optional[str]


# ---------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------

llm = ChatOpenAI(
    model=settings.OPENAI_MODEL,
    api_key=settings.OPENAI_API_KEY,
    temperature=0.2,
    streaming=True,
)

# ---------------------------------------------------------------------------
# Node: Intent Parser
# ---------------------------------------------------------------------------

INTENT_SYSTEM = """You are an AI travel assistant. Extract a structured flight search intent
from the user message. Return ONLY valid JSON with keys:
origin (IATA), destination (IATA), departure_date (YYYY-MM-DD),
return_date (YYYY-MM-DD or null), passengers (int), cabin_class
(economy|premium_economy|business|first), flexible_dates (bool),
max_price (float or null), preferred_airlines (list[str])."""


async def intent_parser_node(state: FlightAgentState) -> FlightAgentState:
    user_msg = state["messages"][-1].content
    response = await llm.ainvoke(
        [SystemMessage(content=INTENT_SYSTEM), HumanMessage(content=user_msg)]
    )
    try:
        intent = json.loads(response.content)
    except json.JSONDecodeError:
        intent = {}
        logger.warning("Intent parser returned non-JSON: %s", response.content)
    return {**state, "intent": intent}


# ---------------------------------------------------------------------------
# Node: Flight Search (parallel multi-provider)
# ---------------------------------------------------------------------------

async def flight_search_node(state: FlightAgentState) -> FlightAgentState:
    intent = state.get("intent", {})
    if not intent:
        return {**state, "error": "No intent parsed."}

    tasks = [
        amadeus_search_tool(intent),
        duffel_search_tool(intent),
        serpapi_flights_tool(intent),
    ]
    results_list = await asyncio.gather(*tasks, return_exceptions=True)

    merged: List[Dict] = []
    for r in results_list:
        if isinstance(r, Exception):
            logger.error("Search provider error: %s", r)
        else:
            merged.extend(r)

    return {**state, "raw_results": merged}


# ---------------------------------------------------------------------------
# Node: Price Comparator
# ---------------------------------------------------------------------------

async def price_compare_node(state: FlightAgentState) -> FlightAgentState:
    raw = state.get("raw_results", [])
    history = await price_history_tool(state["intent"])
    avg_price = history.get("avg_price_30d", None)

    def score(itinerary: Dict) -> float:
        price = itinerary.get("price", 9999)
        stops = itinerary.get("stops", 2)
        duration_h = itinerary.get("duration_minutes", 600) / 60
        deal_bonus = max(0, (avg_price - price) / avg_price) * 30 if avg_price else 0
        return price * 0.5 + stops * 20 + duration_h * 2 - deal_bonus

    ranked = sorted(raw, key=score)[:10]
    for r in ranked:
        r["score"] = round(score(r), 2)
        r["is_deal"] = avg_price and r.get("price", 9999) < avg_price * 0.85

    return {**state, "ranked_results": ranked}


# ---------------------------------------------------------------------------
# Node: Recommendation
# ---------------------------------------------------------------------------

RECOMMENDATION_SYSTEM = """You are a senior flight advisor. Given the user's intent and the
top-ranked itineraries, pick the single best itinerary and explain WHY in 2-3 sentences.
Return JSON: {best_index: int, rationale: str, alternatives: [int, int]}."""


async def recommendation_node(state: FlightAgentState) -> FlightAgentState:
    ranked = state.get("ranked_results", [])
    intent = state.get("intent", {})
    payload = json.dumps({"intent": intent, "itineraries": ranked[:5]})
    response = await llm.ainvoke(
        [SystemMessage(content=RECOMMENDATION_SYSTEM), HumanMessage(content=payload)]
    )
    try:
        rec = json.loads(response.content)
        best_idx = rec.get("best_index", 0)
        rec["best_itinerary"] = ranked[best_idx] if ranked else {}
    except Exception:
        rec = {"rationale": response.content, "best_itinerary": ranked[0] if ranked else {}}
    return {**state, "flight_recommendation": rec}


# ---------------------------------------------------------------------------
# Node: Respond
# ---------------------------------------------------------------------------

RESPOND_SYSTEM = """You are a friendly AI travel agent. Summarise the flight recommendation
in a conversational, helpful response. Mention price, airline, stops, duration, and why it
was chosen. Offer to set a price alert or book the flight."""


async def respond_node(state: FlightAgentState) -> FlightAgentState:
    rec = state.get("recommendation", {})
    response = await llm.ainvoke(
        [
            SystemMessage(content=RESPOND_SYSTEM),
            HumanMessage(content=json.dumps(rec)),
        ]
    )
    return {**state, "messages": [AIMessage(content=response.content)]}


# ---------------------------------------------------------------------------
# Conditional router
# ---------------------------------------------------------------------------

def route_after_search(state: FlightAgentState) -> Literal["price_compare", "respond"]:
    if state.get("error") or not state.get("raw_results"):
        return "respond"
    return "price_compare"


# ---------------------------------------------------------------------------
# Build graph
# ---------------------------------------------------------------------------

def build_flight_graph() -> StateGraph:
    graph = StateGraph(FlightAgentState)

    graph.add_node("intent_parser", intent_parser_node)
    graph.add_node("flight_search", flight_search_node)
    graph.add_node("price_compare", price_compare_node)
    graph.add_node("recommendation_step", recommendation_node)
    graph.add_node("respond", respond_node)

    graph.set_entry_point("intent_parser")
    graph.add_edge("intent_parser", "flight_search")
    graph.add_conditional_edges("flight_search", route_after_search)
    graph.add_edge("price_compare", "recommendation_step")
    graph.add_edge("recommendation_step", "respond")
    graph.add_edge("respond", END)

    return graph.compile()


flight_graph = build_flight_graph()
