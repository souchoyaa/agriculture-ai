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
SAME_POINT_KM = 2.0  # live mode: a fresh cache this close counts as the same point (Open-Meteo grids are ~1-11 km)


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


def _value(column, i):
    """Numeric value at index i, or None for missing/short/non-numeric columns."""
    if not isinstance(column, list) or i >= len(column):
        return None
    v = column[i]
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else None


def _from_payload(payload: dict, origin: str, lat: float, lon: float) -> WeatherSeries:
    """Build a series from a cache/live payload. Raises ValueError for unusable structure (caller degrades).

    Tolerates partial data: missing variables or short columns become None for those hours;
    unparsable timestamps are skipped. A payload without any usable hourly time axis is unusable.
    """
    if not isinstance(payload, dict):
        raise ValueError("payload is not an object")
    hourly = payload.get("hourly")
    times = hourly.get("time") if isinstance(hourly, dict) else None
    if not isinstance(times, list) or not times:
        raise ValueError("missing hourly time axis")
    try:
        fetched_at = parse_time(str(payload["fetched_at"]))
        req_lat, req_lon = float(payload["request"]["latitude"]), float(payload["request"]["longitude"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f"missing fetched_at/request: {error}") from error
    columns = [hourly.get(k) for k in HOURLY.split(",")]
    hours = []
    for i, t in enumerate(times):
        try:
            when = parse_time(str(t))
        except ValueError:
            continue
        hours.append(Hour(when, *(_value(c, i) for c in columns)))
    if not hours:
        raise ValueError("no parsable hourly timestamps")
    return WeatherSeries(
        hours=hours,
        fetched_at=fetched_at,
        origin=origin,
        provider=str(payload.get("provider", "unknown")),
        license=str(payload.get("license", "unknown")),
        source_id="open_meteo",
        distance_km=round(distance_km(lat, lon, req_lat, req_lon), 2),
        note=str(payload.get("notes", "")),
    )


def cache_path(lat: float, lon: float) -> Path:
    return CACHE_DIR / f"open-meteo_{lat:.3f}_{lon:.3f}.json"


def load_cached(lat: float, lon: float) -> WeatherSeries | None:
    """Nearest usable cache entry within MAX_CACHE_DISTANCE_KM; corrupt or partial-but-unusable files are skipped."""
    best = None
    for path in sorted(CACHE_DIR.glob("open-meteo_*.json")):
        try:
            series = _from_payload(json.loads(path.read_text()), "cached", lat, lon)
        except (OSError, ValueError):
            continue  # corrupt or structurally unusable cache entry: ignore rather than fail the analysis
        if series.distance_km <= MAX_CACHE_DISTANCE_KM and (
                best is None or series.distance_km < best.distance_km
                or (series.distance_km == best.distance_km and series.fetched_at > best.fetched_at)):
            best = series
    return best


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
    """Return (series or None, notes). Never raises for network/cache problems.

    With network allowed: a fresh cache for (nearly) the same point is reused without a request;
    otherwise fetch live and cache it; if that fails, fall back to any cache within 15 km (possibly stale).
    """
    notes = []
    if allow_network is None:
        allow_network = os.environ.get("AGRI_WEATHER_LIVE") == "1"
    series = load_cached(lat, lon)
    if allow_network:
        if series and series.freshness(now) == "fresh" and series.distance_km <= SAME_POINT_KM:
            notes.append("fresh_cache_reused_no_request")
            return series, notes
        try:
            return fetch_live(lat, lon, now), notes
        except Exception as error:  # network is optional; degrade to cache
            notes.append(f"live_weather_failed:{type(error).__name__}")
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
