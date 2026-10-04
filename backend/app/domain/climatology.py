"""Local ERA5 baseline for the weather-favourability class, so persistently humid sites are read relative to their usual."""
import hashlib
import json
from datetime import date, timedelta
from pathlib import Path

from .weather import distance_km

CLIM_DIR = Path(__file__).resolve().parents[2] / "data" / "climatology"
MAX_DISTANCE_KM = 15.0
FINGERPRINT_KEYS = ("temperature_c", "min_wet_hours", "wet_rh_pct", "wet_precip_mm", "min_temp_factor")


def fingerprint(model: dict) -> str:
    """Daily flags depend on these parameters; a mismatch means the baseline must be rebuilt."""
    used = {k: model[k] for k in FINGERPRINT_KEYS}
    return hashlib.sha256(json.dumps(used, sort_keys=True).encode()).hexdigest()[:12]


def load(lat: float, lon: float) -> dict | None:
    best = None
    for path in sorted(CLIM_DIR.glob("era5_*.json")):
        try:
            payload = json.loads(path.read_text())
            d = distance_km(lat, lon, payload["latitude"], payload["longitude"])
        except (OSError, ValueError, KeyError):
            continue
        if d <= MAX_DISTANCE_KM and (best is None or d < best[0]):
            best = (d, payload)
    return best[1] if best else None


def quantile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    position = q * (len(ordered) - 1)
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def compare(baseline: dict | None, model: dict, window_dates: list[date], current_fraction: float | None) -> dict:
    if baseline is None:
        return {"status": "unavailable", "reason": "no_local_baseline_within_15km"}
    if baseline["model_fingerprint"] != fingerprint(model):
        return {"status": "unavailable", "reason": "baseline_built_with_different_parameters"}
    if current_fraction is None or not window_dates:
        return {"status": "unavailable", "reason": "current_window_unavailable"}
    per_year = {}
    for year, flags in baseline["daily_favourable"].items():
        start = date(int(year), 1, 1)
        values = []
        for d in window_dates:
            try:
                same_day = d.replace(year=int(year))
            except ValueError:  # 29 February in a non-leap year
                continue
            index = (same_day - start).days
            if 0 <= index < len(flags):
                values.append(flags[index] == "1")
        if values:
            per_year[year] = round(sum(values) / len(values), 3)
    if len(per_year) < 5:
        return {"status": "unavailable", "reason": "too_few_baseline_years"}
    values = list(per_year.values())
    p25, p75 = quantile(values, 0.25), quantile(values, 0.75)
    relation = "above_usual" if current_fraction > p75 else ("below_usual" if current_fraction < p25 else "typical")
    overlap = baseline["overlap_check"]
    inflated = overlap["operational_favourable_days"] > overlap["era5_favourable_days"]
    return {
        "status": "available",
        "possible_source_bias": ("operational_more_favourable" if inflated else
                                 "operational_less_favourable" if overlap["operational_favourable_days"] < overlap["era5_favourable_days"] else "none_detected"),
        "relation": relation,
        "current_fraction": current_fraction,
        "baseline_median": round(quantile(values, 0.5), 3),
        "baseline_p25": round(p25, 3), "baseline_p75": round(p75, 3),
        "baseline_min": min(values), "baseline_max": max(values),
        "years_at_or_below_current": sum(v <= current_fraction for v in values),
        "baseline_years": len(values),
        "per_year": per_year,
        "baseline_source": baseline["source"],
        "cross_source_check": baseline["overlap_check"],
        "caveat": "Baseline is ERA5 reanalysis; the current window is operational model/forecast data. Their wetness differs (see cross_source_check); treat the relation as indicative only.",
    }


def window_dates(start: date, days: int) -> list[date]:
    return [start + timedelta(days=i) for i in range(days)]
