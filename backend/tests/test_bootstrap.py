import unittest
from fastapi.testclient import TestClient
from app.main import app, read, validate, MockVLMAdapter

class BootstrapTests(unittest.TestCase):

    def test_fixtures_and_adapter(self):
        for kind in ("observation", "analysis"):
            validate(kind, read(f"fixtures/{kind}.json"))
        assert MockVLMAdapter().observe(read("fixtures/observation.json"))["data_mode"] == "demo"
    def test_http_contract(self):
        client = TestClient(app)
        assert client.get("/v1/health").status_code == 200
        result = client.post("/v1/analyses", json=read("fixtures/observation.json"))
        assert result.status_code == 200
        validate("analysis", result.json())
        assert result.json()["data_mode"] == "demo"
        assert client.post("/v1/analyses", json={}).status_code == 422
    def test_unsupported(self):
        observation = read("fixtures/observation.json")
        observation["crop"] = "unknown"
        assert TestClient(app).post("/v1/analyses", json=observation).json()["status"] == "unsupported"
