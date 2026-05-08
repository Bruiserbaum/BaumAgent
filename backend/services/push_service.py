"""Push notification dispatch for APNs (Mac), FCM (Android), and WNS (Windows)."""
import json
import logging
import time
from dataclasses import dataclass

import httpx
import jwt  # PyJWT

from config import Settings

logger = logging.getLogger(__name__)


@dataclass
class PushPayload:
    title: str
    body: str
    task_id: str


# ---------------------------------------------------------------------------
# APNs (Apple Push Notification service) — token-based (JWT) auth
# ---------------------------------------------------------------------------

_apns_token_cache: dict = {"token": None, "issued_at": 0}
_APNS_TOKEN_TTL = 3000  # regenerate before Apple's 60-min expiry


def _get_apns_jwt(settings: Settings) -> str:
    now = int(time.time())
    cached = _apns_token_cache
    if cached["token"] and (now - cached["issued_at"]) < _APNS_TOKEN_TTL:
        return cached["token"]

    token = jwt.encode(
        {"iss": settings.apns_team_id, "iat": now},
        settings.apns_key_pem.replace("\\n", "\n"),
        algorithm="ES256",
        headers={"kid": settings.apns_key_id},
    )
    cached["token"] = token
    cached["issued_at"] = now
    return token


async def _send_apns(device_token: str, payload: PushPayload, settings: Settings) -> bool:
    host = "api.push.apple.com" if settings.apns_production else "api.sandbox.push.apple.com"
    url = f"https://{host}/3/device/{device_token}"
    body = {
        "aps": {
            "alert": {"title": payload.title, "body": payload.body},
            "sound": "default",
        },
        "task_id": payload.task_id,
    }
    headers = {
        "authorization": f"bearer {_get_apns_jwt(settings)}",
        "apns-topic": settings.apns_bundle_id,
        "apns-push-type": "alert",
    }
    async with httpx.AsyncClient(http2=True) as client:
        r = await client.post(url, json=body, headers=headers, timeout=10)
    if r.status_code != 200:
        logger.warning("APNs error %s: %s", r.status_code, r.text)
        return False
    return True


# ---------------------------------------------------------------------------
# FCM (Firebase Cloud Messaging) — legacy server key
# ---------------------------------------------------------------------------

async def _send_fcm(device_token: str, payload: PushPayload, settings: Settings) -> bool:
    body = {
        "to": device_token,
        "notification": {"title": payload.title, "body": payload.body},
        "data": {"task_id": payload.task_id},
    }
    headers = {
        "Authorization": f"key={settings.fcm_server_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://fcm.googleapis.com/fcm/send",
            json=body,
            headers=headers,
            timeout=10,
        )
    if r.status_code != 200:
        logger.warning("FCM error %s: %s", r.status_code, r.text)
        return False
    result = r.json()
    if result.get("failure", 0) > 0:
        logger.warning("FCM delivery failure: %s", result)
        return False
    return True


# ---------------------------------------------------------------------------
# WNS (Windows Notification Service)
# ---------------------------------------------------------------------------

_wns_token_cache: dict = {"token": None, "expires_at": 0}


async def _get_wns_token(settings: Settings) -> str | None:
    now = int(time.time())
    cached = _wns_token_cache
    if cached["token"] and now < cached["expires_at"] - 60:
        return cached["token"]

    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://login.live.com/accesstoken.srf",
            data={
                "grant_type": "client_credentials",
                "client_id": settings.wns_package_sid,
                "client_secret": settings.wns_client_secret,
                "scope": "notify.windows.com",
            },
            timeout=10,
        )
    if r.status_code != 200:
        logger.warning("WNS token error %s: %s", r.status_code, r.text)
        return None
    data = r.json()
    cached["token"] = data["access_token"]
    cached["expires_at"] = now + int(data.get("expires_in", 86400))
    return cached["token"]


async def _send_wns(channel_uri: str, payload: PushPayload, settings: Settings) -> bool:
    token = await _get_wns_token(settings)
    if not token:
        return False
    xml = (
        f"<toast>"
        f"<visual><binding template='ToastText02'>"
        f"<text id='1'>{payload.title}</text>"
        f"<text id='2'>{payload.body}</text>"
        f"</binding></visual>"
        f"</toast>"
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "text/xml",
        "X-WNS-Type": "wns/toast",
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(channel_uri, content=xml.encode(), headers=headers, timeout=10)
    if r.status_code not in (200, 202):
        logger.warning("WNS error %s: %s", r.status_code, r.text)
        return False
    return True


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

async def dispatch(device_token: str, platform: str, payload: PushPayload, settings: Settings) -> bool:
    """Send a push notification. Returns True on success, False on failure (never raises)."""
    try:
        if platform == "apns" and settings.apns_key_id:
            return await _send_apns(device_token, payload, settings)
        if platform == "fcm" and settings.fcm_server_key:
            return await _send_fcm(device_token, payload, settings)
        if platform == "wns" and settings.wns_package_sid:
            return await _send_wns(device_token, payload, settings)
        logger.debug("Push skipped: platform=%s (no credentials configured)", platform)
        return False
    except Exception:
        logger.exception("Push dispatch failed for platform=%s", platform)
        return False
