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
