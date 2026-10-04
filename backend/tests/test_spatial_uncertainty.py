"""Location precision must match spatial precision (bug B): no 20 m claims from a 100 m position."""
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

from app.domain import analysis, spatial

ROOT = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 10, 4, 4, 59, tzinfo=timezone.utc)


def run(accuracy=None, basis="device_gps"):
    obs = json.loads((ROOT / "shared/fixtures/observation.json").read_text())
    if accuracy is not None:
        obs["location"] = {**obs["location"], "accuracy_m": accuracy, "basis": basis}
    return analysis.analyze(obs, now=NOW, allow_network=False)["map"]


class SpatialUncertainty(unittest.TestCase):
    def test_cells_never_finer_than_position_uncertainty(self):
        for accuracy in (3, 20, 37, 100, 180):
            m = run(accuracy)
            self.assertEqual(m["status"], "available")
            self.assertGreaterEqual(m["cell_size_m"], accuracy, f"accuracy {accuracy} m")
            self.assertGreaterEqual(m["cell_size_m"], 20)

    def test_100m_position_does_not_produce_20m_cells(self):
        m = run(100)
        self.assertEqual(m["cell_size_m"], 100)
        self.assertIn("100 m", m["limitations"])

    def test_unknown_accuracy_is_treated_as_field_level(self):
        m = run()
        self.assertEqual(m["location_basis"], "assumed_field_level")
        self.assertEqual(m["position_uncertainty_m"], 50)
        self.assertEqual(m["cell_size_m"], 50)

    def test_too_coarse_location_gives_no_grid(self):
        m = run(300, basis="manual_entry")
        self.assertEqual(m["status"], "unavailable")
        self.assertEqual(m["features"], [])
        self.assertIn("300 m", m["limitations"])

    def test_kernel_broadened_by_position_error(self):
        cell, decay = spatial.effective_geometry({"cell_size_m": 20, "decay_length_m": 40}, 30)
        self.assertEqual(cell, 30)
        self.assertAlmostEqual(decay, 50.0)

    def test_uncertainty_circle_and_horizon_layers(self):
        m = run(12)
        kinds = [f["properties"]["kind"] for f in m["features"]]
        self.assertEqual(kinds.count("position_uncertainty"), 1)
        cells = kinds.count("scouting_priority_cell")
        self.assertEqual([h["hours"] for h in m["horizons"]], [24, 72, 168])
        for h in m["horizons"]:
            self.assertEqual(len(h["priorities"]), cells)
            self.assertTrue(all(0 <= p <= 1 for p in h["priorities"]))

    def test_scouting_points_spaced_at_least_two_cells(self):
        obs = json.loads((ROOT / "shared/fixtures/observation.json").read_text())
        obs["location"] = {**obs["location"], "accuracy_m": 60}
        result = analysis.analyze(obs, now=NOW, allow_network=False)
        pts = [s for s in result["scouting"] if "rank" in s]
        for a in pts:
            for b in pts:
                if a is not b:
                    d = spatial.to_local(a["location"]["latitude"], a["location"]["longitude"], b["location"]["latitude"], b["location"]["longitude"])
                    self.assertGreaterEqual((d[0] ** 2 + d[1] ** 2) ** 0.5, 2 * result["map"]["cell_size_m"] - 1)


class FamilyRequired(unittest.TestCase):
    def test_no_transmission_family_no_map(self):
        obs = json.loads((ROOT / "shared/fixtures/observation.json").read_text())
        sm = {"cell_size_m": 20, "half_width_cells": 5, "decay_length_m": 40, "downwind_stretch": 1.0,
              "default_position_uncertainty_m": 50, "max_position_uncertainty_m": 250, "description": "x"}
        cond = {"id": "coffee_leaf_rust", "weather_model": {"forecast_days": 7}}
        m, points = analysis.build_map(obs, cond, sm, None, NOW, False, lambda k, **kw: k)
        self.assertEqual(m["status"], "unsupported")
        self.assertEqual(points, [])


if __name__ == "__main__":
    unittest.main()
