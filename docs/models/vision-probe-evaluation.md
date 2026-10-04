# Stock vision checkpoint — probe sanity check (NOT a validation)

Checkpoint: `LiquidAI/LFM2.5-VL-450M-ONNX` (public, not fine-tuned), Transformers.js 4.3.0, WebGPU, headless Chrome on macOS.
Images (Wikimedia Commons, see `frontend/public/samples/ATTRIBUTION.md`): coffee leaf rust, healthy coffee branch, coffee cup (not a plant).
Scores are the model's normalised answer-token probabilities: uncalibrated model belief, not disease probability. n = 3 images: a sanity check only.

| Probe | Rust leaf | Healthy branch | Coffee cup | Verdict |
|---|---|---|---|---|
| yes/no "orange or yellow-orange powdery spots" | 1.00 | 0.05 | 0.07 | **usable** (clear separation) |
| MC subject: leaf / whole plant / not a plant | leaf 1.00 | plant 0.96 | other 0.98 | **usable** as photo gate |
| yes/no cercospora description | 0.98 | 0.47 | 0.63 | not usable (yes-bias) |
| yes/no leaf-miner description | 0.96 | 0.90 | 0.95 | not usable (yes-bias) |
| MC condition (5 options, forward+reversed avg) | rust 0.76 | leaf_miner 0.90 | leaf_miner 0.98 | only rust usable; option content bias |
| MC photo quality (forward+reversed avg) | 0.53/0.47 | 0.54/0.46 | 0.50/0.50 | not usable (chance) |
| MC leaf side | under 0.93 | under 0.74 | under 0.91 | not usable (bias) |

Latency per image (WebGPU): 1.7–3.8 s for 4–8 probes, after a one-time ~770 MB download (cached by the browser).

Decision: with the stock checkpoint the app emits only the `rust` label (score = yes-probability) plus the subject gate.
Other conditions are left to the team's fine-tuned checkpoint (same adapter interface). Low/ambiguous scores make the
backend abstain, and the app asks for a closer photo of one affected leaf instead of guessing.
