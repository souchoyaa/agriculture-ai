"""Regenerate shared analysis fixtures deterministically from the offline cache (no network).

uv run python scripts/generate_fixtures.py [--check]
"""
import json
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.contracts import SHARED, read, validate  # noqa: E402
from app.domain.analysis import analyze  # noqa: E402

DEMO_NOW = datetime(2026, 10, 4, 0, 0, tzinfo=timezone.utc)


def scenarios():
    base = read("fixtures/observation.json")

    def variant(suffix, **changes):
        obs = deepcopy(base)
        obs["id"] = f"{base['id']}-{suffix}"
        for key, value in changes.items():
            if value is None:
                obs.pop(key, None)
            else:
                obs[key] = value
        return obs

    yield "demo", base, DEMO_NOW
    yield "supported_with_history", variant(
        "history", signals=[{"label": "orange_powder_leaf_underside", "confidence": 0.9}, {"label": "yellow_spots_upper_leaf", "confidence": 0.8}],
        prior_observations=[
            {"id": "prior-1", "observed_at": "2026-09-20T09:00:00Z", "condition_id": "coffee_leaf_rust", "present": True, "latitude": -1.9497, "longitude": 30.0604},
            {"id": "prior-2", "observed_at": "2026-09-27T09:00:00Z", "condition_id": "coffee_leaf_rust", "present": False, "latitude": -1.9503, "longitude": 30.0597},
        ]), DEMO_NOW
    yield "low_confidence", variant("weak", signals=[{"label": "yellow_spots_upper_leaf", "confidence": 0.3}, {"label": "unknown_texture", "confidence": 0.9}]), DEMO_NOW
    yield "no_location", variant("nolocation", location=None), DEMO_NOW
    yield "unsupported_crop", variant("maize", crop="maize"), DEMO_NOW
    yield "spanish", variant("es", locale="es-CO"), DEMO_NOW
    yield "stale_weather", base, datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)
    yield "differential_severity", variant("differential", signals=[
        {"label": "orange_powder_leaf_underside", "confidence": 0.9, "affected_leaf_area_pct": 12},
        {"label": "cercospora_leaf_spot_marks", "confidence": 0.6}]), DEMO_NOW
    yield "unsupported_locale", variant("rw", locale="rw"), DEMO_NOW


def main(check: bool) -> int:
    outputs = {}
    for name, observation, now in scenarios():
        validate("observation", observation)
        analysis = analyze(observation, now=now, allow_network=False)
        validate("analysis", analysis)
        outputs[f"examples/{name}.observation.json"] = observation
        outputs[f"examples/{name}.analysis.json"] = analysis
    outputs["analysis.json"] = outputs.pop("examples/demo.analysis.json")
    outputs.pop("examples/demo.observation.json")
    stale = []
    for rel, payload in outputs.items():
        path = SHARED / "fixtures" / rel
        text = json.dumps(payload, indent=1, ensure_ascii=False) + "\n"
        if check:
            if not path.exists() or path.read_text() != text:
                stale.append(rel)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
    if stale:
        print("stale fixtures:", ", ".join(stale))
        return 1
    print(("checked " if check else "wrote ") + f"{len(outputs)} fixtures")
    return 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
