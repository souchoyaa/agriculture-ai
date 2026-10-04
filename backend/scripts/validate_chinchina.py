"""Qualitative consistency check of the weather heuristic on real ERA5 data for Chinchiná, Colombia.

Avelino et al. 2015 report, for Chinchiná, higher minimum / lower maximum temperatures in the 2008-2011
coffee rust epidemic years than in the low-incidence 1991-1994 period (+0.1 / -0.5 °C). We check whether
ERA5 reproduces the reduced thermal amplitude and whether our favourable-day fraction is higher in the
epidemic period. This is NOT a validation against disease incidence (no incidence data is used).

  uv run python scripts/fetch_data.py era5-chinchina   # once, needs network
  uv run python scripts/validate_chinchina.py          # offline, writes data/validation/chinchina_era5_summary.json
"""
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.domain import knowledge, risk  # noqa: E402
from app.domain.weather import Hour  # noqa: E402

RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "validation" / "chinchina_era5_summary.json"
LOCAL_OFFSET = timedelta(hours=-5)  # Colombia, no DST
PERIODS = {"low_incidence_1991_1994": "1991-01-01_1994-12-31", "epidemic_2008_2011": "2008-01-01_2011-12-31"}


def load(stem: str) -> tuple[list[Hour], dict]:
    path = RAW / f"open-meteo-archive_chinchina_{stem}.json"
    payload, meta = json.loads(path.read_text()), json.loads(path.with_suffix(".meta.json").read_text())
    h = payload["hourly"]
    hours = [Hour(datetime.fromisoformat(t).replace(tzinfo=timezone.utc), h["temperature_2m"][i], h["relative_humidity_2m"][i],
                  h["precipitation"][i], None, None) for i, t in enumerate(h["time"])]
    return hours, meta


def summarize(hours: list[Hour], model: dict) -> dict:
    days = defaultdict(list)
    for hour in hours:
        days[(hour.time + LOCAL_OFFSET).date()].append(hour)
    rows, missing = [], 0
    for day, hs in sorted(days.items()):
        temps = [h.temperature_c for h in hs if h.temperature_c is not None]
        missing += sum(h.temperature_c is None or h.relative_humidity_pct is None for h in hs)
        if len(temps) < 20:
            continue
        assessed = risk.assess_day(hs, model)
        rows.append({"year": day.year, "tmin": min(temps), "tmax": max(temps), "favourable": assessed["favourable"],
                     "wet_spell": assessed["longest_wet_spell_h"]})

    def stats(rs):
        return {"days": len(rs), "mean_tmin_c": round(mean(r["tmin"] for r in rs), 2), "mean_tmax_c": round(mean(r["tmax"] for r in rs), 2),
                "mean_diurnal_amplitude_c": round(mean(r["tmax"] - r["tmin"] for r in rs), 2),
                "favourable_day_fraction": round(mean(r["favourable"] for r in rs), 3),
                "mean_longest_wet_spell_h": round(mean(r["wet_spell"] for r in rs), 1)}

    by_year = defaultdict(list)
    for r in rows:
        by_year[r["year"]].append(r)
    return {"overall": stats(rows), "by_year": {y: stats(rs) for y, rs in sorted(by_year.items())}, "missing_hour_values": missing}


def main():
    model = knowledge.conditions()["coffee_leaf_rust"]["weather_model"]
    result = {"site": {"name": "Chinchiná, Caldas, Colombia", "latitude": 4.99, "longitude": -75.60},
              "source_ids": ["open_meteo_archive_era5", "avelino_2015_food_security"],
              "purpose": "Qualitative consistency check of agent-authored weather heuristic; not validation against incidence.",
              "literature_reference": "Avelino et al. 2015: 2008-2011 vs 1991-1994 in Chinchiná, Tmin +0.1 °C, Tmax -0.5 °C (station data).",
              "periods": {}}
    for name, stem in PERIODS.items():
        hours, meta = load(stem)
        result["periods"][name] = {"data": {k: meta[k] for k in ("url", "accessed_at", "license", "grid_latitude", "grid_longitude", "elevation_m", "hours")},
                                   **summarize(hours, model)}
    # Sensitivity of the favourable-day fraction to the RH leaf-wetness proxy threshold (assumption).
    result["sensitivity_wet_rh_pct"] = {}
    for threshold in (90, 95, 98, 101):
        variant = json.loads(json.dumps(model))
        variant["wet_rh_pct"]["value"] = threshold
        result["sensitivity_wet_rh_pct"][str(threshold) if threshold <= 100 else "rain_only"] = {
            name: summarize(load(stem)[0], variant)["overall"]["favourable_day_fraction"] for name, stem in PERIODS.items()}
    low, epi = (result["periods"][k]["overall"] for k in PERIODS)
    result["comparison_epidemic_minus_low"] = {
        "tmin_c": round(epi["mean_tmin_c"] - low["mean_tmin_c"], 2),
        "tmax_c": round(epi["mean_tmax_c"] - low["mean_tmax_c"], 2),
        "diurnal_amplitude_c": round(epi["mean_diurnal_amplitude_c"] - low["mean_diurnal_amplitude_c"], 2),
        "favourable_day_fraction": round(epi["favourable_day_fraction"] - low["favourable_day_fraction"], 3),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n")
    print(json.dumps({k: result["periods"][k]["overall"] for k in PERIODS} | {"diff": result["comparison_epidemic_minus_low"]}, indent=1))
    print("sensitivity", result["sensitivity_wet_rh_pct"])
    for k in PERIODS:
        print(k, {y: v["favourable_day_fraction"] for y, v in result["periods"][k]["by_year"].items()})


if __name__ == "__main__":
    main()
