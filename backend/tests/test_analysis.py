import json
import math
import os
import re
import string
import tempfile
import unittest
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from app.contracts import read, validate
from app.domain import knowledge, risk, spatial, weather
from app.domain.analysis import analyze
from app.main import app

NOW = datetime(2026, 10, 4, 0, 0, tzinfo=timezone.utc)
CLR = knowledge.conditions()["coffee_leaf_rust"]


def observation(**changes):
    obs = read("fixtures/observation.json")
    for key, value in changes.items():
        if value is None:
            obs.pop(key, None)
        else:
            obs[key] = value
    return obs


def run(obs, now=NOW):
    result = analyze(obs, now=now, allow_network=False)
    validate("analysis", result)
    return result


class EvidenceAndAbstention(unittest.TestCase):
    def test_demo_needs_review_not_supported(self):
        result = run(observation())
        self.assertEqual(result["status"], "needs_review")
        self.assertEqual(result["condition"]["id"], "coffee_leaf_rust")
        self.assertIn("not a probability", result["condition"]["confidence_kind"])
        self.assertTrue(result["review"]["suggested"])

    def test_low_confidence_abstains(self):
        result = run(observation(signals=[{"label": "yellow_spots_upper_leaf", "confidence": 0.2}]))
        self.assertTrue(result["condition"]["abstained"])
        self.assertEqual(result["condition"]["id"], "undetermined")
        self.assertEqual(result["map"]["status"], "unavailable")
        self.assertEqual([r["id"] for r in result["recommendations"]], ["retake_photo", "seek_local_review"])

    def test_unrecognised_signals_only_abstain(self):
        result = run(observation(signals=[{"label": "mystery", "confidence": 1.0}]))
        self.assertTrue(result["condition"]["abstained"])
        self.assertFalse(result["evidence"][0]["recognized"])

    def test_empty_signals_abstain(self):
        self.assertTrue(run(observation(signals=[]))["condition"]["abstained"])

    def test_supported_requires_specific_signal(self):
        nonspecific = [{"label": s, "confidence": 1.0} for s in ("rust_like_leaf_marks", "yellow_spots_upper_leaf", "premature_leaf_drop", "brown_dry_lesion_centres")]
        result = run(observation(signals=nonspecific))
        self.assertGreaterEqual(result["condition"]["confidence"], 0.75)
        self.assertEqual(result["status"], "needs_review")
        result = run(observation(signals=[{"label": "orange_powder_leaf_underside", "confidence": 0.95}]))
        self.assertEqual(result["status"], "supported")
        self.assertTrue(result["review"]["suggested"], "officer review still proposed when supported")

    def test_score_monotonic_and_bounded(self):
        previous = -1
        for c in [0, 0.2, 0.4, 0.6, 0.8, 1.0]:
            score = run(observation(signals=[{"label": "rust_like_leaf_marks", "confidence": c}]))["condition"]["confidence"]
            self.assertGreaterEqual(score, previous)
            self.assertTrue(0 <= score <= 1)
            previous = score
        extra = run(observation(signals=[{"label": "rust_like_leaf_marks", "confidence": 0.6}, {"label": "premature_leaf_drop", "confidence": 0.6}]))
        alone = run(observation(signals=[{"label": "rust_like_leaf_marks", "confidence": 0.6}]))
        self.assertGreater(extra["condition"]["confidence"], alone["condition"]["confidence"])

    def test_unsupported_crop(self):
        result = run(observation(crop="maize"))
        self.assertEqual(result["status"], "unsupported")
        self.assertEqual(result["map"]["status"], "unsupported")
        self.assertEqual(result["recommendations"], [])

    def test_review_never_auto_contacts(self):
        for obs in (observation(), observation(crop="maize"), observation(signals=[])):
            review = run(obs)["review"]
            self.assertTrue(review["requires_user_authorization"])
            self.assertFalse(review["auto_contact"])


