# Agriculture foundation

Offline demo: Liquid → VLM adapter → canonical observation → backend → canonical analysis → mock/HTTP client adapter. Contract **0.1.0**. All bootstrap analysis is visibly synthetic; no live model/weather needed.

## Run and check

Backend (Python 3.12, uv):
```sh
cd backend
uv sync --python 3.12
uv run python -m unittest discover -s tests -v
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Frontend (Node 22+ recommended, npm):
```sh
cd frontend
npm ci
npm run check
npm run web
npm run build:web
```
Expo Go/native development: `npm start`, choose Android/iOS with a suitable device/emulator. Native builds/camera are not verified by bootstrap. Web export proves the client bundles independently of backend. Mock mode is the default in App.tsx. Instantiate `httpApi('http://localhost:8000')` to use HTTP; physical devices need the host LAN address and appropriate backend binding. HTTP failures never silently become mock success.

Shared fixtures are validated by both checks. Backend check exercises schema validation, invalid input, unsupported crop and in-process HTTP. Frontend check exercises schemas, mock responses, HTTP mapping and network failure. See docs/interfaces.md, docs/architecture.md and docs/continuation.md.

## Bootstrap status

Setup is blocked pending corrected supervisor sandbox network access. Frontend installation/build/type checks have not passed. Backend checks passed only with temporary locally reconstructed cached wheels and `uv run --no-sync`; normal uv sync is still unverified. There is no readiness/bootstrap commit or product worktree yet. See live architecture checkpoint before continuing.
