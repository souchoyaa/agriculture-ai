# Backend — coffee leaf rust analysis service

FastAPI + uv. Domain logic in `app/domain/` (no HTTP), VLM boundary in `app/adapters/vlm.py`, curated data in `data/`.

## Run
```sh
cd backend
export UV_CACHE_DIR="$PWD/.cache/uv" UV_PYTHON_INSTALL_DIR="$PWD/.cache/python"
uv sync --python 3.12
uv run python -m unittest discover -s tests          # 71 tests, offline (verified 2026-10-04 04:56Z)
uv run python scripts/demo.py                        # all scenarios end-to-end, writes docs/backend/examples/*.geojson|svg
AGRI_FIXED_NOW=2026-10-04T04:59:00Z uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
uv run python scripts/demo.py --base-url http://127.0.0.1:8000   # same journey over real HTTP
uv run python scripts/generate_fixtures.py [--check]  # shared/fixtures from backend output
```
Optional network: `AGRI_WEATHER_LIVE=1` (live Open-Meteo, cache fallback); `scripts/fetch_data.py forecast --lat .. --lon ..`; `scripts/fetch_data.py era5-chinchina && scripts/validate_chinchina.py`; `scripts/fetch_data.py climatology && scripts/build_climatology.py` (ERA5 2015–2024 baseline).
CORS for a web build on another origin: `AGRI_CORS_ORIGINS=http://localhost:8091`. Responses are gzip-compressed when accepted.
Without `AGRI_FIXED_NOW` the real clock is used. The real weather cache was fetched 2026-10-04T04:45:47Z; it is fresh for six hours after that fetch, then explicitly stale. The frozen fixture analysis time is 2026-10-04T04:59:00Z.

## Integration status
Integration branch `integration` contains backend 42f4dd7 and frontend source from aacd963 (source integration 7acfbdb), plus the monitor-completed weather/fixture refresh. Independent checks: backend 71 tests (one optional raw-ERA5 test skipped), frontend TypeScript/adapters and 17 domain tests, production web export. Earlier combined milestones passed strict real-backend browser smoke and phone/desktop journeys with zero console errors; evidence is in `docs/backend/integration/README.md`. The newest source/data refresh still awaits another full browser journey after Claude resumes. Existing screenshots were preserved.

## Coverage
| Crop | Condition | Signals understood | Locales |
| --- | --- | --- | --- |
| coffee | coffee leaf rust (*Hemileia vastatrix*) | orange_powder_leaf_underside (specific), rust_like_leaf_marks, yellow_spots_upper_leaf, lesions_lower_canopy_first, premature_leaf_drop, brown_dry_lesion_centres | en; es, fr agent-authored (not native-reviewed); others fall back to en with `fallback: true` |
Look-alike conditions (Cercospora/brown leaf spot, leaf miner, red spider mite, healthy) never add evidence and block `supported` when confident; optional leaf-area % → OIRSA severity level. Other crops → `unsupported`. Weather cache: one demo point (−1.95, 30.06; synthetic farm location, real Open-Meteo data). Elsewhere weather is `unavailable` unless live fetch is enabled.

## What the output means
- `condition.confidence`: uncalibrated evidence score from image signals, not a probability. `supported` needs a specific signal; < 0.35 abstains.
- `weather_risk.class`: share of days with ≥ 6 h wet spell at favourable temperature, 14 d back / 7 d ahead. Uncalibrated; saturates in humid zones (see `docs/backend/model.md`).
- `map`: relative scouting priority (0–1), not infection probability.
- `review`: proposes officer review; never contacts anyone (`requires_user_authorization`).
- Sources: `data/sources.json` (URL, access date, licence, region). Guidance from Hawaiʻi extension material plus Rwanda Agriculture Board/Plantwise factsheet and a Rwandan farm survey; generic measures only, no product/dose advice (`guidance_scope`, `regional_context`).

## Next step for the real Liquid adapter
Implement `LiquidVLMAdapter.observe(raw)` in `app/adapters/vlm.py`: map model labels onto the signal vocabulary in `data/conditions/*.json`, keep per-signal confidence, never invent location/locale, set `provenance.adapter = "liquid-vlm"` + model version, validate with `contracts.validate("observation", …)`. Unknown labels pass through as unrecognised (they cannot raise the score).

## Limitations
No expert review of weights/thresholds/translations; no incidence-based validation; gridded model weather (not canopy/station); no DEM/shade/farm boundary; a Python service is not evidence of on-device deployment.
