"""
External tool implementations called by the agent graph.
Each returns a list of normalised itinerary dicts.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Normalised itinerary schema (subset)
# {
#   "id": str, "provider": str, "airline": str, "flight_number": str,
#   "origin": str, "destination": str, "departure_at": str, "arrival_at": str,
#   "duration_minutes": int, "stops": int, "price": float, "currency": str,
#   "cabin_class": str, "booking_url": str
# }
# ---------------------------------------------------------------------------


def _build_amadeus_token_url() -> str:
    return "https://test.api.amadeus.com/v1/security/oauth2/token"


async def _get_amadeus_token() -> str:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            _build_amadeus_token_url(),
            data={
                "grant_type": "client_credentials",
                "client_id": settings.AMADEUS_API_KEY,
                "client_secret": settings.AMADEUS_API_SECRET,
            },
        )
        r.raise_for_status()
        return r.json()["access_token"]


async def amadeus_search_tool(intent: Dict[str, Any]) -> List[Dict]:
    """Search Amadeus Flight Offers API."""
    try:
        token = await _get_amadeus_token()
        params = {
            "originLocationCode": intent["origin"],
            "destinationLocationCode": intent["destination"],
            "departureDate": intent["departure_date"],
            "adults": intent.get("passengers", 1),
            "travelClass": intent.get("cabin_class", "ECONOMY").upper(),
            "max": 20,
            "currencyCode": "USD",
        }
        if intent.get("return_date"):
            params["returnDate"] = intent["return_date"]

        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                "https://test.api.amadeus.com/v2/shopping/flight-offers",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )
            r.raise_for_status()
            data = r.json()

        results = []
        for offer in data.get("data", []):
            itinerary = offer["itineraries"][0]
            first_seg = itinerary["segments"][0]
            last_seg = itinerary["segments"][-1]
            results.append({
                "id": offer["id"],
                "provider": "amadeus",
                "airline": first_seg["carrierCode"],
                "flight_number": f"{first_seg['carrierCode']}{first_seg['number']}",
                "origin": first_seg["departure"]["iataCode"],
                "destination": last_seg["arrival"]["iataCode"],
                "departure_at": first_seg["departure"]["at"],
                "arrival_at": last_seg["arrival"]["at"],
                "duration_minutes": _parse_iso_duration(itinerary["duration"]),
                "stops": len(itinerary["segments"]) - 1,
                "price": float(offer["price"]["grandTotal"]),
                "currency": offer["price"]["currency"],
                "cabin_class": intent.get("cabin_class", "economy"),
                "booking_url": "",
            })
        return results
    except Exception as exc:
        logger.error("Amadeus search failed: %s", exc)
        return []


async def duffel_search_tool(intent: Dict[str, Any]) -> List[Dict]:
    """Search Duffel Flights API."""
    try:
        slices = [
            {
                "origin": intent["origin"],
                "destination": intent["destination"],
                "departure_date": intent["departure_date"],
            }
        ]
        if intent.get("return_date"):
            slices.append({
                "origin": intent["destination"],
                "destination": intent["origin"],
                "departure_date": intent["return_date"],
            })

        payload = {
            "data": {
                "slices": slices,
                "passengers": [{"type": "adult"}] * intent.get("passengers", 1),
                "cabin_class": intent.get("cabin_class", "economy"),
            }
        }
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.duffel.com/air/offer_requests?return_offers=true",
                headers={
                    "Authorization": f"Bearer {settings.DUFFEL_API_KEY}",
                    "Duffel-Version": "v2",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            r.raise_for_status()
            offers = r.json()["data"]["offers"]

        results = []
        for offer in offers[:20]:
            sl = offer["slices"][0]
            first_seg = sl["segments"][0]
            last_seg = sl["segments"][-1]
            results.append({
                "id": offer["id"],
                "provider": "duffel",
                "airline": first_seg["operating_carrier"]["iata_code"],
                "flight_number": first_seg["operating_carrier_flight_number"],
                "origin": first_seg["origin"]["iata_code"],
                "destination": last_seg["destination"]["iata_code"],
                "departure_at": first_seg["departing_at"],
                "arrival_at": last_seg["arriving_at"],
                "duration_minutes": sl["duration"],
                "stops": len(sl["segments"]) - 1,
                "price": float(offer["total_amount"]),
                "currency": offer["total_currency"],
                "cabin_class": intent.get("cabin_class", "economy"),
                "booking_url": offer.get("payment_requirements", {}).get("requires_instant_payment", ""),
            })
        return results
    except Exception as exc:
        logger.error("Duffel search failed: %s", exc)
        return []


async def serpapi_flights_tool(intent: Dict[str, Any]) -> List[Dict]:
    """Google Flights via SerpAPI (fallback / price validation)."""
    try:
        params = {
            "engine": "google_flights",
            "departure_id": intent["origin"],
            "arrival_id": intent["destination"],
            "outbound_date": intent["departure_date"],
            "currency": "USD",
            "hl": "en",
            "api_key": settings.SERPAPI_KEY,
        }
        if intent.get("return_date"):
            params["return_date"] = intent["return_date"]
            params["type"] = "1"
        else:
            params["type"] = "2"

        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get("https://serpapi.com/search", params=params)
            r.raise_for_status()
            data = r.json()

        results = []
        for flight in data.get("best_flights", []) + data.get("other_flights", []):
            legs = flight.get("flights", [{}])
            first = legs[0]
            last = legs[-1]
            results.append({
                "id": f"serp_{first.get('flight_number', '')}",
                "provider": "serpapi",
                "airline": first.get("airline", ""),
                "flight_number": first.get("flight_number", ""),
                "origin": first.get("departure_airport", {}).get("id", intent["origin"]),
                "destination": last.get("arrival_airport", {}).get("id", intent["destination"]),
                "departure_at": first.get("departure_airport", {}).get("time", ""),
                "arrival_at": last.get("arrival_airport", {}).get("time", ""),
                "duration_minutes": flight.get("total_duration", 0),
                "stops": len(legs) - 1,
                "price": float(flight.get("price", 0)),
                "currency": "USD",
                "cabin_class": intent.get("cabin_class", "economy"),
                "booking_url": "",
            })
        return results
    except Exception as exc:
        logger.error("SerpAPI search failed: %s", exc)
        return []


async def price_history_tool(intent: Dict[str, Any]) -> Dict[str, Any]:
    """Return 30-day average price for the route (stub — wire to your DB or a pricing API)."""
    # TODO: query historical price table or a pricing intelligence API
    return {"avg_price_30d": None, "min_price_30d": None, "max_price_30d": None}


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _parse_iso_duration(duration: str) -> int:
    """Parse ISO 8601 duration PT2H35M → minutes."""
    import re
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?", duration)
    if not match:
        return 0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    return hours * 60 + minutes
