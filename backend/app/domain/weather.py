"""Hourly weather access with an offline-first file cache and explicit freshness.

Live fetching (Open-Meteo) is opt-in via AGRI_WEATHER_LIVE=1; any failure falls back to the cache.
The cache holds model output, not station observations; provenance says so.
"""
import json
import math
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

CACHE_DIR = Path(os.environ.get("AGRI_WEATHER_CACHE", Path(__file__).resolve().parents[2] / "data" / "weather_cache"))
OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
HOURLY = "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m"
MAX_CACHE_DISTANCE_KM = 15.0
FRESH_HOURS = 6.0


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def distance_km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


@dataclass
class Hour:
    time: datetime
    temperature_c: float | None
    relative_humidity_pct: float | None
    precipitation_mm: float | None
    wind_speed_kmh: float | None
    wind_from_deg: float | None


@dataclass
class WeatherSeries:
    hours: list[Hour]
    fetched_at: datetime
    origin: str  # "cached" | "live"
    provider: str
    license: str
    source_id: str
    distance_km: float
    note: str

    def age_hours(self, now: datetime) -> float:
        return max(0.0, (now - self.fetched_at).total_seconds() / 3600)

    def freshness(self, now: datetime) -> str:
        return "fresh" if self.age_hours(now) <= FRESH_HOURS else "stale"

    def window(self, start: datetime, end: datetime) -> list[Hour]:
        return [h for h in self.hours if start <= h.time < end]


def _from_payload(payload: dict, origin: str, lat: float, lon: float) -> WeatherSeries:
    hourly = payload["hourly"]
    hours = [
        Hour(parse_time(t), *(hourly[k][i] for k in HOURLY.split(",")))
        for i, t in enumerate(hourly["time"])
    ]
    return WeatherSeries(
        hours=hours,
        fetched_at=parse_time(payload["fetched_at"]),
        origin=origin,
        provider=payload["provider"],
        license=payload["license"],
        source_id="open_meteo",
        distance_km=round(distance_km(lat, lon, payload["request"]["latitude"], payload["request"]["longitude"]), 2),
        note=payload.get("notes", ""),
    )


def cache_path(lat: float, lon: float) -> Path:
    return CACHE_DIR / f"open-meteo_{lat:.3f}_{lon:.3f}.json"


def load_cached(lat: float, lon: float) -> WeatherSeries | None:
    best = None
    for path in sorted(CACHE_DIR.glob("open-meteo_*.json")):
        try:
            payload = json.loads(path.read_text())
            request = payload["request"]
            d = distance_km(lat, lon, request["latitude"], request["longitude"])
        except (OSError, ValueError, KeyError):
            continue  # corrupt cache entry: ignore rather than fail the analysis
        if d <= MAX_CACHE_DISTANCE_KM and (best is None or d < best[0] or (d == best[0] and payload["fetched_at"] > best[1]["fetched_at"])):
            best = (d, payload)
    return _from_payload(best[1], "cached", lat, lon) if best else None


def fetch_live(lat: float, lon: float, now: datetime, timeout: float = 8.0) -> WeatherSeries:
    query = urllib.parse.urlencode({"latitude": round(lat, 3), "longitude": round(lon, 3), "hourly": HOURLY,
                                    "past_days": 14, "forecast_days": 7, "timezone": "UTC"})
    with urllib.request.urlopen(f"{OPEN_METEO}?{query}", timeout=timeout) as response:
        raw = json.loads(response.read())
    payload = {
        "provider": "open-meteo", "endpoint": OPEN_METEO, "license": "CC BY 4.0 (Open-Meteo.com)",
        "fetched_at": now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "request": {"latitude": round(lat, 3), "longitude": round(lon, 3), "past_days": 14, "forecast_days": 7, "timezone": "UTC"},
        "grid_latitude": raw.get("latitude"), "grid_longitude": raw.get("longitude"), "elevation_m": raw.get("elevation"),
        "notes": "Open-Meteo model output, not station observations; hours before fetched_at are past-days model data, later hours forecast.",
        "hourly_units": raw.get("hourly_units"), "hourly": raw["hourly"],
    }
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = cache_path(lat, lon).with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, separators=(",", ":")))
    tmp.replace(cache_path(lat, lon))
    return _from_payload(payload, "live", lat, lon)


def get_weather(lat: float, lon: float, now: datetime, allow_network: bool | None = None) -> tuple[WeatherSeries | None, list[str]]:
    """Return (series or None, notes). Never raises for network/cache problems."""
    notes = []
    if allow_network is None:
        allow_network = os.environ.get("AGRI_WEATHER_LIVE") == "1"
    if allow_network:
        try:
            return fetch_live(lat, lon, now), notes
        except Exception as error:  # network is optional; degrade to cache
            notes.append(f"live_weather_failed:{type(error).__name__}")
    series = load_cached(lat, lon)
    if series is None:
        notes.append("no_cached_weather_within_15km")
    return series, notes


def mean_wind_from(hours: list[Hour]) -> tuple[float, float] | None:
    """Speed-weighted mean wind direction (degrees, meteorological 'from') and resultant consistency 0-1."""
    usable = [h for h in hours if h.wind_speed_kmh is not None and h.wind_from_deg is not None]
    total = sum(h.wind_speed_kmh for h in usable)
    if not usable or total <= 0:
        return None
    x = sum(h.wind_speed_kmh * math.sin(math.radians(h.wind_from_deg)) for h in usable)
    y = sum(h.wind_speed_kmh * math.cos(math.radians(h.wind_from_deg)) for h in usable)
    return math.degrees(math.atan2(x, y)) % 360, math.hypot(x, y) / total


def day_floor(t: datetime) -> datetime:
    return t.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def hours_between(start: datetime, end: datetime) -> int:
    return int((end - start) / timedelta(hours=1))
