# Integration report — run b4b20e0b

## 2026-10-04 ~00:40Z: integration branch cc65e8a = backend bace494 + frontend f0456c2 (merge, no conflicts)
Worktree `worktrees/integration` (branch `integration`). Isolated ports: backend :8790, static web export :8091 (frontend's own :8000/:8081 untouched).

| Check | Result |
| --- | --- |
| backend `uv run python -m unittest discover -s tests` (clean checkout) | PASS 59 (1 skip: raw ERA5 not committed by design) |
| frontend `npm ci && npm run check` (tsc, adapters, 10 domain checks) against backend's shared/ | PASS |
| `npx expo export --platform web` | PASS |
| Browser journey (frontend `tests/http-smoke.ts` flow, headless Chrome, phone viewport) → Settings: Server http://localhost:8790 → Test connection → New check (Valley coffee, orange-yellow powder, "not sure") → Save | POST /v1/analyses 200 (+ CORS preflight 200); result rendered from agri-backend |
| Same with pinned clock (AGRI_FIXED_NOW) and real clock | both render; real clock → weather cache age ~1 h, fresh |

Original frontend smoke asserts "DEMO RESULT" (written against bootstrap mock-api); against the real backend a farmer report is `data_mode: live`, so that assertion fails by design — the journey itself passed. Rendered text (real clock): "Needs review / Condition not determined / evidence score 0.33 … not the chance that the plant is sick", weather 23 °C / 60.9 % / 0.4 mm, "No nearby risk map … Limits: No suspected condition", data origin agri-backend, contract 0.1.0. Screenshots: `cc65e8a-phone-http-result*.png`.

### Findings sent to frontend (requests/frontend/backend-integration-cc65e8a.md)
1. Checkbox "Orange-yellow powder or spots under leaves" sends `rust_like_leaf_marks`; the specific backend signal is `orange_powder_leaf_underside` (vocabulary: GET /v1/conditions). With "not sure" (0.5) the backend abstains — scientifically correct for the sent label, but loses the farmer's most specific observation.
2. Weather shown as "Measured <as_of>": values are model data fetched at as_of (environment.data_kind, origin, age_hours).
3. Banner "Server answers are demo data" while data mode is live.
4. Map: render by properties.kind (see backend-precheck-bace494.md).
Backend change from this run: alias leaf_drop → premature_leaf_drop; leaf_yellowing / insect_damage / dark_berry_lesions intentionally unrecognised (non-specific / not rust), tested.

## 2026-10-04 04:20Z: integration e85ff60 = backend 24a6816 + frontend e114fc6 (committed, not yet announced)
Commands (exact):
- `cd worktrees/integration/backend && uv run python -m unittest discover -s tests` → **Ran 63 tests, OK (skipped=1)** (backend worktree: 63, OK, 0 skipped). Earlier status entries of "64/65 tests" were miscounted; 63 is the verified count.
- `cd worktrees/integration/frontend && npm ci && npm run check` → tsc + adapters + **13/13 domain checks passed**.
- `npx expo export --platform web` → OK; servers: `AGRI_CORS_ORIGINS=http://localhost:8091 uv run uvicorn app.main:app --port 8790` (real clock), `python3 -m http.server 8091` in dist; both stopped by PID afterwards.
- Browser: `npx tsx journey.ts http://localhost:8091 http://localhost:8790 <outdir>` (script in this folder; run from frontend/ for playwright-core).

Result: connection "✓ Connected. Contract 0.1.0, data mode cached."; POST /v1/analyses 200; analysis data_mode **live** (farmer-report), needs_review/undetermined (score 0.33), environment fresh (cache age 4.6 h); UI renders server result, evidence wording, weather, map limits, privacy copy ("Sent to the server…; Not sent: your photo and note"). Screenshots `e85ff60-phone-result-{top,full}.png`.

Still failing / open (sent to frontend): (1) banner "Server answers are demo data" shown for a data_mode=live result → per-result live/demo distinction NOT met; (2) checkbox still sends rust_like_leaf_marks; (3) weather labelled "Measured"; (4) map kind rendering not exercised (abstained result has no map); (5) console: one 404 resource and one ERR_CONNECTION_REFUSED during journey; (6) frontend http-smoke still asserts "data mode demo"/"DEMO RESULT".

## 2026-10-04 04:25Z: integration 95747ce = backend 24a6816 + frontend 8964deb (announced fe-002) — JOINT JOURNEY PASSES
- `git diff backend -- shared docs/interfaces.md` on integration: empty (frontend imported backend shared verbatim).
- backend `uv run python -m unittest discover -s tests` → Ran 63 tests, OK (skipped=1).
- frontend `npm ci && npm run check` → tsc + adapters + 14/14 domain checks.
- frontend `npx tsx tests/http-smoke.ts http://localhost:8091 http://localhost:8790` (real clock backend, export served on 8091) → "HTTP smoke passed: POST /v1/analyses [200] — agri-backend result with map/weather rendered; no note/photo in request". Screenshots copied: `95747ce-phone-http-result.png`, `95747ce-phone-http-map.png` (map: heat cells by priority, ranked pins 1–5 SW-elongated downwind, "not the chance of infection", legend + ordered text list).
- Own journey (journey.ts): health "data mode cached"; result stamp "SERVER ESTIMATE · rule-based · not a diagnosis … Based on your symptom report, not on a photo"; analysis data_mode live, orange_powder_leaf_underside recognised as SPECIFIC SIGN, needs_review score 0.42. Per-result live/demo distinction: MET. Remaining: 2 console errors (404 resource; ERR_CONNECTION_REFUSED) — reported.
- Backend follow-up from this run: low-certainty specific sign was worded "not specific enough" → new message `uncertainty.specific_low_certainty` (en/es/fr), test added (64 tests).

## 2026-10-04 04:30Z: integration cefe8bc = frontend 7a36cb5 (fe-003) + backend 7f21fbd — JOINT JOURNEY PASSES
- backend: Ran 64 tests, OK (skipped=1); frontend: npm run check 14/14 domain; expo export OK.
- journey.ts (now parameterised: `VIEWPORT_W=390|1440 TAG=… npx tsx journey.ts <app> <api> <out>`): phone and desktop both POST 200, SERVER ESTIMATE, data_mode live, orange_powder_leaf_underside; **0 unexpected console errors** (favicon 404 fixed); 1 expected ERR_CONNECTION_REFUSED = frontend's documented health probe of the default address when switching to Server mode (shown as SERVER UNREACHABLE until set).
- frontend tests/http-smoke.ts: PASS. Screenshots: cefe8bc-w390-*, cefe8bc-w1440-* (two-column desktop: sources with access dates, guidance-scope caveat "Guidance sources come from: Hawaiʻi, USA", "Nothing is ever sent automatically", user-prepared officer message), cefe8bc-phone-http-map.png.
- Backend follow-up: review reason for low-certainty specific sign reworded (`specific_low_certainty`, en/es/fr).

## 2026-10-04 04:33Z: integration b353a66 = frontend 02a3de9 (fe-004) + backend 7377b45 — CLEAN
- backend: Ran 64 tests, OK (skipped=1); frontend: npm run check 15/15 domain; expo export OK.
- frontend strict tests/http-smoke.ts (fails on any requestfailed, HTTP ≥ 400 or console error): PASS vs :8790/:8091.
- journey.ts phone 390 + desktop 1440 (screenshots int-02a3de9-w*): POST 200, data_mode live, SERVER ESTIMATE, orange_powder_leaf_underside; **0 console errors, 0 connection refusals**.

## 2026-10-04 04:36Z: integration a30e824 = frontend 884389c (fe-005) + backend 77193e7 — CLEAN
- backend: Ran 65 tests, OK (skipped=1); frontend: npm ci (adds expo-file-system) + npm run check 15/15; expo export OK. Frontend runs against backend's current shared/ fixtures (newer than its own import) without failures.
- strict tests/http-smoke.ts PASS; journey.ts phone 390 + desktop 1440 (int-a30e824-w*): POST 200, live, SERVER ESTIMATE, 0 console errors, 0 refusals.
- Backend change from fe-005 note: weather_risk.climatology.caveat is now plain localized farmer text; developer detail moved to technical_note.