class EnvironmentAndCache(unittest.TestCase):
    def test_cached_fresh_then_stale(self):
        fresh = run(observation())
        self.assertEqual(fresh["environment"]["status"], "fresh")
        self.assertEqual(fresh["environment"]["origin"], "cached")
        self.assertTrue(fresh["offline"]["cached"])
        stale = run(observation(), now=NOW + timedelta(days=2))
        self.assertEqual(stale["environment"]["status"], "stale")
        self.assertTrue(stale["offline"]["stale"])
        self.assertGreater(stale["environment"]["age_hours"], 6)

    def test_missing_location(self):
        result = run(observation(location=None))
        self.assertEqual(result["environment"]["status"], "unavailable")
        self.assertIsNone(result["environment"]["temperature_c"])
        self.assertEqual(result["weather_risk"]["status"], "unavailable")
        self.assertIsNone(result["weather_risk"]["class"])
        self.assertEqual(result["map"]["status"], "unavailable")
        self.assertEqual(result["condition"]["id"], "coffee_leaf_rust", "diagnosis guidance still offered")

    def test_location_without_cache_is_unavailable_not_zero(self):
        result = run(observation(location={"latitude": 10.0, "longitude": -84.0}))
        self.assertEqual(result["environment"]["status"], "unavailable")
        self.assertIn("no_cached_weather_within_15km", result["environment"]["notes"])
        self.assertIsNone(result["weather_risk"]["favourable_day_fraction"])
        self.assertEqual(result["map"]["status"], "available", "map does not need weather")
        self.assertFalse(result["map"]["wind"]["used"])

    def test_live_failure_falls_back_to_cache(self):
        with mock.patch.object(weather.urllib.request, "urlopen", side_effect=OSError("offline")):
            series, notes = weather.get_weather(-1.95, 30.06, NOW, allow_network=True)
        self.assertEqual(series.origin, "cached")
        self.assertIn("live_weather_failed:OSError", notes)

    def test_corrupt_cache_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "open-meteo_bad.json").write_text("{not json")
            with mock.patch.object(weather, "CACHE_DIR", Path(tmp)):
                series, notes = weather.get_weather(-1.95, 30.06, NOW, allow_network=False)
        self.assertIsNone(series)

    def test_live_fetch_writes_cache_atomically(self):
        body = json.dumps({"latitude": 1, "longitude": 2, "hourly": {
            "time": ["2026-10-04T00:00"], "temperature_2m": [20], "relative_humidity_2m": [95],
            "precipitation": [0], "wind_speed_10m": [3], "wind_direction_10m": [90]}}).encode()
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = body
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(weather, "CACHE_DIR", Path(tmp)), \
                mock.patch.object(weather.urllib.request, "urlopen", return_value=response):
            series, _ = weather.get_weather(1.0, 2.0, NOW, allow_network=True)
            self.assertEqual(series.origin, "live")
            cached, _ = weather.get_weather(1.0, 2.0, NOW, allow_network=False)
            self.assertEqual(cached.origin, "cached")
            self.assertEqual(list(Path(tmp).glob("*.tmp")), [])

    def test_partial_weather_coverage(self):
        series, _ = weather.get_weather(-1.95, 30.06, NOW, allow_network=False)
        series.hours = series.hours[: 24 * 10]
        assessment = risk.assess(series, weather.parse_time("2026-10-03T08:00:00Z"), CLR["weather_model"])
        self.assertEqual(assessment["status"], "partial")
        self.assertLess(assessment["assessed_days"], assessment["expected_days"])


class WeatherModel(unittest.TestCase):
    params = CLR["weather_model"]["temperature_c"]

    def test_temperature_factor_shape(self):
        p = self.params
        self.assertEqual(risk.temperature_factor(p["zero_below"], p), 0)
        self.assertEqual(risk.temperature_factor(p["zero_above"], p), 0)
        self.assertEqual(risk.temperature_factor(22, p), 1)
        self.assertEqual(risk.temperature_factor(None, p), 0)
        values = [risk.temperature_factor(t / 10, p) for t in range(0, 400)]
        self.assertTrue(all(0 <= v <= 1 for v in values))
        rising = values[: int(p["optimum_low"] * 10)]
        self.assertEqual(rising, sorted(rising))

    def hours(self, temps, rh):
        start = NOW
        return [weather.Hour(start + timedelta(hours=i), t, r, 0.0, 5.0, 90.0) for i, (t, r) in enumerate(zip(temps, rh))]

    def test_wet_spell_threshold(self):
        model = CLR["weather_model"]
        five = self.hours([22] * 24, [95] * 5 + [60] * 19)
        six = self.hours([22] * 24, [95] * 6 + [60] * 18)
        self.assertFalse(risk.assess_day(five, model)["favourable"])
        self.assertTrue(risk.assess_day(six, model)["favourable"])

    def test_cold_wet_day_not_favourable(self):
        cold = self.hours([10] * 24, [99] * 24)
        self.assertFalse(risk.assess_day(cold, CLR["weather_model"])["favourable"])

    def test_more_wetness_never_lowers_class(self):
        order = {"low": 0, "moderate": 1, "high": 2}
        series, _ = weather.get_weather(-1.95, 30.06, NOW, allow_network=False)
        reference = weather.parse_time("2026-10-03T08:00:00Z")
        base = risk.assess(series, reference, CLR["weather_model"])
        wetter = deepcopy(series)
        for h in wetter.hours:
            h.relative_humidity_pct = min(100, (h.relative_humidity_pct or 0) + 20)
        self.assertGreaterEqual(order[risk.assess(wetter, reference, CLR["weather_model"])["class"]], order[base["class"]])
        self.assertGreaterEqual(risk.assess(wetter, reference, CLR["weather_model"])["favourable_day_fraction"], base["favourable_day_fraction"])


