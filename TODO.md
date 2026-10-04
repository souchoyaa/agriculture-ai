# TODO — next steps (state at af0772c+, see README.md for how to run)

Authoritative branch: `main` (= `integration`). Spec: `agriculture_ai_correction_completion_prompt.md` (launch root).
Everything below is open; everything not listed is implemented and tested (see "Done" at the bottom).

## 1. Model (team)
- [ ] **Swap in the fine-tuned Liquid checkpoint**: edit `frontend/src/model/config.ts` (`VISION_MODEL.id`, `revision` pinned to a
      commit hash, `fineTuned: true`). If it emits dataset labels directly, set `strategy: 'labels'` and implement that one parser in
      `frontend/src/model/perception.ts` (`perceive`). Output must be `{model, model_version, labels:[{label, score}]}`.
- [ ] Check every label it emits exists in `backend/data/vlm_label_map.json` (status `proposed_unverified`) and verify the mapping.
- [ ] Re-run `docs/models/vision-probe-evaluation.md`-style check on a real held-out set (current numbers: n = 3 sanity images).
- [ ] Export the fine-tuned model to ONNX (fp16 vision + q4 decoder) for Transformers.js; measure download/latency → `docs/performance.md`.

## 2. Science / knowledge
- [ ] Disease knowledge beyond coffee leaf rust: Cercospora (brown eye spot), leaf miner, Phoma, coffee berry disease —
      `backend/data/conditions/<id>.json` with signals, transmission family, weather model, sourced scouting/recommendations
      (+ timing today/next/if_worse), messages in `backend/data/messages/{en,fr,es}.json`. Today these labels only become
      unrecognised signals or the Cercospora differential.
- [ ] Spatial families for non-wind diseases (vector, soil/contact) — today a condition without `transmission_family` gets no map (by design).
- [ ] Calibrate/validate scouting priority and weather favourability against incidence data (none yet; heuristic saturates in humid zones — `docs/backend/model.md`).
- [ ] History: add trend reasoning (new / stable / worsening / spreading) and history-driven follow-up timing; today priors only shape the map.

## 3. Localisation
- [ ] Native-speaker review of `frontend/src/i18n/rw.ts` / `sw.ts` (machine-generated; rw has 9 English fallbacks) and of
      agricultural terms — NLLB renders "Possible coffee leaf rust" poorly in Kinyarwanda. Consider a reviewed glossary for condition
      names and key actions, applied before/after NLLB.
- [ ] Regenerate catalogs after adding strings: `cd frontend && npx tsx scripts/translate-ui.ts rw sw` (~10 min CPU).
- [ ] Voice read-aloud of the result (browser `speechSynthesis` / `expo-speech`) for low-literacy users.

## 4. Platforms
- [ ] **Native iOS/Android on-device models**: today native falls back to the labelled demo. Options: host the same workers in a
      WebView (`react-native-webview`, WebGPU availability varies) or native runtimes (onnxruntime-react-native / ExecuTorch / llama.cpp
      with the GGUF Liquid export) + Pyodide alternative for the engine (or a TS port). Decide, then wire behind `src/engine` and `src/model`.
- [ ] Test on real devices (camera, GPS prompt, photo storage, share sheet, back button, offline restart). Not done: no simulator worked here
      (`xcrun simctl` hung; no Android SDK).
- [ ] Service worker / PWA so the web app shell itself loads offline after first visit (models, engine and data already cache).

## 5. Product
- [ ] Field boundary (optional one-time outline) to clip the scouting grid; today the grid is relative guidance around the plant.
- [ ] Extension-review package: export a shareable summary (text + optional photo) with explicit consent; optional upload/sync of
      anonymised observations and cooperative-level aggregation (privacy: coarse locations).
- [ ] Before/after photo comparison in "Compare the last two checks".
- [ ] Weather sync: also refresh disease-knowledge/advisory packages (versioned) when online.

## 6. Engineering
- [ ] CI: run backend tests, `npm run check`, `npm run build:web` on push (GitHub Actions); browser journeys need a WebGPU runner (manual for now).
- [ ] `npm audit` findings (Expo dependency tree) — review without breaking Expo SDK 54.
- [ ] Remove dev test pages `frontend/public/vlm/*.html`, `frontend/public/engine/test.html` from the production export.

## Done (for orientation)
Photo-first automatic flow (no questionnaire); in-browser LFM2.5-VL + Pyodide Python engine + NLLB; offline end to end after one sync;
periodic Open-Meteo sync with freshness; Kinyarwanda/Kiswahili UI + results; location accuracy → grid/kernel/uncertainty; 24 h / 3 d / 7 d
horizons; Today / Next / If worse plan; sourced guidance + regional scope; honest persistence; bundle shell 1.9 MB.
Tests: backend 92; frontend `npm run check` (23 domain/flow + icon audit); browser journeys (`frontend/tests/*-journey.ts`, `screenshots.ts`, `http-smoke.ts`).
Docs: `README.md`, `docs/demo-script.md`, `docs/performance.md`, `docs/science/spatial-model.md`, `docs/models/vision-probe-evaluation.md`.
