# Agriculture foundation

Offline demo: Liquid → VLM adapter → canonical observation → backend → canonical analysis → mock/HTTP client adapter. Contract **0.1.0**. All bootstrap analysis is visibly synthetic; no live model/weather needed.

## Run and check

Backend (Python 3.12, uv):
```sh
cd backend
export UV_CACHE_DIR="$PWD/.cache/uv"
export UV_PYTHON_INSTALL_DIR="$PWD/.cache/python"
uv sync --python 3.12
uv run python -m unittest discover -s tests -v
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Frontend (Node 22+ recommended, npm):
```sh
cd frontend
export npm_config_cache="$PWD/.cache/npm"
npm ci
npm run check
EXPO_OFFLINE=1 npm run web
npm run build:web
```
Offline Metro startup avoids Expo network metadata/cache writes outside the workspace; `EXPO_OFFLINE=1 npm run web` was served and checked.

Expo Go/native development: `npm start`, choose Android/iOS with a suitable device/emulator. Native builds/camera are not verified by bootstrap. Web export proves the client bundles independently of backend. Mock mode is the default in App.tsx. Instantiate `httpApi('http://localhost:8000')` to use HTTP; physical devices need the host LAN address and appropriate backend binding. HTTP failures never silently become mock success.

Shared fixtures are validated by both checks. Backend check exercises schema validation, invalid input, unsupported crop and in-process HTTP. Frontend check exercises schemas, mock responses, HTTP mapping and network failure. See docs/interfaces.md, docs/architecture.md and docs/continuation.md.

## Bootstrap evidence and handoff

Normal `uv sync --python 3.12` and npm installation passed; portable lockfiles are committed. Backend: three tests passed. Frontend: TypeScript, fixture/mock/HTTP checks and web export passed. The frontend HTTP adapter was exercised against a running FastAPI server. The supplied supervisor passed all 13 fake-provider recovery tests. Browser verification and exact bootstrap/worktree SHA are recorded in the live architecture checkpoint.

Worktrees: `/Users/sachagodey/Documents/project/hackaton/worktrees/backend`, `frontend`, and `integration` (same parent). Backend owns integration and shared contracts after readiness; frontend owns its client and role docs. The root foundation is frozen after handoff. Workers verify matching run/readiness and bootstrap ancestry, enter their assigned worktrees and install dependencies there with the commands above. Worktree environments are intentionally independent.

Known limits: no native-device verification, persisted cache, sync queue, real Liquid/weather, sourced diagnosis or calibrated risk. npm reports 30 dependency audit findings (7 moderate, 23 high); dependency remediation belongs to the client owner and must preserve Expo compatibility. No automatic major upgrade was applied.
