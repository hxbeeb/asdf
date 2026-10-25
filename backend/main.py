"""WindLens API: decision-time wind forecast assessment using Elexon data only."""
from __future__ import annotations

import asyncio
import math
import os
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from statistics import mean
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

ELEXON = "https://data.elexon.co.uk/bmrs/api/v1"
LONDON = ZoneInfo("Europe/London")
TIMEOUT = 25.0
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"

app = FastAPI(title="WindLens API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["GET"],
    allow_headers=["*"],
)


def decision_cutoff(delivery: date, cutoff_hour: int) -> datetime:
    """Market-local previous-day cutoff, returned in UTC for comparison to publishTime."""
    local = datetime.combine(delivery - timedelta(days=1), time(cutoff_hour), tzinfo=LONDON)
    return local.astimezone(timezone.utc)


def hour_floor(value: datetime) -> datetime:
    return value.replace(minute=0, second=0, microsecond=0)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


async def get_json(client: httpx.AsyncClient, path: str, params: dict[str, str]) -> Any:
    response = await client.get(f"{ELEXON}{path}", params=params)
    response.raise_for_status()
    payload = response.json()
    return payload.get("data", payload) if isinstance(payload, dict) else payload


async def fetch_actuals(client: httpx.AsyncClient, delivery: date) -> dict[datetime, float]:
    # FUELHH is the requested half-hourly national outturn dataset.  Its date
    # filters use settlement dates rather than target timestamps.
    rows = await get_json(
        client,
        "/datasets/FUELHH/stream",
        {"settlementDateFrom": delivery.isoformat(), "settlementDateTo": delivery.isoformat()},
    )
    actuals: dict[datetime, float] = {}
    for row in rows:
        if row.get("fuelType") == "WIND" and row.get("generation") is not None:
            stamp = parse_time(row["startTime"])
            if stamp.date() == delivery:
                actuals[stamp] = float(row["generation"])
    return actuals


async def fetch_evolution(client: httpx.AsyncClient, target_hour: datetime) -> list[dict[str, Any]]:
    # Evolution retains superseded forecasts and is essential: the "latest"
    # endpoint would leak information that was unavailable at day-ahead decision time.
    rows = await get_json(client, "/forecast/generation/wind/evolution", {"startTime": iso(target_hour)})
    return rows


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def choose_asof(rows: list[dict[str, Any]], cutoff: datetime) -> dict[str, Any] | None:
    eligible = [row for row in rows if parse_time(row["publishTime"]) <= cutoff]
    return max(eligible, key=lambda row: parse_time(row["publishTime"]), default=None)


async def fetch_day(delivery: date, cutoff_hour: int) -> tuple[list[dict[str, Any]], str]:
    cutoff = decision_cutoff(delivery, cutoff_hour)
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        actual_task = fetch_actuals(client, delivery)
        hours = [datetime.combine(delivery, time(h), tzinfo=timezone.utc) for h in range(24)]
        evolution_tasks = [fetch_evolution(client, target) for target in hours]
        actuals, *evolutions = await asyncio.gather(actual_task, *evolution_tasks)

    selected: dict[datetime, dict[str, Any]] = {}
    for target, rows in zip(hours, evolutions):
        picked = choose_asof(rows, cutoff)
        if picked:
            selected[target] = picked

    points: list[dict[str, Any]] = []
    for stamp in sorted(actuals):
        picked = selected.get(hour_floor(stamp))
        if not picked:
            continue
        forecast = float(picked["generation"])
        actual = actuals[stamp]
        points.append(
            {
                "startTime": iso(stamp),
                "actualMW": round(actual),
                "forecastMW": round(forecast),
                "errorMW": round(forecast - actual),
                "publishTime": picked["publishTime"],
            }
        )
    return points, iso(cutoff)


def metrics(points: list[dict[str, Any]]) -> dict[str, float | int | None]:
    if not points:
        return {"count": 0, "maeMW": None, "rmseMW": None, "biasMW": None, "mape": None, "underForecastRate": None, "p90AbsoluteErrorMW": None}
    errors = [point["errorMW"] for point in points]
    absolute = sorted(abs(value) for value in errors)
    mape_values = [abs(point["errorMW"]) / point["actualMW"] * 100 for point in points if point["actualMW"] > 0]
    p90_index = max(0, math.ceil(len(absolute) * 0.9) - 1)
    return {
        "count": len(points),
        "maeMW": round(mean(absolute)),
        "rmseMW": round(math.sqrt(mean(value * value for value in errors))),
        "biasMW": round(mean(errors)),
        "mape": round(mean(mape_values), 1) if mape_values else None,
        "underForecastRate": round(sum(value < 0 for value in errors) / len(errors) * 100, 1),
        "p90AbsoluteErrorMW": round(absolute[p90_index]),
    }


def make_demo(delivery: date, cutoff_hour: int) -> tuple[list[dict[str, Any]], str]:
    """Deterministic offline fallback, visibly labelled by the caller."""
    cutoff = decision_cutoff(delivery, cutoff_hour)
    points = []
    for half_hour in range(48):
        stamp = datetime.combine(delivery, time(), tzinfo=timezone.utc) + timedelta(minutes=30 * half_hour)
        actual = 11800 + 5200 * math.sin((half_hour - 10) / 7) + 900 * math.sin(half_hour / 2.8)
        error = 550 * math.sin(half_hour / 3) - 220 * math.cos(half_hour / 5)
        points.append({"startTime": iso(stamp), "actualMW": round(actual), "forecastMW": round(actual + error), "errorMW": round(error), "publishTime": iso(cutoff - timedelta(minutes=30))})
    return points, iso(cutoff)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "source": "Elexon BMRS"}


@app.get("/api/decision-view")
async def decision_view(
    delivery_date: date = Query(..., ge=date(2026, 1, 1), le=date(2026, 1, 31)),
    cutoff_hour: int = Query(11, ge=0, le=23),
) -> dict[str, Any]:
    """Return only forecasts that could have been known by the selected cutoff."""
    try:
        points, cutoff = make_demo(delivery_date, cutoff_hour) if DEMO_MODE else await fetch_day(delivery_date, cutoff_hour)
        if not points:
            raise HTTPException(status_code=404, detail="No matched WIND actual/forecast observations for that delivery date.")
        return {
            "deliveryDate": delivery_date.isoformat(),
            "cutoffTime": cutoff,
            "cutoffHourLocal": cutoff_hour,
            "source": "demo" if DEMO_MODE else "Elexon BMRS (FUELHH + WINDFOR)",
            "metrics": metrics(points),
            "points": points,
            "methodology": "For every delivery hour, choose the most recent WINDFOR run published no later than the previous-day local cutoff. Replicate the hourly forecast to each matched FUELHH half-hour for scoring.",
        }
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"Elexon data request failed: {error}") from error


# The production Docker image is a single deployable: FastAPI serves both the
# API and Vite's compiled React assets. Mount last so /api routes keep priority.
static_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
