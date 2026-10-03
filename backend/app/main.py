import json
from pathlib import Path
from copy import deepcopy
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jsonschema import Draft202012Validator, FormatChecker

SHARED = Path(__file__).resolve().parents[2] / "shared"
def read(path):
    return json.loads((SHARED / path).read_text())
def validate(kind, payload):
    Draft202012Validator(read(f"contracts/{kind}.schema.json"), format_checker=FormatChecker()).validate(payload)
class MockVLMAdapter:
    """Accept canonical input only; future Liquid parsing stays behind this boundary."""
    def observe(self, payload):
        validate("observation", payload)
        return deepcopy(payload)
def analyze(observation):
    result = read("fixtures/analysis.json")
    result["observation_id"] = observation["id"]
    if observation["crop"] != "coffee":
        result["status"] = "unsupported"
        result["condition"].update(id="unknown", label="Unsupported crop", confidence=0, uncertainty="Bootstrap supports coffee demo only")
        result["scouting"] = []
        result["recommendations"] = []
    validate("analysis", result)
    return result
app = FastAPI(title="Agriculture demo", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:8081", "http://localhost:19006"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
@app.get("/v1/health")
def health(): return {"status": "ok", "contract_version": "0.1.0", "data_mode": "demo"}
@app.post("/v1/analyses")
def create_analysis(payload: dict):
    from jsonschema.exceptions import ValidationError
    try:
        return analyze(MockVLMAdapter().observe(payload))
    except ValidationError as error:
        raise HTTPException(422, detail={"code": "invalid_observation", "message": error.message, "retryable": False}) from error
