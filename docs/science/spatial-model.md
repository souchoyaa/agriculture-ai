# Spatial scouting model and environmental context

Output is **relative scouting priority** (where to look next) plus **weather favourability**. It is not an infection
probability, not a spread forecast, and not validated against field incidence. Code: `backend/app/domain/spatial.py`,
`analysis.build_map`, `risk.py`; parameters: `backend/data/conditions/<condition>.json`.

## 1. Model family selection (by transmission mechanism)

Each condition declares `spatial_model.transmission_family` and `kernel`. Implemented today:

| Condition | Transmission (source) | Family | Kernel |
|---|---|---|---|
| Coffee leaf rust (*Hemileia vastatrix*) | Urediniospores dispersed by wind and rain splash; free water needed for germination (HDOA NPA 20-03; Marino 2026; RAB/Plantwise RW014) | `wind_and_rain_splash` | `anisotropic_exponential` |

Not implemented (would need their own family, never reuse this one silently): vector-borne (insect movement), soil/contact
spread, pest movement. A condition without a declared family gets no map.

## 2. Priority kernel

Local tangent plane around the observation (east `x`, north `y`, metres; equirectangular, valid for a few hundred metres;
refused within 85° of the poles and across ±180°).

For each grid cell centre `c` and each source `s` (the current positive observation plus earlier **positive** device
observations of the same condition within 300 m):

```
d_eff(c, s) = sqrt( (a / (1 + k·[a > 0]))² + b² )      a = Δ·u (along downwind unit vector u),  b = Δ×u (across)
P(c)        = max_s exp( −d_eff(c, s) / L_eff )
P(c)       ← P(c) · Π_q ( 1 − 0.5·exp( −|c − q| / L_eff ) )   for earlier observations q reported clear
```

| Symbol | Meaning | Unit | Value / source |
|---|---|---|---|
| `L` | decay length | m | 40 — **uncalibrated layout assumption** (no fitted kernel for smallholder coffee) |
| `k` | downwind stretch | – | 1.0 — assumption; applied only when wind consistency ≥ 0.3 |
| `u` | downwind direction | – | speed-weighted mean of hourly `wind_direction_10m` over the horizon window (Open-Meteo model data) |
| consistency | resultant length / total speed | 0–1 | < 0.3 → isotropic kernel (wind too variable to orient scouting) |
| 0.5 | clear-observation damping | – | assumption: recently inspected clear plants lower, never remove, priority |

The exponential family is chosen because spore dispersal kernels for rusts are usually leptokurtic; with no fitted
parameters we keep the simplest monotone kernel and expose it as layout guidance only. Fat-tailed kernels (power law)
would put more weight on distant cells; without fitted data that choice cannot be justified either way.

## 3. Positional uncertainty (no false precision)

Every location carries `accuracy_m` (`r`) and `basis` (`device_gps`, `manual_entry`, `field`, `example`).
Unknown accuracy is treated as **field-level, r = 50 m** (`default_position_uncertainty_m`).

```
cell size  = max(20 m, 10·ceil(r / 10))      cells are never finer than the position is known
L_eff      = sqrt(L² + r²)                   kernel broadened by position error (variance addition; exact for
                                             Gaussian kernels, an approximation for the exponential one)
min spacing of scouting points = max(40 m, 2·cell)
r > 250 m  → no grid; limitation "walk the whole plot" (max_position_uncertainty_m)
```

The map draws a dashed circle of radius `r`; limitations state "location known to about r m, so cells are N m".
GPS positions are taken automatically at photo time only when location permission was already granted; typed
coordinates get `r` = half a unit of the last decimal typed (e.g. 2 decimals ≈ 557 m → no grid).

## 4. Time horizons

`map.horizons` holds priorities for 24 h, 72 h and 168 h on the same grid. Only the wind window changes between
horizons (`u` and consistency from the hours in `[observed_at, observed_at + h)`); the UI control
"Next 24 h / 3 days / 7 days" switches between them. Ranked scouting points use the 7-day layer.

## 5. Environmental context (retrospective + prospective)

Hourly Open-Meteo model data, 14 days before the observation and 7 days ahead (synced by the device; offline the last
sync is used and its age shown). A **wet hour** is RH ≥ 90 % (leaf-wetness proxy, assumption) or rain ≥ 0.1 mm; a day is
**favourable** when it has a wet spell ≥ 6 h (Marino 2026) whose mean trapezoidal temperature factor is ≥ 0.5
(zero below 12.5 °C and above 32.5 °C, optimum 21–23 °C; Marino 2026 citing De Jong 1987). Class: fraction of favourable
days < 0.2 low, ≥ 0.5 high (uncalibrated). The 21-day fraction is also compared with the same dates in 2015–2024 ERA5
at the demo point (`climatology.relation`). Latency 4–6 weeks (HDOA) is why recent weather explains infections
visible weeks later, not the lesions seen today.

## 6. Validation status (honest)

- No field-incidence validation of the kernel, its parameters or the priority ranking.
- The favourability heuristic **did not distinguish** epidemic (2008–2011) from low-incidence (1991–1994) years at
  Chinchiná, Colombia (0.936 vs 0.952; saturated in humid zones) — see `docs/backend/model.md`. "High" means weather
  does not limit infection, not that an epidemic is likely.
- History is used conservatively: earlier positives add sources, earlier clear checks dampen priority; no growth or
  spread rate is fitted.

## 7. Limitations

Uncalibrated parameters; gridded model weather (not canopy, not stations); no terrain, shade, cultivar or management
effects; no field boundary (the grid is relative guidance around the observation, not a farm map); single condition
family implemented.
