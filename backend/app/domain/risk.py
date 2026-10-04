"""Weather-based infection-favourability heuristic. Output is a class plus counts, never a probability."""
from datetime import datetime, timedelta

from .weather import Hour, WeatherSeries, day_floor


def temperature_factor(t: float | None, p: dict) -> float:
    """Trapezoid: 0 outside [zero_below, zero_above], 1 on [optimum_low, optimum_high], linear between."""
    if t is None or t <= p["zero_below"] or t >= p["zero_above"]:
        return 0.0
    if t < p["optimum_low"]:
        return (t - p["zero_below"]) / (p["optimum_low"] - p["zero_below"])
    if t <= p["optimum_high"]:
        return 1.0
    return (p["zero_above"] - t) / (p["zero_above"] - p["optimum_high"])


def is_wet(h: Hour, model: dict) -> bool | None:
    if h.relative_humidity_pct is None and h.precipitation_mm is None:
        return None
    return (h.relative_humidity_pct or 0) >= model["wet_rh_pct"]["value"] or (h.precipitation_mm or 0) >= model["wet_precip_mm"]["value"]


def longest_favourable_spell(hours: list[Hour], model: dict) -> tuple[int, float]:
    """Longest run of consecutive wet hours and its mean temperature factor."""
    best, best_factor, run = 0, 0.0, []
    for h in hours + [None]:
        if h is not None and is_wet(h, model):
            run.append(temperature_factor(h.temperature_c, model["temperature_c"]))
            continue
        if run and (len(run) > best or (len(run) == best and sum(run) / len(run) > best_factor)):
            best, best_factor = len(run), sum(run) / len(run)
        run = []
    return best, best_factor


def assess_day(hours: list[Hour], model: dict) -> dict:
    spell, factor = longest_favourable_spell(hours, model)
    complete = len(hours) >= 20 and all(is_wet(h, model) is not None for h in hours)
    favourable = spell >= model["min_wet_hours"]["value"] and factor >= model["min_temp_factor"]["value"]
    return {"hours": len(hours), "complete": complete, "longest_wet_spell_h": spell,
            "spell_temperature_factor": round(factor, 2), "favourable": favourable}


def classify(fraction: float, classes: dict) -> str:
    if fraction >= classes["high_at_or_above"]:
        return "high"
    return "low" if fraction < classes["low_below"] else "moderate"


def assess(series: WeatherSeries | None, reference: datetime, model: dict) -> dict:
    """Assess days in [reference - history_days, reference + forecast_days)."""
    if series is None:
        return {"status": "unavailable", "class": None, "favourable_day_fraction": None, "days": []}
    start = day_floor(reference) - timedelta(days=model["history_days"])
    days = []
    for offset in range(model["history_days"] + model["forecast_days"]):
        day = start + timedelta(days=offset)
        hours = series.window(day, day + timedelta(days=1))
        if not hours:
            continue
        result = assess_day(hours, model)
        result["date"] = day.date().isoformat()
        result["period"] = "history" if day < day_floor(reference) else "reference_and_after"
        result["data_kind"] = "includes_forecast" if day + timedelta(days=1) > series.fetched_at else "model_past"
        days.append(result)
    complete = [d for d in days if d["complete"]]
    if not complete:
        return {"status": "unavailable", "class": None, "favourable_day_fraction": None, "days": days}
    fraction = sum(d["favourable"] for d in complete) / len(complete)
    expected = model["history_days"] + model["forecast_days"]
    return {
        "status": "available" if len(complete) == expected else "partial",
        "class": classify(fraction, model["classes"]),
        "favourable_day_fraction": round(fraction, 3),
        "favourable_days": sum(d["favourable"] for d in complete),
        "assessed_days": len(complete),
        "expected_days": expected,
        "days": days,
    }


def summarize_period(series: WeatherSeries | None, end: datetime, hours: int = 24) -> dict:
    """Mean temperature/RH and rainfall total over the `hours` before `end`."""
    if series is None:
        return {"temperature_c": None, "relative_humidity_pct": None, "rainfall_mm": None, "covered_hours": 0}
    window = series.window(end - timedelta(hours=hours), end)

    def values(name):
        return [getattr(h, name) for h in window if getattr(h, name) is not None]

    temps, rh, rain = values("temperature_c"), values("relative_humidity_pct"), values("precipitation_mm")
    covered = len(window) >= hours * 0.8
    return {
        "temperature_c": round(sum(temps) / len(temps), 1) if covered and temps else None,
        "relative_humidity_pct": round(sum(rh) / len(rh), 1) if covered and rh else None,
        "rainfall_mm": round(sum(rain), 1) if covered and rain else None,
        "covered_hours": len(window),
    }
