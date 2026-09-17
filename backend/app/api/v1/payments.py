"""
Phase 11 — Paid Meetings
Payment gateway integration: Razorpay + Stripe.

Endpoints
---------
POST /payments/razorpay/create-order   -> creates a Razorpay order, returns order_id + key_id
POST /payments/razorpay/verify         -> verifies HMAC, marks booking as paid
POST /payments/stripe/create-session   -> Stripe Checkout session
POST /payments/stripe/webhook          -> Stripe webhook verifier
GET  /payments/booking/{booking_id}    -> payment status for a booking (authenticated)
"""

import hashlib
import hmac
import json
import logging
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_employee
from app.core.database import get_db
from app.models.booking import Booking
from app.models.user import User
from app.services.webhook_service import WebhookService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["Payments"])


# ---------------------------------------------------------------------------
# Pydantic request/response models
# ---------------------------------------------------------------------------

class RazorpayOrderRequest(BaseModel):
    booking_id: str


class RazorpayOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: str
    booking_id: str


class RazorpayVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    booking_id: str


class StripeSessionRequest(BaseModel):
    booking_id: str
    success_url: str
    cancel_url: str


class StripeSessionResponse(BaseModel):
    session_id: str
    url: str


class PaymentStatusResponse(BaseModel):
    booking_id: str
    payment_status: str
    payment_id: Optional[str] = None
    payment_order_id: Optional[str] = None
    payment_amount: Optional[int] = None
    payment_currency: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_razorpay_client():
    try:
        import razorpay
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Razorpay SDK not installed. Run: pip install razorpay",
        )
    key_id = os.getenv("RAZORPAY_KEY_ID", "")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "")
    if not key_id or not key_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Razorpay credentials not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)",
        )
    client = razorpay.Client(auth=(key_id, key_secret))
    return client, key_id, key_secret


def _get_stripe():
    try:
        import stripe
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe SDK not installed. Run: pip install stripe",
        )
    secret_key = os.getenv("STRIPE_SECRET_KEY", "")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe secret key not configured (STRIPE_SECRET_KEY)",
        )
    stripe.api_key = secret_key
    return stripe, webhook_secret


