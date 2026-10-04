# Jury demo script (≈ 5 minutes, deterministic, survives losing Wi-Fi)

## Before the jury (once, online, ~5 min)

```sh
cd frontend && npm ci && npm run build:web && cd dist && python3 -m http.server 8094
```
Open **http://localhost:8094** in Chrome/Edge (WebGPU). Then, still online:
1. Fields → Hillside coffee → **Check this field** → **Use example photo** — downloads the vision model once (~800 MB) and
   syncs weather (header: "On this phone · offline-ready · Weather updated just now · forecast until …").
2. Settings → Language → **Ikinyarwanda**, repeat one check — downloads the translation model once (~900 MB). Back to English.
3. Settings → Data sync → **Sync now** (refreshes Open-Meteo for all fields).

Fallbacks: if WebGPU is unavailable, Settings → "Demo (fixed example)" gives the same flow with a labelled fixed answer.
`frontend/public/samples/` holds the CC-licensed photos (rust, healthy branch, not-a-plant).

## Live story

1. **Home** — "Start here: Hillside coffee — Needs attention". One field, one action.
2. **Check this field → Use example photo** (or take/choose a real photo). No questions asked.
   "Analysing on this phone": looking at the leaf → checking weather, spread and advice.
3. **Result** (≈5 s): "ON-DEVICE ESTIMATE · not a diagnosis", *Possible coffee leaf rust*, *Hemileia vastatrix*.
   - **What to do**: Today / Next / If it gets worse — every step sourced (HDOA, CTAHR, RAB/Plantwise Rwanda).
   - **What the model saw**: LFM2.5-VL scores, public checkpoint named, device and time shown.
   - **Where to look next**: scouting priority around the plant; switch **Next 24 h / 3 days / 7 days** — wind from the
     synced forecast moves the priority; dashed circle = location uncertainty (50 m for an example field, so 50 m cells).
   - **Weather**: favourable days in the last 14 + next 7 days, compared with 2015–2024 for these dates.
   - **Ask an expert**: message preview → share sheet only after confirmation; nothing sent automatically.
4. **Local language**: Settings → Ikinyarwanda → new check: interface and result in Kinyarwanda, original English
   condition name kept underneath, "machine translation" notice.
5. **Offline**: turn Wi-Fi off (or DevTools → Network → Offline). New check → same result in ~4–5 s from the on-device
   models, cached weather ("Weather updated N h ago") and the in-browser Python engine. Save is automatic.
6. **Monitor**: Fields → Hillside coffee → *Checks in this field* → **Compare the last two checks**.
7. **Honesty**: Settings → "What this version does not do" (public model, uncalibrated scores, machine translation,
   model weather, no upload, native apps use the demo).

## What to say

Not just disease recognition: the phone turns one photo into a locally grounded, offline, multilingual field decision —
where to look next, what to do today, when to ask for help — with every claim sourced and every estimate labelled.
Swapping in the team's fine-tuned Liquid checkpoint is a one-file change (`frontend/src/model/config.ts`).
