# Backend decisions and TODO

## Decisions (2026-10-04, run b4b20e0b)
- **Worked example: coffee leaf rust (Hemileia vastatrix).** Best-documented in accessible extension sources; matches bootstrap fixture.
- **Domain code is HTTP-free** (`backend/app/domain/`). `app/main.py` only validates and routes. VLM parsing is isolated in `app/adapters/vlm.py` (`MockVLMAdapter`; `LiquidVLMAdapter` placeholder).
- **Knowledge as data files** (`backend/data/`): `sources.json` registry, `conditions/<id>.json` (signal weights, model parameters with `source_ids`, guidance IDs), `messages/<locale>.json`. A new crop/condition = one condition file + message keys; no code change.
- **Evidence score**: noisy-OR of `weight × signal confidence`. Weights are agent-authored heuristic assumptions (ranking specificity from cited symptom descriptions); not expert-reviewed, not fitted; the score is not a diagnostic probability. `supported` requires score ≥ 0.75 *and* a specific signal (orange powder on leaf underside); otherwise `needs_review`; < 0.35 abstains (`condition.id = "undetermined"`). Officer review is always *proposed* (never sent; `requires_user_authorization: true`, `auto_contact: false`).
- **Weather**: Open-Meteo hourly cache files (CC BY 4.0) in `backend/data/weather_cache/`; live fetch only with `AGRI_WEATHER_LIVE=1`, failures fall back to cache; nearest cache within 15 km. `fresh` ≤ 6 h since fetch, else `stale`; no cache → `unavailable` (never zero risk). Values are model output, not station observations.
- **Weather favourability** (not probability): see `docs/backend/model.md`.
- **Spatial**: 11×11 grid of 20 m cells, relative scouting priority via exponential distance decay (L = 40 m) from reported positives, downwind stretch only if forecast wind is directionally consistent (resultant ≥ 0.3), reduced near prior observations reported clear. 5 ranked scouting points ≥ 40 m apart. Uncalibrated layout heuristic.
- **History** is device-held and sent as optional `prior_observations` (privacy/offline: backend is stateless and stores nothing).
- **Localization**: curated catalogs en (source), es, fr (agent-authored, not native-reviewed; flagged in `localization`). Unknown locales fall back to en with `fallback: true`. Stable IDs identical across locales (tested).
- **Contract stays 0.1.0**: all changes additive optional properties; `shared/fixtures/analysis.json` is now real backend output at `AGRI_FIXED_NOW=2026-10-04T04:59:00Z`. Scenario examples in `shared/fixtures/examples/`. `scripts/generate_fixtures.py --check` (also a unit test) prevents drift.

## Compatibility note
Bootstrap `frontend/src/api.ts` derived types via `typeof analysis.json`; its literal unsupported `condition` lacks the new optional keys, so bootstrap `tsc` fails on the backend branch only. Frontend's in-progress explicit interfaces (index signatures) are compatible. Backend never edits frontend/.

## TODO / follow-up
- Plant-pathologist review of weights/thresholds; native-speaker review of es/fr.
- Validate weather class against field incidence data before any calibrated claim.
- Real Liquid adapter: map model labels → signal vocabulary in condition files.
- Additional conditions (e.g. coffee berry disease) only after review of sources.
- Elevation/shade covariates for within-farm suitability (needs DEM/farm boundary).
- Evidence: repeated signal labels (case/space-normalized) count once at their highest confidence; duplicates listed with `duplicate: true`, contribution 0 (steering 6268b401/68209b2b).
- **Health vs analysis data mode** (steering d95fc414): /v1/health.data_mode is the service weather default (cached/live) with explicit capabilities (no Liquid inference, no calibration, no persistence); each analysis carries its own data_mode (mirrors observation: demo fixture vs live farmer report) plus provenance.components for mixed origins.
- **Regional scoping** (steering 084c2010): Rwanda-sourced (2012) recommendations and context are emitted only when the location is inside the approximate `rwanda_approx` box, each with `regional_scope` (match type, source year, localized note that the box includes border areas of neighbours). Missing/other locations get only generic guidance.

## Monitor completion of interrupted weather refresh
Claude backend fetched the real Open-Meteo cache at 2026-10-04T04:45:47.168074+00:00 before hitting quota. The monitor preserved those downloaded weather values in integration (clarifying the model-versus-station provenance note) and froze fixture analysis time to 2026-10-04T04:59:00+00:00, then regenerated fixtures offline. The backend development worktree and its uncommitted download were left intact.

## Mixed observation provenance
The client explicitly identifies seeded example-field coordinates during capture and in results. Live farmer reports retain an example-location note in observation provenance, and the backend preserves that supplied source in its observation component. New personal fields currently have no location-entry flow; their real weather/scouting context remains unavailable.
