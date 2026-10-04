"""Weather-cache robustness: structurally incomplete but valid JSON must never crash the analysis."""
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from app.domain import analysis, weather

ROOT = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 10, 4, 4, 59, tzinfo=timezone.utc)
LAT, LON = -1.95, 30.06


def observation():
    return json.loads((ROOT / "shared/fixtures/observation.json").read_text())


def payload(**over):
    base = {
        "provider": "open-meteo", "license": "CC BY 4.0", "fetched_at": "2026-10-04T04:45:00Z",
        "request": {"latitude": LAT, "longitude": LON},
        "hourly": {"time": ["2026-10-03T00:00", "2026-10-03T01:00", "2026-10-03T02:00"],
                   "temperature_2m": [20.0, 21.0, 22.0], "relative_humidity_2m": [90, 95, 99],
                   "precipitation": [0.0, 0.2, 0.0], "wind_speed_10m": [5, 6, 7], "wind_direction_10m": [90, 100, 110]},
    }
    base.update(over)
    return base


class WeatherCacheRobustness(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patch = mock.patch.object(weather, "CACHE_DIR", Path(self.tmp.name))
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def write(self, name, content):
        (Path(self.tmp.name) / f"open-meteo_{name}.json").write_text(content if isinstance(content, str) else json.dumps(content))

    def test_missing_hourly_section_is_skipped(self):
        p = payload(); del p["hourly"]
        self.write("a", p)
        self.assertIsNone(weather.load_cached(LAT, LON))

    def test_partial_columns_become_none(self):
        p = payload(); del p["hourly"]["relative_humidity_2m"]; p["hourly"]["precipitation"] = [0.1]
        self.write("a", p)
        series = weather.load_cached(LAT, LON)
        self.assertEqual(len(series.hours), 3)
        self.assertIsNone(series.hours[0].relative_humidity_pct)
        self.assertEqual(series.hours[0].precipitation_mm, 0.1)
        self.assertIsNone(series.hours[2].precipitation_mm)

    def test_malformed_but_readable_structures(self):
        for i, bad in enumerate([[], {"hourly": "x"}, payload(request={}), payload(fetched_at=None),
                                 payload(hourly={"time": ["not-a-time"]}), "{not json"]):
            self.write(f"bad{i}", bad)
        self.assertIsNone(weather.load_cached(LAT, LON))
        self.write("good", payload())
        self.assertIsNotNone(weather.load_cached(LAT, LON), "a good file is still found among corrupt ones")

    def test_non_numeric_values_ignored(self):
        p = payload(); p["hourly"]["temperature_2m"] = ["warm", None, 22.0]
        self.write("a", p)
        temps = [h.temperature_c for h in weather.load_cached(LAT, LON).hours]
        self.assertEqual(temps, [None, None, 22.0])

    def test_stale_data_reported_not_dropped(self):
        self.write("a", payload(fetched_at="2026-09-20T00:00:00Z"))
        series = weather.load_cached(LAT, LON)
        self.assertEqual(series.freshness(NOW), "stale")

    def test_full_analysis_survives_corrupt_and_partial_cache(self):
        p = payload(); del p["hourly"]["wind_direction_10m"]
        self.write("partial", p)
        self.write("broken", {"request": {"latitude": LAT}})
        result = analysis.analyze(observation(), now=NOW, allow_network=False)
        self.assertIn(result["environment"]["status"], ("fresh", "stale", "unavailable"))
        self.assertEqual(result["observation_id"], observation()["id"])

    def test_full_analysis_without_any_cache(self):
        result = analysis.analyze(observation(), now=NOW, allow_network=False)
        self.assertEqual(result["environment"]["status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
