"""Tacticus Account Tracker - FastAPI backend.

The browser cannot call api.tacticusgame.com directly (no CORS support), so this
server relays the request. The API key is received in a POST body, forwarded once
in the X-API-KEY header, and is never stored or logged.
"""
import os
import time
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_URL = os.getenv("TACTICUS_BASE_URL", "https://api.tacticusgame.com").rstrip("/")
STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="Tacticus Account Tracker")


class KeyIn(BaseModel):
    api_key: str = Field(min_length=8, max_length=200)


def find_token_buckets(node: Any, path: str = "") -> list[dict]:
    """Recursively find token-like objects (they carry `max` plus a count/regen field).

    The Tacticus player payload nests regenerating resources (raid tokens, bombs,
    arena tokens ...) as objects with fields such as current/max/nextTokenInSeconds/
    regenDelayInSeconds. Walking the tree keeps the app working if the API adds a
    new bucket or moves one.
    """
    found: list[dict] = []
    if isinstance(node, dict):
        has_max = isinstance(node.get("max"), (int, float))
        has_count = any(isinstance(node.get(k), (int, float)) for k in ("current", "count", "amount", "value"))
        has_regen = any(k in node for k in ("nextTokenInSeconds", "regenDelayInSeconds"))
        if has_max and (has_count or has_regen):
            current = next((node[k] for k in ("current", "count", "amount", "value") if isinstance(node.get(k), (int, float))), 0)
            found.append({
                "name": path.split(".")[-1] or "token",
                "path": path,
                "current": current,
                "max": node["max"],
                "nextTokenInSeconds": node.get("nextTokenInSeconds"),
                "regenDelayInSeconds": node.get("regenDelayInSeconds"),
            })
        else:
            for k, v in node.items():
                found += find_token_buckets(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            found += find_token_buckets(v, f"{path}[{i}]")
    return found


def summarize(payload: dict) -> dict:
    player = payload.get("player", payload)
    meta = payload.get("metaData", {})
    units = player.get("units") or []
    buckets = find_token_buckets(player)
    return {
        "name": (player.get("details") or {}).get("name"),
        "powerLevel": (player.get("details") or {}).get("powerLevel"),
        "lastUpdatedOn": meta.get("lastUpdatedOn"),
        "apiKeyExpiresOn": meta.get("apiKeyExpiresOn"),
        "scopes": meta.get("scopes"),
        "serverTime": int(time.time()),
        "tokens": buckets,
        "unitCount": len(units),
        "units": [
            {
                "id": u.get("id"),
                "name": u.get("name") or u.get("id"),
                "faction": u.get("faction"),
                "rank": u.get("rank"),
                "xpLevel": u.get("xpLevel"),
                "progressionIndex": u.get("progressionIndex"),
                "upgrades": len(set(u.get("upgrades") or [])),
            }
            for u in units
        ],
    }


@app.post("/api/account")
async def account(body: KeyIn):
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f"{BASE_URL}/api/v1/player", headers={"X-API-KEY": body.api_key})
    except httpx.HTTPError:
        raise HTTPException(502, "Tacticus API에 연결하지 못했습니다. 잠시 후 다시 시도하세요.")
    if r.status_code in (401, 403):
        raise HTTPException(403, "API 키가 올바르지 않거나 Player 권한(scope)이 없습니다.")
    if r.status_code == 429:
        raise HTTPException(429, "요청이 너무 많습니다. 잠시 후 다시 시도하세요.")
    if r.status_code >= 400:
        raise HTTPException(502, f"Tacticus API 오류 (HTTP {r.status_code}).")
    try:
        return summarize(r.json())
    except ValueError:
        raise HTTPException(502, "Tacticus API 응답을 해석하지 못했습니다.")


@app.get("/health")
async def health():
    return {"ok": True}


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")
