import hmac
import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.webhook import Webhook, WebhookLog

logger = logging.getLogger(__name__)


class WebhookService:
    """
    Enterprise Webhook Dispatcher:
    - Dispatches real-time event payloads to user-configured webhook destinations (Zapier, Make, custom CRMs).
    - Cryptographically signs every payload with HMAC SHA-256 for sender verification.
    - Records delivery logs and HTTP status codes for diagnostics.
    """

    @staticmethod
    def compute_signature(secret: str, payload_bytes: bytes) -> str:
        """Computes HMAC SHA-256 signature formatted as sha256=<hex>."""
        sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
        return f"sha256={sig}"

    async def dispatch_event(
        self,
        user_id: Optional[uuid.UUID],
        event: str,
        payload: Dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """
        Finds all active webhooks subscribed to `event` and dispatches the payload.
        """
        try:
            stmt = select(Webhook).where(Webhook.is_active == True)
            if user_id:
                stmt = stmt.where(Webhook.user_id == user_id)

            res = await db.execute(stmt)
            webhooks = list(res.scalars().all())

            for hook in webhooks:
                hook_events = hook.events or []
                if event not in hook_events and "*" not in hook_events:
                    continue

                await self._deliver_payload(hook, event, payload, db)
        except Exception as e:
            logger.warning(f"Error dispatching webhooks for event {event}: {e}")

    async def _deliver_payload(
        self,
        webhook: Webhook,
        event: str,
        payload: Dict[str, Any],
        db: AsyncSession,
    ) -> WebhookLog:
        """Delivers a payload to a specific webhook and records the log."""
        full_payload = {
            "id": str(uuid.uuid4()),
            "event": event,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "data": payload,
        }
        payload_bytes = json.dumps(full_payload, default=str).encode("utf-8")
        signature = self.compute_signature(webhook.secret, payload_bytes)
        delivery_id = str(uuid.uuid4())

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Kavach-Connect-Webhooks/1.0",
            "X-Kavach-Event": event,
            "X-Kavach-Delivery": delivery_id,
            "X-Kavach-Signature": signature,
        }

        status_code = None
        response_text = None
        log_status = "failed"

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(webhook.url, headers=headers, content=payload_bytes)
                status_code = res.status_code
                response_text = res.text[:2000] if res.text else None
                if 200 <= status_code < 300:
                    log_status = "success"
                else:
                    log_status = "failed"
        except Exception as err:
            response_text = f"Delivery connection error: {str(err)}"
            log_status = "failed"

        log_entry = WebhookLog(
            webhook_id=webhook.id,
            event=event,
            payload=full_payload,
            response_status_code=status_code,
            response_body=response_text,
            status=log_status,
            delivered_at=datetime.now(timezone.utc),
        )
        db.add(log_entry)
        try:
            await db.commit()
        except Exception as commit_err:
            logger.warning(f"Failed to save WebhookLog: {commit_err}")

        return log_entry

    async def send_test_ping(
        self,
        webhook: Webhook,
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """Sends a sample ping payload to verify webhook reception."""
        sample_payload = {
            "test": True,
            "message": "Ping from Kavach Connect Webhook Engine",
            "booking": {
                "id": str(uuid.uuid4()),
                "booking_reference": "KAV-TEST-9999",
                "title": "Meeting with Kavach",
                "start_time": datetime.now(timezone.utc).isoformat(),
                "end_time": (datetime.now(timezone.utc)).isoformat(),
                "status": "confirmed",
                "invitee": {
                    "name": "Jane Doe",
                    "email": "jane@example.com",
                    "timezone": "Asia/Kolkata",
                },
            },
        }
        log = await self._deliver_payload(webhook, "ping", sample_payload, db)
        return {
            "status_code": log.response_status_code,
            "status": log.status,
            "message": "Test ping succeeded!" if log.status == "success" else f"Test ping failed with status {log.response_status_code or 'error'}",
            "response_body": log.response_body,
        }


webhook_service = WebhookService()
