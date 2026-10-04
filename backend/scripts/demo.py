"""Offline end-to-end demo: every example observation through the real HTTP app, summary + map outputs.

  uv run python scripts/demo.py                         # in-process HTTP (no server, no network)
  uv run python scripts/demo.py --base-url http://127.0.0.1:8000   # against a running server
Writes docs/backend/examples/<scenario>.geojson and .svg (scouting priority map).
"""
import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("AGRI_FIXED_NOW", "2026-10-04T00:00:00Z")
from app.contracts import SHARED, validate  # noqa: E402

OUT = ROOT.parent / "docs" / "backend" / "examples"


def post(base_url, observation):
    if base_url:
        request = urllib.request.Request(f"{base_url}/v1/analyses", data=json.dumps(observation).encode(),
                                         headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())
    from fastapi.testclient import TestClient
    from app.main import app
    response = TestClient(app).post("/v1/analyses", json=observation)
    response.raise_for_status()
    return response.json()


def svg(analysis, size=440) -> str:
    """Minimal dependency-free rendering of priority cells (orange intensity) and ranked points."""
    feats = analysis["map"]["features"]
    coords = [c for f in feats if f["geometry"]["type"] == "Polygon" for c in f["geometry"]["coordinates"][0]]
    xs, ys = [c[0] for c in coords], [c[1] for c in coords]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    sx = lambda x: 20 + (x - x0) / (x1 - x0) * (size - 40)
    sy = lambda y: 20 + (y1 - y) / (y1 - y0) * (size - 40)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size + 60}" font-family="sans-serif" font-size="11">',
             f'<rect width="100%" height="100%" fill="white"/>']
    for f in feats:
        g, p = f["geometry"], f["properties"]
        if g["type"] == "Polygon":
            pts = " ".join(f"{sx(x):.1f},{sy(y):.1f}" for x, y in g["coordinates"][0])
            parts.append(f'<polygon points="{pts}" fill="rgb(230,110,20)" fill-opacity="{p["priority"]:.3f}" stroke="#ddd" stroke-width="0.5"/>')
    for f in feats:
        g, p = f["geometry"], f["properties"]
        if g["type"] != "Point":
            continue
        x, y = sx(g["coordinates"][0]), sy(g["coordinates"][1])
        if p["kind"] == "scouting_point":
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="9" fill="white" stroke="#222"/><text x="{x:.1f}" y="{y + 4:.1f}" text-anchor="middle">{p["rank"]}</text>')
        else:
            colour = "#b00" if p["present"] else "#080"
            parts.append(f'<rect x="{x - 4:.1f}" y="{y - 4:.1f}" width="8" height="8" fill="{colour}"/>')
    wind = analysis["map"]["wind"]
    caption = (f'Relative scouting priority (not infection probability). Cell {analysis["map"]["cell_size_m"]} m. '
               f'Wind from {wind["mean_from_deg"]}° used={wind["used"]}. Red square: reported rust; green: reported clear.')
    parts.append(f'<text x="20" y="{size + 10}">N ↑  {caption[:80]}</text><text x="20" y="{size + 26}">{caption[80:]}</text>')
    parts.append(f'<text x="20" y="{size + 44}">Weather class: {analysis["weather_risk"]["class"]} (uncalibrated); status {analysis["status"]}</text></svg>')
    return "\n".join(parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url")
    args = parser.parse_args()
    scenarios = {"demo": SHARED / "fixtures" / "observation.json"}
    scenarios |= {p.name.removesuffix(".observation.json"): p for p in sorted((SHARED / "fixtures" / "examples").glob("*.observation.json"))}
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"{'scenario':24} {'status':13} {'condition':18} {'score':>5} {'env':11} {'weather':9} {'map':11} {'locale':7} review")
    for name, path in scenarios.items():
        # stale_weather is defined by analysis time, not by the observation: run 3.5 days after the cache fetch.
        os.environ["AGRI_FIXED_NOW"] = "2026-10-07T12:00:00Z" if name == "stale_weather" else "2026-10-04T00:00:00Z"
        if name == "stale_weather" and args.base_url:
            continue  # a remote server's clock cannot be changed from here
        result = post(args.base_url, json.loads(path.read_text()))
        validate("analysis", result)
        loc = result["localization"]
        print(f"{name:24} {result['status']:13} {result['condition']['id']:18} {result['condition']['confidence']:5.2f} "
              f"{result['environment']['status']:11} {str(result['weather_risk'].get('class')):9} {result['map']['status']:11} "
              f"{loc['used'] + ('*' if loc['fallback'] else ''):7} {result['review']['suggested']}")
        if result["map"]["status"] == "available" and name in ("demo", "supported_with_history"):
            (OUT / f"{name}.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": result["map"]["features"]}) + "\n")
            (OUT / f"{name}.svg").write_text(svg(result) + "\n")
    print(f"\n* locale fallback. Maps written to {OUT.relative_to(ROOT.parent)}/")


if __name__ == "__main__":
    main()