class Spatial(unittest.TestCase):
    model = CLR["spatial_model"]

    def test_projection_round_trip(self):
        lat, lon = spatial.to_geo(-1.95, 30.06, 123.0, -45.0)
        east, north = spatial.to_local(-1.95, 30.06, lat, lon)
        self.assertAlmostEqual(east, 123.0, places=3)
        self.assertAlmostEqual(north, -45.0, places=3)

    def test_isotropic_priority_decreases_with_distance(self):
        cells = spatial.priority_grid((-1.95, 30.06), [{"latitude": -1.95, "longitude": 30.06}], [], self.model, None)
        by_distance = sorted(cells, key=lambda c: math.hypot(c["east_m"], c["north_m"]))
        self.assertEqual(by_distance[0]["priority"], 1.0)
        for a, b in zip(by_distance, by_distance[1:]):
            if math.hypot(b["east_m"], b["north_m"]) > math.hypot(a["east_m"], a["north_m"]):
                self.assertGreaterEqual(a["priority"], b["priority"])
        self.assertTrue(all(0 <= c["priority"] <= 1 for c in cells))

    def test_downwind_cells_rank_higher(self):
        # Wind from the north blows toward the south.
        cells = spatial.priority_grid((-1.95, 30.06), [{"latitude": -1.95, "longitude": 30.06}], [], self.model, 0.0)
        at = {(c["row"], c["col"]): c["priority"] for c in cells}
        self.assertGreater(at[(-2, 0)], at[(2, 0)])
        self.assertAlmostEqual(at[(0, 2)], at[(0, -2)])

    def test_cleared_prior_lowers_priority(self):
        src = [{"latitude": -1.95, "longitude": 30.06}]
        lat, lon = spatial.to_geo(-1.95, 30.06, 40, 0)
        base = spatial.priority_grid((-1.95, 30.06), src, [], self.model, None)
        cleared = spatial.priority_grid((-1.95, 30.06), src, [{"latitude": lat, "longitude": lon}], self.model, None)
        cell = lambda cells: next(c for c in cells if c["row"] == 0 and c["col"] == 2)["priority"]
        self.assertLess(cell(cleared), cell(base))

    def test_points_respect_separation(self):
        cells = spatial.priority_grid((-1.95, 30.06), [{"latitude": -1.95, "longitude": 30.06}], [], self.model, 45.0)
        points = spatial.pick_points(cells)
        for i, a in enumerate(points):
            for b in points[i + 1:]:
                self.assertGreaterEqual(math.hypot(a["east_m"] - b["east_m"], a["north_m"] - b["north_m"]), 40)

    def test_geojson_order_and_map_metadata(self):
        result = run(observation())
        m = result["map"]
        self.assertFalse(m["calibrated"])
        self.assertIn("not an infection probability", m["limitations"])
        point = next(f for f in m["features"] if f["properties"]["kind"] == "reported_observation")
        self.assertEqual(point["geometry"]["coordinates"], [30.06, -1.95])
        ranks = [s["rank"] for s in result["scouting"] if "rank" in s]
        self.assertEqual(ranks, list(range(1, len(ranks) + 1)))

    def test_prior_history_shifts_points(self):
        prior = [{"id": "p", "condition_id": "coffee_leaf_rust", "present": True, "latitude": -1.9497, "longitude": 30.0604}]
        result = run(observation(prior_observations=prior))
        self.assertEqual(result["map"]["prior_observations_used"], 1)
        far = [{"id": "far", "condition_id": "coffee_leaf_rust", "present": True, "latitude": -1.90, "longitude": 30.06}]
        self.assertEqual(run(observation(prior_observations=far))["map"]["prior_observations_used"], 0)


