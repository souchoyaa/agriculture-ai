# Coffee leaf rust model notes

All parameters live in `backend/data/conditions/coffee_leaf_rust.json` with `source_ids`. Nothing here is calibrated against field incidence; outputs are classes/relative scores, never infection probabilities.

## Biology used (sources in `backend/data/sources.json`)
| Fact | Source |
| --- | --- |
| Free water (rain, dew, irrigation) required for germination; infection within 24–48 h of continuous moisture; lesions appear 4–6 weeks later; spread by wind, rain, contact | HDOA NPA 20-03 (2021) |
| Germination prevented < 12.5 °C and > 32.5 °C; optimum 21–23 °C; 6–24 h leaf wetness; latent period shortest at 18–28 °C | Mariño et al. 2026 (review citing de Jong et al. 1987, Kushalappa et al. 1983) |
| First lesions on lowermost leaves, progress upward; orange powder on leaf underside below yellow spots | HDOA NPA, HDOA field guide, CTAHR PD-118 |
| Reduced diurnal thermal amplitude likely shortened latency in 2008–2013 epidemics; resistant cultivars + early warning proposed | Avelino et al. 2015 (CC BY) |
| Fungicides: consult extension, label is the law; no products/doses given by this app | CTAHR PD-118 |

## Weather favourability heuristic
- Hour is **wet** if RH ≥ 90 % (assumed leaf-wetness proxy) or precipitation ≥ 0.1 mm.
- Temperature factor: trapezoid 0 at ≤ 12.5 °C, rising to 1 at 21 °C, 1 to 23 °C, falling to 0 at 32.5 °C (linear ramps are an assumption).
- A day is **favourable** if its longest wet spell ≥ 6 h with mean temperature factor ≥ 0.5.
- Window: 14 days before to 7 days after `observed_at`. Class on fraction of favourable complete days: < 0.2 low, ≥ 0.5 high, else moderate (uncalibrated). Partial coverage → `status: partial`.
- Invariants tested: factor ∈ [0,1], zero at bounds; 5 wet hours not favourable, 6 favourable; cold wet days not favourable; adding humidity never lowers the class.
- Limits: RH proxy over-/under-estimates leaf wetness; 2 m model temperature ≠ canopy temperature; shade, host susceptibility, inoculum and fruit load are ignored. Thermal amplitude (Avelino 2015) not yet used.

## Scouting priority map
- Local tangent-plane grid around the observation (WGS84 output, GeoJSON [lon, lat]).
- priority = max over reported positives of exp(−d_eff / 40 m); d_eff shrinks downwind by factor (1+1) when wind is consistent. Cells near prior "clear" observations × (1 − 0.5·e^(−d/40)).
- Dispersal by wind/rain-splash is documented; the kernel shape and constants are layout assumptions, not fitted dispersal kernels. Purpose: ordering where to look next.

## Measured performance
Full test suite (43 tests incl. HTTP) ≈ 0.4 s on Apple Silicon; one analysis ≈ few ms; demo fixture ≈ 86 KB JSON (121 polygon cells). Python service only — not evidence of on-device mobile deployment.
