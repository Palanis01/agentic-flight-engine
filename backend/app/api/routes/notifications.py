"""
Push notification registration and management routes
"""
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, verify_token
from app.services.notification_service import NotificationService

router = APIRouter()


class DeviceRegistration(BaseModel):
    push_token: str
    platform: str  # "ios" | "android" | "expo"
    device_id: str


class TestNotificationRequest(BaseModel):
    push_token: str
    title: str = "Flight Engine"
    body: str = "Test notification from Agentic AI Flight Engine 🛫"


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_device(
    request: DeviceRegistration,
    db: AsyncSession = Depends(get_db),
    _token: dict = Depends(verify_token),
):
    service = NotificationService()
    await service.register_device(
        user_id=_token["sub"],
        push_token=request.push_token,
        platform=request.platform,
        device_id=request.device_id,
    )
    return {"status": "registered"}


@router.post("/test")
async def send_test_notification(
    request: TestNotificationRequest,
    _token: dict = Depends(verify_token),
):
    service = NotificationService()
    result = await service.send_push(
        push_token=request.push_token,
        title=request.title,
        body=request.body,
        data={"type": "test"},
    )
    return result
