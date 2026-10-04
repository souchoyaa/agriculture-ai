# Fine-tuned coffee-leaf model (team fine-tune, GGUF)

Checkpoint: `nathanrchn/coffee-leaf-lfm2.5-vl-450m-GGUF` (`coffee-lfm-tools-Q5_K_M.gguf` + `mmproj-coffee-lfm-tools-Q8_0.gguf`),
fine-tuned from `LiquidAI/LFM2.5-VL-450M`. GGUF only: Transformers.js cannot load it, so the web app reaches it through a
local llama.cpp server. When the server is not reachable, the app falls back to the public ONNX checkpoint in the browser.

## Run

```sh
brew install llama.cpp
for f in coffee-lfm-tools-Q5_K_M.gguf mmproj-coffee-lfm-tools-Q8_0.gguf; do
  curl -L -o $f https://huggingface.co/nathanrchn/coffee-leaf-lfm2.5-vl-450m-GGUF/resolve/main/$f; done
llama-server -m coffee-lfm-tools-Q5_K_M.gguf --mmproj mmproj-coffee-lfm-tools-Q8_0.gguf \
  --image-min-tokens 64 --image-max-tokens 256 --host 127.0.0.1 --port 8090 -c 4096 --jinja
```

The app checks `http://127.0.0.1:8090/health` before each photo (`frontend/src/model/config.ts` → `FINE_TUNED_VISION`).
Open the app from `http://localhost:…` on the same computer.

## What is implemented

Pass 1 of the model's `app_contract.md` only (`frontend/src/model/fineTuned.ts`): photo resized to ≤512 px JPEG q92, exact
system/user prompt, the contract's grammar, temperature 0. Confidence = top-20 first-token probabilities of the 5 condition
labels after `"condition": "`, renormalised. These become the label list the engine already consumes (`miner` → `leaf_miner`;
`phoma` is not in `backend/data/vlm_label_map.json`, so it passes through unrecognised). `usable: false` → retake prompt
(`not_coffee_leaf` → "not a plant", other reasons → "closer leaf").

Not implemented: pass 2 (tool calls), the 5-leaf incidence protocol, and the contract's advisory cards. The app's own
sourced rules engine still writes the advice.

## Observed (sample photos, 4 Oct 2026)

| Photo | Output | Top first-token probability |
|---|---|---|
| `coffee-leaf-rust.jpg` | rust | rust 1.00 |
| `coffee-healthy.jpg` (whole branch, not one leaf) | phoma | phoma 0.97 |
| `coffee-cup-not-plant.jpg` | phoma (usable: true) | phoma 0.74, miner 0.25 |

So it does not reject non-leaf photos and over-predicts phoma on photos unlike its training data. For the demo, use close-up
single-leaf photos.
