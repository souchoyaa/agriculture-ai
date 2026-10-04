"""Reproducible ingestion of public, no-key environmental data (Open-Meteo, CC BY 4.0).

  uv run python scripts/fetch_data.py forecast [--lat -1.95 --lon 30.06]   -> data/weather_cache/ (committed, ~20 KB)
  uv run python scripts/fetch_data.py era5-chinchina                     -> data/raw/ (git-ignored, ~3 MB)
  uv run python scripts/fetch_data.py climatology [--lat --lon]          -> data/raw/ (git-ignored, ~3 MB); then
  uv run python scripts/build_climatology.py [--lat --lon]               -> data/climatology/ (committed, ~5 KB)

Raw downloads go to data/raw/ with a .meta.json (URL, access time, license); normalized summaries
are produced by scripts/validate_chinchina.py into data/validation/ (committed, small).
"""
import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.domain import weather  # noqa: E402

RAW = ROOT / "data" / "raw"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

# Chinchiná, Caldas, Colombia (Cenicafé area). Avelino et al. 2015 compare 2008-2011 (epidemic)
# with 1991-1994 (low incidence) weather here.
CHINCHINA = {"name": "chinchina", "latitude": 4.99, "longitude": -75.60,
             "periods": [("1991-01-01", "1994-12-31"), ("2008-01-01", "2011-12-31")]}


def get_json(url: str, timeout: float = 120) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read())


def fetch_era5(site: dict) -> list[Path]:
    RAW.mkdir(parents=True, exist_ok=True)
    paths = []
    for start, end in site["periods"]:
        params = {"latitude": site["latitude"], "longitude": site["longitude"], "start_date": start, "end_date": end,
                  "hourly": "temperature_2m,relative_humidity_2m,precipitation", "timezone": "UTC"}
        url = f"{ARCHIVE}?{urllib.parse.urlencode(params)}"
        payload = get_json(url)
        path = RAW / f"open-meteo-archive_{site['name']}_{start}_{end}.json"
        path.write_text(json.dumps(payload, separators=(",", ":")))
        meta = {"url": url, "accessed_at": datetime.now(timezone.utc).isoformat(), "license": "CC BY 4.0 (Open-Meteo.com; ERA5/ERA5-Land reanalysis, Copernicus)",
                "grid_latitude": payload.get("latitude"), "grid_longitude": payload.get("longitude"), "elevation_m": payload.get("elevation"),
                "hours": len(payload["hourly"]["time"])}
        path.with_suffix(".meta.json").write_text(json.dumps(meta, indent=1))
        print(f"wrote {path.name}: {meta['hours']} hours, grid elevation {meta['elevation_m']} m")
        paths.append(path)
    return paths


def fetch_era5_climatology(lat: float, lon: float, start_year: int, end_year: int, overlap_start: str, overlap_end: str) -> list[Path]:
    """ERA5 only (models=era5) so the baseline is one consistent reanalysis; plus a recent overlap window
    to compare against the operational forecast cache (ERA5 lags real time by ~5 days)."""
    RAW.mkdir(parents=True, exist_ok=True)
    paths = []
    for kind, start, end in (("clim", f"{start_year}-01-01", f"{end_year}-12-31"), ("overlap", overlap_start, overlap_end)):
        params = {"latitude": lat, "longitude": lon, "start_date": start, "end_date": end, "models": "era5",
                  "hourly": "temperature_2m,relative_humidity_2m,precipitation", "timezone": "UTC"}
        url = f"{ARCHIVE}?{urllib.parse.urlencode(params)}"
        payload = get_json(url, timeout=300)
        path = RAW / f"era5_{kind}_{lat:.3f}_{lon:.3f}_{start}_{end}.json"
        path.write_text(json.dumps(payload, separators=(",", ":")))
        missing = sum(v is None for v in payload["hourly"]["temperature_2m"])
        meta = {"url": url, "accessed_at": datetime.now(timezone.utc).isoformat(), "license": "CC BY 4.0 (Open-Meteo.com; ERA5, Copernicus)",
                "grid_latitude": payload.get("latitude"), "grid_longitude": payload.get("longitude"), "elevation_m": payload.get("elevation"),
                "hours": len(payload["hourly"]["time"]), "missing_temperature_hours": missing}
        path.with_suffix(".meta.json").write_text(json.dumps(meta, indent=1))
        print(f"wrote {path.name}: {meta['hours']} hours, {missing} missing")
        paths.append(path)
    return paths


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("what", choices=["forecast", "era5-chinchina", "climatology"])
    parser.add_argument("--start-year", type=int, default=2015)
    parser.add_argument("--end-year", type=int, default=2024)
    parser.add_argument("--overlap", nargs=2, default=["2026-09-19", "2026-10-03"], metavar=("START", "END"))
    parser.add_argument("--lat", type=float, default=-1.95)
    parser.add_argument("--lon", type=float, default=30.06)
    args = parser.parse_args()
    if args.what == "forecast":
        series = weather.fetch_live(args.lat, args.lon, datetime.now(timezone.utc))
        print(f"cached {len(series.hours)} hours for {args.lat},{args.lon} -> {weather.cache_path(args.lat, args.lon)}")
    elif args.what == "climatology":
        fetch_era5_climatology(args.lat, args.lon, args.start_year, args.end_year, *args.overlap)
    else:
        fetch_era5(CHINCHINA)


if __name__ == "__main__":
    main()
