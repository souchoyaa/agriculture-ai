# Field companion — frontend

Expo / React Native / TypeScript client for web, iOS and Android. Contract 0.1.0. Default mode is the **offline demo** (mock adapter); results are synthetic and labelled as such everywhere.

## Main journey (observe → understand → inspect → act → monitor)

1. **Fields** — fields sorted by attention; a "Start here" card names the one field to look at and why. Attention is a presentation summary of the latest backend `status` plus record age (needs review → *Needs attention*; pending/failed/overdue/follow-up due → *Check soon*; never checked → *Not checked*). It is not a risk model.
2. **New check** (3 steps) — field → optional photo + self-confirmed evidence checklist (daylight, leaf underside, close-up, several plants; the app says it does *not* judge photo quality) → symptoms (glyph + text) and *Sure / Not sure*. Saving writes durably on the device **before** any analysis request.
3. **Result** — demo/live stamp, status badge (glyph + word), condition label and backend uncertainty text; "How strong is the evidence?" 3-segment meter with "signal score, not the chance the plant is sick"; tickable scouting steps + "Add another check" (request for more information); guidance with sources or a "No source attached: not verified advice" warning; weather (fresh/stale/unavailable); nearby risk (schematic map + legend + text list, or explicit unavailable/unsupported with limitations); follow-up in 3/7/14 days (in-app only); collapsible provenance/data-origin; "Saved on this phone only. Not uploaded".
4. **History / field timeline** — every check with status, demo tag, "On this phone", follow-up due/date, photo marker.
5. **Settings** — language, result source (built-in demo vs server URL + Test connection), reset to example data (confirmation), explicit list of what this version does not do.

## Structure and conventions

- `src/api.ts` — canonical types, `mockApi`, `httpApi(baseUrl)`, `normalizeAnalysis` (missing sections → `unavailable`, never zero risk; missing identity → `invalid_response`). Views only see the `Api` interface. Real model integration belongs behind the backend adapter; nothing in the UI changes.
- `src/domain/` — pure logic: records, symptom → signal mapping, attention summary, map feature interpretation (displays backend `level`/`score`/`valid_at` as given).
- `src/state/repository.ts` — persisted state, seeding (example records are produced by running the mock adapter, not hand-written), load/save, analysis runner. `store.tsx` — React binding; screens call actions only.
- `src/i18n/` — semantic message ids (`result.notProbability`, `symptom.leaf_yellowing`…). `en` and `fr` complete; `rw`, `sw` listed but **not available** → English shown with a visible notice. Service text (condition, scouting, guidance) is English-only and flagged when another locale is active.
- `src/ui/` — theme ("field notebook in sunlight": warm paper, deep ink, turmeric/clay/leaf status colours that always pair with a glyph and a word), large 48–56 px touch targets, focus outlines, roles/states for screen readers.

### Farmer report → canonical observation
Symptom ids are the canonical `signals[].label`. `confidence` encodes the farmer's stated certainty (sure 0.8 / unsure 0.5) and each signal carries additive `origin: "farmer_report"`; `provenance.adapter = "farmer-report"`, `data_mode = "live"` (real user input; analysis may still be demo). Location is only sent if the field has one. Photos never leave the device.

## Offline, persistence, sync

- AsyncStorage (device storage on native, localStorage on web), one versioned key; corrupt data is backed up and example data restored with a visible notice.
- Check saved first, then analysed. Server unreachable → record stays `failed` + retryable, shown as "Saved — waiting for analysis" with Try again; a verified server connection (health OK, or browser `online` event re-test) retries automatically. Failed server checks are **never** silently re-run through the demo adapter. Interrupted in-flight analyses become retryable on next launch.
- There is no upload/sync service in contract 0.1.0 (`POST /v1/analyses` is stateless); everything is "On this phone". Nothing is described as synced.
- Web photos are stored as small data URLs (≤ ~700 kB) so they survive reload; larger ones are refused with a message. Native photos keep the picker URI (may be in cache; not yet copied to app storage).

## Run and check

```sh
cd frontend
export npm_config_cache="$PWD/.cache/npm"
npm ci
npm run check            # tsc + fixture/mock/HTTP adapter checks + 10 domain/persistence/i18n checks
EXPO_OFFLINE=1 npm run web
npm run build:web        # static export in dist/
# Browser journey + screenshots (Chrome required; serve dist on a CORS-allowed origin):
(cd dist && python3 -m http.server 8081) &
npm run screenshots      # phone + desktop journey, persistence-after-reload, offline pending, locale fallback
# Real HTTP smoke (backend running on :8000):
npx tsx tests/http-smoke.ts
```
Physical devices: set the server address in Settings to the host LAN IP; the backend must bind to it and allow the origin.

## Verified vs simulated (honest status)

Verified in headless Chrome (web export, 390×844 and 1280×860): full journey, validation, save, reload persistence, unreachable server → pending, retry UI, French, unsupported-locale fallback, real HTTP POST to the bootstrap FastAPI. Screenshots in `screenshots/`.

Not verified: native iOS/Android builds, native camera/permissions, screen readers on device, offline behaviour on a device. Simulated/absent: diagnosis (demo fixture), photo analysis (none), weather and risk map (backend returns unavailable; the map renderer is exercised only by unit checks), sync/upload (none), notifications (in-app reminders only), voice (none).
