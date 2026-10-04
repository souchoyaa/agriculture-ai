# Field companion — photo-first, offline-first coffee field assistant

A farmer takes **one photo**. Everything else runs **on the device, in the browser**:

```text
photo → vision model (LiquidAI LFM2.5-VL, WebGPU) → label list
      → backend adapter (Python, in-browser via Pyodide) → canonical observation (+ device history)
      → analysis: disease knowledge, cached weather (past 14 d + 7 d forecast), weather favourability,
        uncertainty-aware scouting map (24 h / 3 d / 7 d), sourced guidance
      → local-language output (en/fr/es by the engine; Kinyarwanda/Kiswahili by NLLB-200 on device)
      → saved on the phone
```

After one online session (model download + weather sync) the whole flow works **offline**. No server is required;
the FastAPI server in `backend/` remains available as an optional source and as the test harness.

## Quickstart (web, the demo path)

Needs Node 22+, Python 3 (for `python3 -m http.server`), Chrome or Edge with WebGPU.

```sh
cd frontend
npm ci
npm run build:web          # bundles model workers + Pyodide engine + Expo web app into dist/
cd dist && python3 -m http.server 8094
# open http://localhost:8094 → Fields → "Check this field" → "Use example photo"
```

First check downloads the vision model once (~770 MB, cached by the browser). Kinyarwanda/Kiswahili results download
the translation model once (~900 MB). Settings shows sync state, model status and the honest capability list.

Dev server: `npm run web` (rebuilds workers/engine first).

## Swap in the team's fine-tuned model

Edit **`frontend/src/model/config.ts`** only (`VISION_MODEL.id/revision`, and `strategy: 'labels'` if the fine-tuned
model emits dataset labels directly; then implement that one parser in `src/model/perception.ts`). Labels are mapped to
canonical signals by `backend/data/vlm_label_map.json` through `backend/app/adapters/vlm.py` (`LabelListVLMAdapter`).
Nothing downstream changes. Today's public checkpoint is probed with multiple-choice/yes-no questions; see
`docs/models/vision-probe-evaluation.md` (it reliably detects rust-like orange powder and non-leaf photos, little else).

## Checks

```sh
cd backend && export UV_CACHE_DIR="$PWD/.cache/uv" && uv sync --python 3.12 && uv run python -m unittest discover -s tests
cd frontend && npm run check                   # tsc + adapters + domain/flow tests + icon audit
# Browser (Chrome WebGPU), app served from dist on :8094, persistent profile keeps the model cache:
PROFILE=.cache/chrome-models npx tsx tests/photo-journey.ts http://localhost:8094 --offline
```

## Where things are

| Area | Path |
|---|---|
| Model checkpoints (single config point) | `frontend/src/model/config.ts` |
| In-browser workers (VLM, translation, Python engine) | `frontend/workers/*.worker.js`, built by `frontend/scripts/build-*.mjs` |
| Automatic orchestration (no questionnaire) | `frontend/src/pipeline/check.ts` |
| Periodic sync (weather cache, freshness) | `frontend/src/sync/sync.ts` |
| Analysis engine (Python, also runs in browser) | `backend/app/domain/*`, data in `backend/data/` |
| Contracts and fixtures | `shared/contracts`, `shared/fixtures` |
| Spatial model / uncertainty | `backend/app/domain/spatial.py`, `docs/science/spatial-model.md` |

## Honest limits

Public, not fine-tuned vision checkpoint; uncalibrated scores (not probabilities, not validated against field
incidence); weather is model data, not stations; rw/sw are unreviewed machine translations; on-device models run in
WebGPU browsers — the native iOS/Android builds currently fall back to the labelled demo. See Settings → "What this
version does not do".