class Localization(unittest.TestCase):
    def placeholders(self, text):
        return {f for _, f, _, _ in string.Formatter().parse(text) if f}

    def test_catalog_parity_and_placeholders(self):
        catalogs = knowledge.catalogs()
        en = catalogs["en"]
        for locale, catalog in catalogs.items():
            self.assertEqual(set(catalog), set(en), locale)
            for key, text in catalog.items():
                if key != "_meta":
                    self.assertEqual(self.placeholders(text), self.placeholders(en[key]), f"{locale}:{key}")

    def test_ids_stable_across_locales(self):
        outputs = {loc: run(observation(locale=loc)) for loc in ("en", "es", "fr")}
        ids = lambda r: ([s["id"] for s in r["scouting"]], [x["id"] for x in r["recommendations"]], r["condition"]["id"], r["status"])
        self.assertEqual(ids(outputs["en"]), ids(outputs["es"]))
        self.assertEqual(ids(outputs["en"]), ids(outputs["fr"]))
        self.assertNotEqual(outputs["en"]["condition"]["label"], outputs["es"]["condition"]["label"])
        self.assertEqual(outputs["en"]["map"]["features"], outputs["es"]["map"]["features"])

    def test_meaning_preserved_numbers(self):
        """Distances, ranks and the 4-6 week latent period must survive translation."""
        for loc in ("es", "fr"):
            result = run(observation(locale=loc))
            en = run(observation(locale="en"))
            for a, b in zip(en["scouting"], result["scouting"]):
                self.assertEqual(re.findall(r"\d+", a["text"]), re.findall(r"\d+", b["text"]))
            rescout = lambda r: next(x["text"] for x in r["recommendations"] if x["id"] == "rescout_after_latent_period")
            self.assertEqual(re.findall(r"\d", rescout(en)), re.findall(r"\d", rescout(result)))

    def test_region_tag_and_unsupported_locale(self):
        self.assertEqual(run(observation(locale="es-CO"))["localization"]["used"], "es")
        rw = run(observation(locale="rw"))
        self.assertEqual(rw["localization"]["used"], "en")
        self.assertTrue(rw["localization"]["fallback"])
        self.assertFalse(run(observation(locale="fr"))["localization"]["reviewed_by_native_speaker"])


class SourcesAndProvenance(unittest.TestCase):
    def test_every_cited_source_exists_and_is_complete(self):
        registry = knowledge.sources()
        for s in registry.values():
            for field in ("title", "url", "accessed_at", "license", "kind"):
                self.assertTrue(s.get(field), f"{s['id']}.{field}")
        result = run(observation())
        cited = {s["id"] for s in result["sources"]}
        for item in result["scouting"] + result["recommendations"]:
            self.assertTrue(set(item.get("source_ids", [])) <= cited, item["id"])
        for ids in ([r["source_ids"] for r in CLR["recommendations"]] + [s["source_ids"] for s in CLR["signals"].values()]):
            self.assertTrue(set(ids) <= set(registry))

    def test_guidance_has_sources_except_layout(self):
        result = run(observation())
        for rec in result["recommendations"]:
            self.assertTrue(rec["source_ids"], rec["id"])

    def test_no_dosage_or_product_advice(self):
        texts = " ".join(x["text"] for x in run(observation(signals=[{"label": "orange_powder_leaf_underside", "confidence": 1}]))["recommendations"])
        self.assertIsNone(re.search(r"\b(ml|g/l|kg/ha|l/ha|dose|copper|kocide)\b", texts, re.I))

    def test_provenance_flags_uncalibrated_components(self):
        components = {c["component"]: c for c in run(observation())["provenance"]["components"]}
        self.assertFalse(components["weather_risk"]["calibrated"])
        self.assertFalse(components["scouting_map"]["calibrated"])
        self.assertEqual(components["observation"]["origin"], "demo")


class Reproducibility(unittest.TestCase):
    def test_same_input_same_output(self):
        self.assertEqual(run(observation()), run(observation()))

    def test_fixtures_up_to_date(self):
        import subprocess, sys
        script = Path(__file__).resolve().parents[1] / "scripts" / "generate_fixtures.py"
        done = subprocess.run([sys.executable, str(script), "--check"], capture_output=True, text=True)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)


class Http(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.dict(os.environ, {"AGRI_FIXED_NOW": "2026-10-04T00:00:00Z"})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(app)

    def test_offline_end_to_end_matches_fixture(self):
        response = self.client.post("/v1/analyses", json=read("fixtures/observation.json"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), read("fixtures/analysis.json"))

    def test_invalid_observation_envelope(self):
        bad = observation()
        bad["signals"][0]["confidence"] = 2
        detail = self.client.post("/v1/analyses", json=bad).json()["detail"]
        self.assertEqual(detail["code"], "invalid_observation")
        self.assertFalse(detail["retryable"])

    def test_bad_prior_observation_rejected(self):
        bad = observation(prior_observations=[{"condition_id": "coffee_leaf_rust", "present": True, "latitude": 200, "longitude": 0}])
        self.assertEqual(self.client.post("/v1/analyses", json=bad).status_code, 422)

    def test_catalog_endpoints(self):
        conditions = self.client.get("/v1/conditions").json()
        self.assertEqual(conditions["supported_crops"], ["coffee"])
        self.assertEqual(conditions["locales"], ["en", "es", "fr"])
        self.assertTrue(self.client.get("/v1/sources").json()["sources"])