async def _get_booking_or_404(booking_id: str, db: AsyncSession) -> Booking:
    try:
        bid = uuid.UUID(booking_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid booking_id format")
    stmt = select(Booking).where(Booking.id == bid)
    res = await db.execute(stmt)
    booking = res.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


# ---------------------------------------------------------------------------
# Razorpay endpoints
# ---------------------------------------------------------------------------

@router.post("/razorpay/create-order", response_model=RazorpayOrderResponse)
async def razorpay_create_order(
    req: RazorpayOrderRequest,
    db: AsyncSession = Depends(get_db),
):
    """Creates a Razorpay order for a pending booking."""
    booking = await _get_booking_or_404(req.booking_id, db)

    if booking.payment_status == "paid":
        raise HTTPException(status_code=400, detail="Booking is already paid")

    amount_paise = booking.payment_amount
    currency = booking.payment_currency or "INR"

    if not amount_paise or amount_paise <= 0:
        raise HTTPException(status_code=400, detail="Booking has no payment amount set")

    client, key_id, _ = _get_razorpay_client()

    order_data = {
        "amount": amount_paise,
        "currency": currency,
        "receipt": f"kavach_{str(booking.id)[:8]}",
        "notes": {"booking_id": str(booking.id)},
    }

    try:
        order = client.order.create(data=order_data)
    except Exception as e:
        logger.error("Razorpay order creation failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Razorpay error: {e}")

    booking.payment_order_id = order["id"]
    booking.payment_status = "pending"
    await db.commit()

    return RazorpayOrderResponse(
        order_id=order["id"],
        amount=amount_paise,
        currency=currency,
        key_id=key_id,
        booking_id=str(booking.id),
    )


@router.post("/razorpay/verify")
async def razorpay_verify_payment(
    req: RazorpayVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verifies Razorpay HMAC signature and marks booking as paid."""
    booking = await _get_booking_or_404(req.booking_id, db)
    _, _, key_secret = _get_razorpay_client()

    payload_str = f"{req.razorpay_order_id}|{req.razorpay_payment_id}"
    expected = hmac.new(
        key_secret.encode("utf-8"),
        payload_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, req.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    booking.payment_status = "paid"
    booking.payment_id = req.razorpay_payment_id
    booking.payment_order_id = req.razorpay_order_id
    booking.status = "confirmed"
    await db.commit()

    try:
        await WebhookService.dispatch_event(
            db=db,
            user_id=str(booking.host_user_id) if hasattr(booking, "host_user_id") else None,
            event_name="booking.paid",
            payload={
                "booking_id": str(booking.id),
                "payment_provider": "razorpay",
                "payment_id": req.razorpay_payment_id,
                "amount": booking.payment_amount,
                "currency": booking.payment_currency,
            },
        )
    except Exception:
        pass

    return {"status": "paid", "booking_id": str(booking.id)}


# ---------------------------------------------------------------------------
# Stripe endpoints
# ---------------------------------------------------------------------------

@router.post("/stripe/create-session", response_model=StripeSessionResponse)
async def stripe_create_session(
    req: StripeSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Creates a Stripe Checkout Session for a pending booking."""
    booking = await _get_booking_or_404(req.booking_id, db)

    if booking.payment_status == "paid":
        raise HTTPException(status_code=400, detail="Booking is already paid")

    amount = booking.payment_amount
    currency = (booking.payment_currency or "inr").lower()

    if not amount or amount <= 0:
        raise HTTPException(status_code=400, detail="Booking has no payment amount set")

    stripe, _ = _get_stripe()

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": currency,
                        "product_data": {"name": f"Meeting Booking — {str(booking.id)[:8]}"},
                        "unit_amount": amount,
                    },
                    "quantity": 1,
                }
            ],
            mode="payment",
            success_url=req.success_url + f"?session_id={{CHECKOUT_SESSION_ID}}&booking_id={booking.id}",
            cancel_url=req.cancel_url,
            metadata={"booking_id": str(booking.id)},
        )
    except Exception as e:
        logger.error("Stripe session creation failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Stripe error: {e}")

    booking.payment_order_id = session.id
    booking.payment_status = "pending"
    await db.commit()

    return StripeSessionResponse(session_id=session.id, url=session.url)


@router.post("/stripe/webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
):
    """Handles Stripe webhook events (checkout.session.completed)."""
    body = await request.body()
    stripe_module, webhook_secret = _get_stripe()

    if not webhook_secret:
        raise HTTPException(
            status_code=503,
            detail="Stripe webhook secret not configured (STRIPE_WEBHOOK_SECRET)",
        )

    try:
        event = stripe_module.Webhook.construct_event(body, stripe_signature, webhook_secret)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if event["type"] == "checkout.session.completed":
        session_obj = event["data"]["object"]
        booking_id_str = session_obj.get("metadata", {}).get("booking_id")
        payment_intent = session_obj.get("payment_intent")

        if booking_id_str:
            try:
                booking = await _get_booking_or_404(booking_id_str, db)
                booking.payment_status = "paid"
                booking.payment_id = payment_intent
                booking.status = "confirmed"
                await db.commit()

                await WebhookService.dispatch_event(
                    db=db,
                    user_id=str(booking.host_user_id) if hasattr(booking, "host_user_id") else None,
                    event_name="booking.paid",
                    payload={
                        "booking_id": booking_id_str,
                        "payment_provider": "stripe",
                        "payment_id": payment_intent,
                        "amount": booking.payment_amount,
                        "currency": booking.payment_currency,
                    },
                )
            except Exception as e:
                logger.error("Stripe webhook processing error: %s", e)

    return {"received": True}


# ---------------------------------------------------------------------------
# Status endpoint
# ---------------------------------------------------------------------------

@router.get("/booking/{booking_id}", response_model=PaymentStatusResponse)
async def get_payment_status(
    booking_id: str,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Returns payment status for a booking (requires authentication)."""
    booking = await _get_booking_or_404(booking_id, db)
    return PaymentStatusResponse(
        booking_id=str(booking.id),
        payment_status=booking.payment_status or "free",
        payment_id=booking.payment_id,
        payment_order_id=booking.payment_order_id,
        payment_amount=booking.payment_amount,
        payment_currency=booking.payment_currency,
    )
