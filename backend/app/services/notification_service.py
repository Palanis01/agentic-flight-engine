"""
Push notification service — supports Expo, FCM (Android), and APNs (iOS)
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
FCM_URL = "https://fcm.googleapis.com/fcm/send"


class NotificationService:
    """Unified push notification service."""

    async def register_device(
        self,
        user_id: str,
        push_token: str,
        platform: str,
        device_id: str,
    ) -> None:
        """
        Store device registration.
        TODO: persist to DeviceToken table in DB.
        """
        logger.info("Registering device %s for user %s (platform=%s)", device_id, user_id, platform)

    async def send_push(
        self,
        push_token: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Route notification to the correct provider based on token format.
        - Expo tokens start with 'ExponentPushToken[...]'
        - FCM tokens are long alphanumeric strings (Android)
        - APNs tokens are hex strings (iOS) — requires native APNs setup
        """
        if push_token.startswith("ExponentPushToken"):
            return await self._send_expo(push_token, title, body, data or {})
        else:
            return await self._send_fcm(push_token, title, body, data or {})

    async def send_bulk(self, tokens: List[str], title: str, body: str, data: Optional[Dict] = None) -> None:
        """Fire-and-forget bulk push to a list of tokens."""
        import asyncio
        tasks = [self.send_push(t, title, body, data) for t in tokens]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, Exception):
                logger.error("Bulk push error: %s", r)

    # ------------------------------------------------------------------
    # Expo Push Notifications
    # ------------------------------------------------------------------

    async def _send_expo(self, token: str, title: str, body: str, data: Dict) -> Dict:
        payload = {
            "to": token,
            "title": title,
            "body": body,
            "data": data,
            "sound": "default",
            "priority": "high",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                EXPO_PUSH_URL,
                json=payload,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Authorization": f"Bearer {settings.EXPO_ACCESS_TOKEN}",
                    "Content-Type": "application/json",
                },
            )
            r.raise_for_status()
            result = r.json()
            logger.info("Expo push result: %s", result)
            return result

    # ------------------------------------------------------------------
    # Firebase Cloud Messaging (FCM) — Android & Web
    # ------------------------------------------------------------------

    async def _send_fcm(self, token: str, title: str, body: str, data: Dict) -> Dict:
        payload = {
            "to": token,
            "notification": {"title": title, "body": body, "sound": "default"},
            "data": {k: str(v) for k, v in data.items()},
            "priority": "high",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                FCM_URL,
                json=payload,
                headers={
                    "Authorization": f"key={settings.FCM_SERVER_KEY}",
                    "Content-Type": "application/json",
                },
            )
            r.raise_for_status()
            result = r.json()
            logger.info("FCM push result: %s", result)
            return result

    # ------------------------------------------------------------------
    # APNs (iOS direct) — requires JWT signing
    # ------------------------------------------------------------------

    async def _send_apns(self, device_token: str, title: str, body: str, data: Dict) -> None:
        """
        APNs HTTP/2 push.
        Requires apns2 library or jwt + httpx with HTTP/2 support.
        Stub — implement using the `apns2` package.
        """
        raise NotImplementedError("APNs direct: install apns2 and implement JWT signing")


# ---------------------------------------------------------------------------
# Price alert checker (run via Celery / APScheduler)
# ---------------------------------------------------------------------------

class PriceAlertMonitor:
    """
    Background job: check active alerts, fire push when price drops.
    Schedule via Celery beat or APScheduler every 15 minutes.
    """

    def __init__(self, db_session, notif_service: NotificationService):
        self.db = db_session
        self.notif = notif_service

    async def run(self) -> None:
        from sqlalchemy import select
        from app.models.flight import PriceAlert
        from app.agents.tools import amadeus_search_tool

        result = await self.db.execute(
            select(PriceAlert).where(PriceAlert.is_active == True)  # noqa
        )
        alerts: List[PriceAlert] = result.scalars().all()

        for alert in alerts:
            try:
                intent = {
                    "origin": alert.origin,
                    "destination": alert.destination,
                    "departure_date": alert.departure_date,
                    "passengers": 1,
                    "cabin_class": "economy",
                }
                offers = await amadeus_search_tool(intent)
                if not offers:
                    continue

                best_price = min(o["price"] for o in offers)
                alert.current_price = best_price

                if best_price <= alert.target_price and alert.push_token:
                    await self.notif.send_push(
                        push_token=alert.push_token,
                        title="✈️ Price Drop Alert!",
                        body=(
                            f"{alert.origin} → {alert.destination} on {alert.departure_date} "
                            f"is now ${best_price:.0f} (your target: ${alert.target_price:.0f})"
                        ),
                        data={
                            "type": "price_alert",
                            "alert_id": str(alert.id),
                            "price": str(best_price),
                        },
                    )
                    from datetime import datetime, timezone
                    alert.triggered_at = datetime.now(timezone.utc)
                    alert.is_active = False

                await self.db.commit()
            except Exception as exc:
                logger.error("Alert check failed for %s: %s", alert.id, exc)
