"""VLM boundary. The real Liquid model's raw output format is unknown; parse it here, nowhere else."""
import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path

from ..contracts import validate

LABEL_MAP = Path(__file__).resolve().parents[2] / "data" / "vlm_label_map.json"


@lru_cache
def label_map() -> dict:
    return json.loads(LABEL_MAP.read_text())


class MockVLMAdapter:
    """Accept canonical observations only; does not assert anything about Liquid's eventual raw format."""
    name = "mock-vlm"

    def observe(self, payload):
        validate("observation", payload)
        return deepcopy(payload)


class LabelListVLMAdapter:
    """Bridge for a classifier-style output: {"model", "model_version"?, "labels": [{"label", "score"}]}.

    This input format is an ASSUMPTION (Liquid's real output is unknown); it covers models that emit
    dataset-style class names (RoCoLe/BRACOL vocabulary). Labels are mapped with data/vlm_label_map.json
    (status proposed_unverified); unknown labels pass through unrecognised and cannot raise the evidence
    score. Capture context (id, time, crop, location, locale) comes from the app and is never invented here.
    """
    name = "label-list-vlm"

    @staticmethod
    def _normalize(label: str) -> str:
        return "_".join(label.strip().lower().replace("-", " ").split())

    def observe(self, raw: dict, context: dict) -> dict:
        mapping = label_map()["labels"]
        signals = []
        for item in raw.get("labels", []):
            key = self._normalize(str(item["label"]))
            entry = mapping.get(key)
            signal = {"label": entry["signal"] if entry else key, "confidence": item["score"],
                      "origin": "image_model", "raw_label": item["label"], "mapped": entry is not None}
            if entry and "affected_leaf_area_pct" in entry:
                signal["affected_leaf_area_range_pct"] = entry["affected_leaf_area_pct"]  # class range, not a measurement
            signals.append(signal)
        observation = {
            "contract_version": "0.1.0",
            "id": context["id"],
            "data_mode": context.get("data_mode", "live"),
            "observed_at": context["observed_at"],
            "crop": context["crop"],
            "signals": signals,
            "provenance": {
                "adapter": self.name,
                "source": f"{raw.get('model', 'unknown model')} {raw.get('model_version', '')}".strip()
                          + "; assumed label-list output format; label map proposed_unverified",
            },
        }
        for optional in ("location", "locale"):
            if context.get(optional) is not None:
                observation[optional] = context[optional]
        validate("observation", observation)
        return observation


class LiquidVLMAdapter:
    """Placeholder: implement `observe(raw) -> canonical observation` once the Liquid output format is known.

    Map model labels onto the condition signal vocabulary in data/conditions/*.json, keep per-signal confidence,
    never invent location/locale, and set provenance.adapter='liquid-vlm' with the model version.
    If Liquid turns out to emit class labels with scores, wrap LabelListVLMAdapter instead of re-implementing it.
    """
    name = "liquid-vlm"

    def observe(self, raw):
        raise NotImplementedError("Liquid VLM output format unavailable; use MockVLMAdapter")
