"""VLM boundary. The real Liquid model's raw output format is unknown; parse it here, nowhere else."""
from copy import deepcopy

from ..contracts import validate


class MockVLMAdapter:
    """Accept canonical observations only; does not assert anything about Liquid's eventual raw format."""
    name = "mock-vlm"

    def observe(self, payload):
        validate("observation", payload)
        return deepcopy(payload)


class LiquidVLMAdapter:
    """Placeholder: implement `observe(raw) -> canonical observation` once the Liquid output format is known.

    Map model labels onto the condition signal vocabulary in data/conditions/*.json, keep per-signal confidence,
    never invent location/locale, and set provenance.adapter='liquid-vlm' with the model version.
    """
    name = "liquid-vlm"

    def observe(self, raw):
        raise NotImplementedError("Liquid VLM output format unavailable; use MockVLMAdapter")
