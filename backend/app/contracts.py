import json
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

SHARED = Path(__file__).resolve().parents[2] / "shared"


def read(path):
    return json.loads((SHARED / path).read_text())


@lru_cache
def validator(kind):
    return Draft202012Validator(read(f"contracts/{kind}.schema.json"), format_checker=FormatChecker())


def validate(kind, payload):
    validator(kind).validate(payload)
