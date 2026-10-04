"""Curated condition knowledge, source registry and localized message catalogs (offline files)."""
import json
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"
DEFAULT_LOCALE = "en"


@lru_cache
def sources() -> dict[str, dict]:
    return {s["id"]: s for s in json.loads((DATA / "sources.json").read_text())}


@lru_cache
def conditions() -> dict[str, dict]:
    return {c["id"]: c for c in (json.loads(p.read_text()) for p in sorted((DATA / "conditions").glob("*.json")))}


def conditions_for_crop(crop: str) -> list[dict]:
    return [c for c in conditions().values() if c["crop"] == crop.strip().lower()]


def supported_crops() -> list[str]:
    return sorted({c["crop"] for c in conditions().values()})


@lru_cache
def catalogs() -> dict[str, dict]:
    return {p.stem: json.loads(p.read_text()) for p in sorted((DATA / "messages").glob("*.json"))}


def resolve_locale(requested: str | None) -> tuple[str, bool]:
    """Return (locale_used, fell_back). Accepts BCP-47 tags such as 'es-CO' by language prefix."""
    if not requested:
        return DEFAULT_LOCALE, False
    language = requested.replace("_", "-").split("-")[0].lower()
    if language in catalogs():
        return language, False
    return DEFAULT_LOCALE, True


class Translator:
    def __init__(self, locale: str):
        self.locale = locale
        self.catalog = catalogs()[locale]
        self.fallback = catalogs()[DEFAULT_LOCALE]

    def __call__(self, key: str, **values) -> str:
        template = self.catalog.get(key) or self.fallback[key]
        return template.format(**values)

    @property
    def meta(self) -> dict:
        return self.catalog["_meta"]


def cite(source_ids) -> list[dict]:
    registry = sources()
    return [registry[i] for i in sorted(set(source_ids))]
