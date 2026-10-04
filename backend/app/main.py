import os
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jsonschema.exceptions import ValidationError

from .adapters.vlm import MockVLMAdapter
from .contracts import read, validate
from .domain import knowledge
from .domain.analysis import CONTRACT_VERSION, analyze as analyze_observation
from .domain.weather import parse_time

__all__ = ["app", "read", "validate", "MockVLMAdapter", "analyze"]


def clock():
    """AGRI_FIXED_NOW pins analysis time for reproducible demos; otherwise real UTC time."""
    fixed = os.environ.get("AGRI_FIXED_NOW")
    return parse_time(fixed) if fixed else None


def analyze(observation, now: datetime | None = None):
    result = analyze_observation(observation, now=now or clock())
    validate("analysis", result)
    return result


app = FastAPI(title="Agriculture analysis", version=CONTRACT_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("AGRI_CORS_ORIGINS", "http://localhost:8081,http://localhost:19006").split(","),
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.get("/v1/health")
def health():
    """Service capability, not a label for analyses: every analysis carries its own data_mode and provenance.components."""
    live = os.environ.get("AGRI_WEATHER_LIVE") == "1"
    return {
        "status": "ok", "contract_version": CONTRACT_VERSION,
        "data_mode": "live" if live else "cached",
        "data_mode_scope": "service weather default only; use each analysis' data_mode and provenance.components",
        "capabilities": {
            "image_inference": "none: mock VLM adapter accepts canonical observations; Liquid model unavailable",
            "weather": "live Open-Meteo with cache fallback" if live else "offline cache (model data, see environment.age_hours)",
            "calibration": "none: evidence scores, weather classes and map priorities are uncalibrated heuristics",
            "persistence": "none: stateless, observations are not stored",
        },
        "weather_live": live, "fixed_now": os.environ.get("AGRI_FIXED_NOW"),
    }


@app.get("/v1/conditions")
def conditions():
    return {"contract_version": CONTRACT_VERSION, "supported_crops": knowledge.supported_crops(),
            "locales": sorted(knowledge.catalogs()),
            "conditions": [{"id": c["id"], "crop": c["crop"], "pathogen": c["pathogen"], "signals": sorted(c["signals"]),
                            "knowledge_reviewed": c["knowledge_reviewed"]} for c in knowledge.conditions().values()]}


@app.get("/v1/sources")
def sources():
    return {"contract_version": CONTRACT_VERSION, "sources": list(knowledge.sources().values())}


@app.post("/v1/analyses")
def create_analysis(payload: dict):
    try:
        observation = MockVLMAdapter().observe(payload)
    except ValidationError as error:
        raise HTTPException(422, detail={"code": "invalid_observation", "message": error.message, "retryable": False}) from error
    return analyze(observation)
