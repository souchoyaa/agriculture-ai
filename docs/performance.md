# Performance report (measured)

Machine: Apple M1 Pro, 16 GB, Chrome (headless, WebGPU via Metal). Web export served locally (`npm run build:web`).
Numbers are from the scripted journeys in `frontend/tests/*-journey.ts`, not synthetic benchmarks. Not measured:
modest Android phones, iOS Safari, GPU/JS memory.

## Download / disk (web)

| Component | Size | When | Cached by |
|---|---|---|---|
| App shell (JS 0.70 MB + 5 font files + 16 KB icon subset + HTML) | **1.9 MB** | app open | browser HTTP cache |
| Python engine: Pyodide core 13.4 MB + wheels 0.39 MB + backend/data/contracts zip 0.17 MB | **14.0 MB** | first analysis | browser HTTP cache |
| ONNX Runtime WebAssembly (asyncify for WebGPU + plain fallback) | 41 MB on disk; ~27 MB fetched on the WebGPU path | first model use | browser HTTP cache |
| Vision model LFM2.5-VL-450M ONNX (vision fp16 188 MB + embed fp16 134 MB + decoder q4 481 MB) | **~803 MB** | first photo check | Cache API (`transformers-cache`) |
| Translation model NLLB-200 distilled 600M (encoder q8 419 MB + decoder q8 476 MB) | **~895 MB** | first Kinyarwanda/Kiswahili result | Cache API |
| Weather sync per location (Open-Meteo, 14 d past + 7 d forecast, hourly, 5 variables) | ~25–35 KB JSON | sync when online (≤ every 6 h) | AsyncStorage/localStorage |

Before the bundle work the app shell was ~12.7 MB (every Inter/Manrope weight and italic, every vector-icon font) and
the ONNX Runtime directory 85 MB.

## Latency (WebGPU, models already cached)

| Step | Measured |
|---|---|
| Pyodide engine start (load + jsonschema + unpack backend) | 1.8 s (once per session) |
| Vision probes per photo (5 prompts) | 1.7–3.8 s |
| Canonical observation via backend adapter (Pyodide) | 2 ms |
| Full analysis incl. weather favourability, climatology, scouting grid with 3 horizons (Pyodide) | 17 ms |
| Whole photo check, end to end (tap → result), online | 5.0–6.4 s |
| Whole photo check, network blocked (offline) | 4.4–5.4 s |
| Kinyarwanda result, first time (includes ~895 MB model download) | 171 s |
| Model load from cache (vision) | ~27 s first session incl. download; subsequent sessions see 'Analysing' step only |

## Build-time

| Task | Time |
|---|---|
| UI machine translation (311 strings) Kinyarwanda / Kiswahili, NLLB q8 on CPU (Node) | 286 s / 204 s |
| Icon subset (fonttools via uvx) | < 5 s |

## Notes

- The 0.8–0.9 GB model downloads are justified only because they make the field workflow work offline afterwards;
  they are deferred until first use and shown in Settings → Models. A fine-tuned, smaller checkpoint would cut this.
- WebGPU is required for usable vision latency; the wasm fallback works but was not timed.
