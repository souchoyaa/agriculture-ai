# Field companion

Offline-first coffee field checks with sourced rule-based analysis, real cached weather, relative scouting priorities, local history and English/French screens. Contract 0.1.0. The Liquid image model remains unavailable: server estimates use the farmer's symptom report and explicitly say so. Demo answers are labelled fixed examples.

## Run

Use this **integration worktree** for the combined app. Start the backend in one terminal:

```sh
cd backend
export UV_CACHE_DIR="$PWD/.cache/uv" UV_PYTHON_INSTALL_DIR="$PWD/.cache/python"
uv sync --python 3.12
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start the frontend in another:

```sh
cd frontend
npm ci
EXPO_OFFLINE=1 npm run web
```

The app defaults to the offline demo. For actual server estimates, open Settings, select the server source, enter `http://localhost:8000`, and test the connection. Physical devices need the computer's reachable LAN address and suitable backend binding. Configure `AGRI_CORS_ORIGINS` when using a different web origin.

## Verified

- Backend: `uv run python -m unittest discover -s tests` — 70 tests, one optional raw-ERA5 check skipped in this checkout.
- Frontend: TypeScript, adapters and 16 domain checks pass; `npm run build:web` exports the production app.
- Earlier integrated milestones: strict real-backend browser journey on phone and desktop, zero console errors/refused requests. Newest source/data refresh awaits another complete browser run after Claude's quota reset.
- Real Open-Meteo weather fetched 2026-10-04 06:45 Zurich; frozen offline fixtures generated for 06:59 Zurich. Fetch age is shown and data becomes explicitly stale after six hours.

On restricted local shells, run frontend checks with `node --import tsx tests/adapters.ts`, `node --import tsx tests/domain.ts`, and `./node_modules/.bin/tsc --noEmit`; the normal `npm run check` wrapper uses a local IPC socket.

## Scope

Photos and notes stay on the device; server mode sends the crop/symptom report, time and saved location. Native photo copies record failed persistence and reset only removes app-owned copies. Android/iOS bundles compile, but physical-device photo/share behavior remains unverified.

Evidence and weather/scouting scores are uncalibrated; they are not diagnosis or infection probabilities. Guidance preserves sources, historical dates, regional applicability and translation limitations. Regional sources include Rwanda Agriculture Board/Plantwise and the 2012 Rwanda survey; no pesticide product or dosage is prescribed. The server stores no shared history.

See [backend instructions](backend/README.md), [frontend evidence](docs/frontend/README.md), and [contracts](docs/interfaces.md). Architecture/bootstrap history remains in Git; the architecture checkout is separate from this combined worktree.
