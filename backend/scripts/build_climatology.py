"""Build a compact committed ERA5 baseline (daily favourable-day flags per year) from raw downloads.

  uv run python scripts/fetch_data.py climatology      # network, raw -> data/raw/
  uv run python scripts/build_climatology.py           # offline  -> data/climatology/era5_<lat>_<lon>.json
"""
import argparse
import json
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.domain import climatology, knowledge, risk, weather  # noqa: E402
from app.domain.weather import Hour  # noqa: E402

RAW = ROOT / "data" / "raw"


def hours_from(payload: dict) -> list[Hour]:
    h = payload["hourly"]
    return [Hour(datetime.fromisoformat(t).replace(tzinfo=timezone.utc), h["temperature_2m"][i], h["relative_humidity_2m"][i],
                 h["precipitation"][i], None, None) for i, t in enumerate(h["time"]) if h["temperature_2m"][i] is not None]


def by_day(hours: list[Hour]) -> dict[date, list[Hour]]:
    days = defaultdict(list)
    for hour in hours:
        days[hour.time.date()].append(hour)
    return days


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lat", type=float, default=-1.95)
    parser.add_argument("--lon", type=float, default=30.06)
    args = parser.parse_args()
    model = knowledge.conditions()["coffee_leaf_rust"]["weather_model"]
    def raw(kind):
        return next(p for p in sorted(RAW.glob(f"era5_{kind}_{args.lat:.3f}_{args.lon:.3f}_*.json")) if not p.name.endswith(".meta.json"))
    clim_path, overlap_path = raw("clim"), raw("overlap")
    clim, meta = json.loads(clim_path.read_text()), json.loads(clim_path.with_suffix(".meta.json").read_text())

    flags = defaultdict(list)
    incomplete = 0
    for day, hs in sorted(by_day(hours_from(clim)).items()):
        assessed = risk.assess_day(hs, model)
        incomplete += not assessed["complete"]
        flags[str(day.year)].append("1" if assessed["favourable"] and assessed["complete"] else "0")

    # Cross-source check: ERA5 vs the operational forecast cache on overlapping complete days (UTC).
    op, _ = weather.get_weather(args.lat, args.lon, datetime.now(timezone.utc), allow_network=False)
    era_days, op_days = by_day(hours_from(json.loads(overlap_path.read_text()))), by_day(op.hours) if op else {}
    rows = []
    for day, hs in sorted(era_days.items()):
        if len(hs) == 24 and len(op_days.get(day, [])) == 24:
            a, b = risk.assess_day(hs, model), risk.assess_day(op_days[day], model)
            rows.append({"date": day.isoformat(), "era5_favourable": a["favourable"], "operational_favourable": b["favourable"],
                         "era5_mean_rh": round(mean(h.relative_humidity_pct for h in hs), 1),
                         "operational_mean_rh": round(mean(h.relative_humidity_pct for h in op_days[day]), 1)})
    overlap = {"days": len(rows), "agreement": sum(r["era5_favourable"] == r["operational_favourable"] for r in rows),
               "era5_favourable_days": sum(r["era5_favourable"] for r in rows),
               "operational_favourable_days": sum(r["operational_favourable"] for r in rows), "rows": rows,
               "note": "Small sample; ERA5 lags ~5 days so only early overlap days exist. Not a bias correction."}

    out = {"latitude": args.lat, "longitude": args.lon, "grid_latitude": meta["grid_latitude"], "grid_longitude": meta["grid_longitude"],
           "elevation_m": meta["elevation_m"], "condition_id": "coffee_leaf_rust", "model_fingerprint": climatology.fingerprint(model),
           "day_definition": "UTC calendar day, same as analysis windows",
           "source": {"source_ids": ["open_meteo_archive_era5", "hersbach_2020_era5"], "url": meta["url"], "accessed_at": meta["accessed_at"],
                      "license": meta["license"], "years": sorted(flags), "missing_temperature_hours": meta["missing_temperature_hours"],
                      "incomplete_days": incomplete},
           "overlap_check": overlap,
           "daily_favourable": {year: "".join(v) for year, v in sorted(flags.items())}}
    climatology.CLIM_DIR.mkdir(parents=True, exist_ok=True)
    path = climatology.CLIM_DIR / f"era5_{args.lat:.3f}_{args.lon:.3f}.json"
    path.write_text(json.dumps(out, indent=1) + "\n")
    yearly = {y: round(s.count("1") / len(s), 3) for y, s in out["daily_favourable"].items()}
    print(f"wrote {path.name}; annual favourable fraction {yearly}; overlap {overlap['agreement']}/{overlap['days']} agree")


if __name__ == "__main__":
    main()
