"""Turn a canonical observation into a canonical analysis. Independent of HTTP and of model syntax."""
import hashlib
import json
import math
from datetime import date, datetime, timedelta, timezone

from . import climatology, knowledge, risk, spatial, weather

CONTRACT_VERSION = "0.1.0"
KNOWLEDGE_VERSION = "clr-2026-10-04"
PRIOR_RADIUS_M = 300.0


def iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def evidence_score(signals: list[dict], condition: dict) -> tuple[float, list[dict], bool]:
    """Noisy-OR over recognised signals. Returns (score, evidence rows, any specific signal).

    A repeated label is the same symptom, not independent evidence: only its highest-confidence entry
    counts; other entries are kept in the evidence list with `duplicate: true` and no contribution.
    """
    known, aliases = condition["signals"], condition.get("aliases", {})
    canonical = lambda raw: aliases.get(raw.strip().lower(), raw.strip().lower())
    best = {}
    for index, signal in enumerate(signals):
        label = canonical(signal["label"])
        if label not in best or signal["confidence"] > signals[best[label]]["confidence"]:
            best[label] = index
    rows, remaining, specific = [], 1.0, False
    for index, signal in enumerate(signals):
        label = canonical(signal["label"])
        spec = known.get(label)
        row = {"label": signal["label"], "confidence": signal["confidence"], "recognized": spec is not None}
        if label != signal["label"]:
            row["canonical_label"] = label
        if signal.get("origin"):
            row["origin"] = signal["origin"]
        if best[label] != index:
            row.update(duplicate=True, contribution=0.0)
        elif spec:
            contribution = spec["weight"] * signal["confidence"]
            remaining *= 1 - contribution
            specific |= spec["specific"] and signal["confidence"] >= 0.5
            row.update(weight=spec["weight"], specific=spec["specific"], contribution=round(contribution, 3), source_ids=spec["source_ids"])
        rows.append(row)
    return round(1 - remaining, 3), rows, specific


def competing_signals(signals: list[dict], condition: dict) -> tuple[list[dict], float]:
    """Look-alike conditions and 'healthy' signals: never evidence for the candidate, listed for the reviewer."""
    spec = condition.get("differentials", {})
    found, healthy = {}, 0.0
    for signal in signals:
        label = signal["label"].strip().lower()
        if label == spec.get("healthy_signal"):
            healthy = max(healthy, signal["confidence"])
        elif label in spec.get("signals", {}) and signal["confidence"] > found.get(label, {}).get("confidence", -1):
            found[label] = {"signal": label, "condition_id": spec["signals"][label]["condition_id"], "confidence": signal["confidence"],
                            "source_ids": spec["signals"][label]["source_ids"]}
    return sorted(found.values(), key=lambda d: (-d["confidence"], d["signal"])), healthy


def leaf_severity(signals: list[dict], condition: dict) -> dict | None:
    """OIRSA leaf-area class from an optional `affected_leaf_area_pct` on a recognised signal."""
    spec = condition.get("severity")
    values = [s["affected_leaf_area_pct"] for s in signals
              if s["label"].strip().lower() in condition["signals"] and isinstance(s.get("affected_leaf_area_pct"), (int, float))]
    if not spec or not values:
        return None
    pct = max(0.0, min(100.0, max(values)))
    level = next((lv["level"] for lv in spec["levels"] if pct <= lv["max_pct"]), spec["levels"][-1]["level"])
    if pct < spec["levels"][0]["min_pct"]:
        level = 0
    return {"affected_leaf_area_pct": pct, "level": level, "scale": spec["method"], "scope": spec["note"], "source_ids": spec["source_ids"]}


def environment_block(series, notes, observed_at, now) -> dict:
    summary = risk.summarize_period(series, observed_at)
    block = {
        "status": "unavailable" if series is None else series.freshness(now),
        "as_of": iso(series.fetched_at) if series else None,
        "temperature_c": summary["temperature_c"],
        "relative_humidity_pct": summary["relative_humidity_pct"],
        "rainfall_mm": summary["rainfall_mm"],
        "period_hours": 24,
        "period_end": iso(observed_at),
        "aggregation": "temperature/humidity mean and rainfall total over the 24 h before observed_at",
        "covered_hours": summary["covered_hours"],
        "notes": notes,
    }
    if series:
        block.update(origin=series.origin, provider=series.provider, source_id=series.source_id,
                     age_hours=round(series.age_hours(now), 1), grid_distance_km=series.distance_km,
                     data_kind="model output (not station observations)")
    return block


def unsupported(observation, now, t, locale_info) -> dict:
    return base_analysis(observation, now, locale_info) | {
        "status": "unsupported",
        "condition": {"id": "unknown", "label": t("condition.unsupported_crop.label"), "confidence": 0,
                      "uncertainty": t("uncertainty.unsupported_crop", crop=observation["crop"], supported=", ".join(knowledge.supported_crops())),
                      "abstained": True},
        "map": {"status": "unsupported", "type": "FeatureCollection", "features": [], "limitations": "Crop not covered by the knowledge base."},
        "weather_risk": {"status": "unavailable", "class": None, "reason": "unsupported_crop"},
    }


def base_analysis(observation, now, locale_info) -> dict:
    digest = hashlib.sha256((json.dumps(observation, sort_keys=True) + iso(now) + KNOWLEDGE_VERSION).encode()).hexdigest()[:16]
    return {
        "contract_version": CONTRACT_VERSION,
        "id": f"analysis-{digest}",
        "observation_id": observation["id"],
        "data_mode": "demo" if observation["data_mode"] == "demo" else observation["data_mode"],
        "generated_at": iso(now),
        "environment": {"status": "unavailable", "as_of": None, "temperature_c": None, "relative_humidity_pct": None, "rainfall_mm": None},
        "scouting": [], "recommendations": [], "sources": [], "evidence": [],
        "provenance": {"adapter": "agri-backend", "source": "rule-based analysis over adapter observation",
                       "observation_adapter": observation["provenance"]["adapter"], "observation_source": observation["provenance"]["source"],
                       "knowledge_version": KNOWLEDGE_VERSION},
        "offline": {"cached": False, "stale": False, "sync_status": "local_only"},
        "localization": locale_info,
        "review": {"suggested": False, "reasons": [], "requires_user_authorization": True, "auto_contact": False},
    }


def analyze(observation: dict, now: datetime | None = None, allow_network: bool | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    locale, fell_back = knowledge.resolve_locale(observation.get("locale"))
    t = knowledge.Translator(locale)
    locale_info = {"requested": observation.get("locale"), "used": locale, "fallback": fell_back,
                   "catalog_status": t.meta["status"], "reviewed_by_native_speaker": t.meta["reviewed_by_native_speaker"]}
    candidates = knowledge.conditions_for_crop(observation["crop"])
    if not candidates:
        return unsupported(observation, now, t, locale_info)

    # Score every condition for this crop; one condition today, structure allows more.
    scored = sorted(((evidence_score(observation["signals"], c), c) for c in candidates), key=lambda x: -x[0][0])
    (score, evidence, specific), condition = scored[0]
    em, wm, sm = condition["evidence_model"], condition["weather_model"], condition["spatial_model"]
    competing, healthy = competing_signals(observation["signals"], condition)
    block_at = condition.get("differentials", {}).get("block_supported_at_or_above", 0.5)
    blocked = healthy >= block_at or any(d["confidence"] >= block_at for d in competing)
    abstained = score < em["abstain_below"]
    supported = (not abstained and not blocked and score >= em["supported_at_or_above"]
                 and (specific or not em["supported_requires_specific_signal"]))
    status = "supported" if supported else "needs_review"
    would_support = score >= em["supported_at_or_above"] and (specific or not em["supported_requires_specific_signal"])
    specific_reported = any(row.get("specific") and not row.get("duplicate") for row in evidence)
    uncertainty_key = ("uncertainty.abstain" if abstained else "uncertainty.supported" if would_support
                       else "uncertainty.specific_low_certainty" if specific_reported else "uncertainty.needs_review")
    uncertainty = t(uncertainty_key, score=f"{score:.2f}")
    listed = [d for d in competing if d["confidence"] >= 0.3]
    for d in listed:
        d["label"] = t(f"differential.{d['condition_id']}")
    if listed:
        uncertainty += " " + t("uncertainty.differential", names=", ".join(d["label"] for d in listed))
    if healthy >= block_at:
        uncertainty += " " + t("uncertainty.healthy")
    for row in evidence:
        label = row["label"].strip().lower()
        if label in condition.get("differentials", {}).get("signals", {}) or label == condition.get("differentials", {}).get("healthy_signal"):
            row["role"] = "differential"

    result = base_analysis(observation, now, locale_info)
    result["status"] = status
    result["evidence"] = evidence
    result["condition"] = {
        "id": "undetermined" if abstained else condition["id"],
        "label": t("condition.undetermined.label" if abstained else condition["label_key"]),
        "confidence": score,
        "confidence_kind": "uncalibrated evidence score from image signals; not a probability of infection",
        "uncertainty": uncertainty,
        "abstained": abstained,
        "differentials": listed,
        "support_blocked_by_differential": blocked and not abstained,
        "severity": None if abstained else leaf_severity(observation["signals"], condition),
        "candidate_id": condition["id"],
        "pathogen": condition["pathogen"],
    }
    used_sources = {s for row in evidence for s in row.get("source_ids", [])}
    used_sources |= {s for d in listed for s in d["source_ids"]}
    if result["condition"]["severity"]:
        used_sources |= set(result["condition"]["severity"]["source_ids"])

    # Environment and weather favourability (needs location).
    location = observation.get("location")
    observed_at = weather.parse_time(observation["observed_at"])
    series, notes = (weather.get_weather(location["latitude"], location["longitude"], now, allow_network) if location else (None, ["no_location"]))
    result["environment"] = environment_block(series, notes, observed_at, now)
    assessment = risk.assess(series, observed_at, wm)
    risk_class = assessment["class"]
    complete_dates = [date.fromisoformat(d["date"]) for d in assessment["days"] if d["complete"]]
    baseline = climatology.compare(climatology.load(location["latitude"], location["longitude"]) if location else None,
                                   wm, complete_dates, assessment["favourable_day_fraction"])
    if baseline["status"] == "available":
        baseline["summary"] = t(f"risk.relation.{baseline['relation']}")
        baseline["caveat"] = t("risk.climatology_caveat")
        used_sources |= set(baseline["baseline_source"]["source_ids"])
    result["weather_risk"] = {
        **assessment,
        "condition_id": condition["id"],
        "summary": t(f"risk.class.{risk_class}") if risk_class else t("risk.unavailable"),
        "reference_time": iso(observed_at),
        "history_days": wm["history_days"], "forecast_days": wm["forecast_days"],
        "method": wm["description"],
        "calibrated": False,
        "interpretation": "Infection-favourable weather suitability class; not a probability of infection or disease.",
        "parameters": {k: wm[k] for k in ("temperature_c", "min_wet_hours", "wet_rh_pct", "wet_precip_mm", "min_temp_factor", "classes")},
        "latent_period_days": wm["latent_period_days"],
        "climatology": baseline,
        "limitations": [
            "Leaf wetness approximated from relative humidity/precipitation of gridded model data; canopy conditions differ.",
            "Saturates in persistently humid zones (>0.9 favourable days in ERA5 for Chinchiná, Colombia, in both epidemic and non-epidemic years): 'high' means weather is not limiting, not that an epidemic is likely.",
            "Ignores inoculum, host susceptibility, shade, fruit load and management.",
        ],
        "validation": "Consistency check only (docs/backend/model.md); not validated against incidence data.",
    }
    if series:
        used_sources |= {series.source_id, *wm["temperature_c"]["source_ids"], *wm["min_wet_hours"]["source_ids"]}
        result["offline"] = {"cached": series.origin == "cached", "stale": result["environment"]["status"] != "fresh", "sync_status": "local_only"}
    else:
        result["offline"] = {"cached": False, "stale": True, "sync_status": "local_only"}

    # Spatial scouting priority (needs location and a suspected condition).
    result["map"], points = build_map(observation, condition, sm, series, observed_at, abstained, t)
    if points:
        used_sources |= set(sm["dispersal_source_ids"])

    # Regional guidance applies only inside its (approximate) region; never for missing locations.
    regions = {rid: spec for rid, spec in condition.get("regions", {}).items()
               if location and spec["bbox"][0] <= location["longitude"] <= spec["bbox"][2]
               and spec["bbox"][1] <= location["latitude"] <= spec["bbox"][3]}

    def regional_scope(region_id, year):
        return {"region_id": region_id, "match": regions[region_id]["match"], "source_year": year,
                "note": t(f"regional.match_note.{region_id}")}

    # Scouting and recommendations.
    if abstained:
        result["scouting"] = [{"id": "photograph_both_leaf_surfaces", "text": t("scouting.photograph_both_leaf_surfaces"),
                               "source_ids": ["hdoa_npa_20_03_2021"]}]
        recs = [("retake_photo", [], None), ("seek_local_review", [], None)]
        used_sources.add("hdoa_npa_20_03_2021")
    else:
        result["scouting"] = [{"id": s["id"], "text": t(f"scouting.{s['id']}"), "source_ids": s["source_ids"]}
                              for s in condition["scouting"] if s["id"] != "walk_priority_points" or points] + points
        recs = [(r["id"], r["source_ids"], regional_scope(r["region"], r["source_year"]) if r.get("region") else None)
                for r in condition["recommendations"] if not r.get("region") or r["region"] in regions]
        for _, ids, _ in recs:
            used_sources |= set(ids)
        for s in condition["scouting"]:
            used_sources |= set(s["source_ids"])
    result["recommendations"] = [{"id": rid, "text": t(f"recommendation.{rid}"), "source_ids": ids, **({"regional_scope": scope} if scope else {})}
                                 for rid, ids, scope in recs]

    # Human review is proposed, never sent.
    reasons = []
    if not abstained:
        reasons.append("supported" if supported else ("specific_low_certainty" if uncertainty_key == "uncertainty.specific_low_certainty" else "needs_review"))
        if listed:
            reasons.append("differential")
        if risk_class == "high":
            reasons.append("high_weather")
    result["review"] = {"suggested": bool(reasons), "reasons": [{"id": r, "text": t(f"review.reason.{r}")} for r in reasons],
                        "requires_user_authorization": True, "auto_contact": False}

    scope = {k: v for k, v in condition["guidance_scope"].items() if k != "local_check_ids"}
    scope["local_checks"] = [{"id": cid, "text": t(f"local_check.{cid}")} for cid in condition["guidance_scope"]["local_check_ids"]]
    scope["local_check_required"] = [c["text"] for c in scope["local_checks"]]  # localized; ids in local_checks
    scope["applicability_locale"] = "en"  # technical note, not translated
    result["guidance_scope"] = scope
    result["regional_context"] = [
        {"id": note["id"], "region": note["region"], "text": t(f"regional.{note['id']}"), "source_ids": note["source_ids"],
         "regional_scope": regional_scope(note["region_id"], note["source_year"])}
        for note in condition.get("regional_notes", []) if note["region_id"] in regions
    ]
    for note in result["regional_context"]:
        used_sources |= set(note["source_ids"])
    result["sources"] = knowledge.cite(used_sources)
    result["provenance"]["components"] = [
        {"component": "observation", "origin": observation["data_mode"], "adapter": observation["provenance"]["adapter"],
         **({"source": observation["provenance"]["source"]} if "source" in observation["provenance"] else {})},
        {"component": "evidence_model", "origin": "agent_authored_heuristic", "expert_reviewed": False, "calibrated": False},
        {"component": "weather", "origin": series.origin if series else "unavailable", "provider": series.provider if series else None},
        {"component": "weather_risk", "origin": "literature_parameterised_heuristic", "calibrated": False},
        {"component": "scouting_map", "origin": "layout_heuristic", "calibrated": False},
        {"component": "guidance", "origin": "curated_extension_sources", "expert_reviewed": False},
    ]
    return result


def position_uncertainty(location: dict, sm: dict) -> tuple[float, str]:
    """Horizontal position uncertainty (m) and its basis. Unknown accuracy assumes a field-level position."""
    acc = location.get("accuracy_m")
    if isinstance(acc, (int, float)) and math.isfinite(acc) and acc > 0:
        return float(acc), str(location.get("basis", "reported"))
    return float(sm["default_position_uncertainty_m"]), "assumed_field_level"


def horizon_wind(series, observed_at, hours: int, min_consistency: float):
    if not series:
        return None, None
    window = [h for h in series.hours if observed_at <= h.time < observed_at + timedelta(hours=hours)]
    wind = weather.mean_wind_from(window)
    return wind, (wind if wind and wind[1] >= min_consistency else None)


def build_map(observation, condition, sm, series, observed_at, abstained, t) -> tuple[dict, list[dict]]:
    location = observation.get("location")
    if not location:
        return {"status": "unavailable", "type": "FeatureCollection", "features": [], "limitations": t("map.no_location")}, []
    if abstained:
        return {"status": "unavailable", "type": "FeatureCollection", "features": [],
                "limitations": "No suspected condition; scouting priority not computed."}, []
    if not sm.get("transmission_family") or not sm.get("kernel"):
        # A dispersal kernel is only meaningful for the transmission mechanism it was chosen for.
        return {"status": "unsupported", "type": "FeatureCollection", "features": [],
                "limitations": "No spatial model declared for this condition's transmission mechanism."}, []
    lat0, lon0 = location["latitude"], location["longitude"]
    radius, basis = position_uncertainty(location, sm)
    if radius > sm["max_position_uncertainty_m"]:
        return {"status": "unavailable", "type": "FeatureCollection", "features": [],
                "limitations": t("map.location_too_coarse", radius_m=round(radius)), "position_uncertainty_m": round(radius), "location_basis": basis}, []
    cell_m, decay_m = spatial.effective_geometry(sm, radius)
    geo = {**sm, "effective_cell_size_m": cell_m, "effective_decay_length_m": decay_m}
    if not spatial.grid_supported(lat0, lon0, cell_m * (sm["half_width_cells"] + 0.5)):
        return {"status": "unavailable", "type": "FeatureCollection", "features": [],
                "limitations": "Local grid unsupported within 85° of a pole or across the ±180° meridian."}, []
    near = lambda p: math.hypot(*spatial.to_local(lat0, lon0, p["latitude"], p["longitude"])) <= PRIOR_RADIUS_M
    priors = [p for p in observation.get("prior_observations", []) if p.get("condition_id") == condition["id"] and near(p)]
    sources = [location] + [p for p in priors if p.get("present")]
    cleared = [p for p in priors if p.get("present") is False]

    # Time horizons: same kernel, wind averaged over each forecast window (direction can change).
    default_h = 24 * condition["weather_model"]["forecast_days"]
    horizons = []
    for h in sorted(set(sm.get("horizons_h", [default_h]) + [default_h])):
        wind, wind_used = horizon_wind(series, observed_at, h, sm.get("min_wind_consistency", 0.3))
        cells = spatial.priority_grid((lat0, lon0), sources, cleared, geo, wind_used[0] if wind_used else None)
        horizons.append({"hours": h, "cells": cells, "wind": wind, "wind_used": wind_used})
    main = next(x for x in horizons if x["hours"] == default_h)
    cells, wind, wind_used = main["cells"], main["wind"], main["wind_used"]

    features = [{"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [spatial.cell_polygon(lat0, lon0, c["east_m"], c["north_m"], cell_m)]},
                 "properties": {"kind": "scouting_priority_cell", "priority": c["priority"], "row": c["row"], "col": c["col"]}}
                for c in cells]
    features.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [spatial.circle_polygon(lat0, lon0, radius)]},
                     "properties": {"kind": "position_uncertainty", "radius_m": round(radius), "basis": basis,
                                    "label": t("map.label.position_uncertainty", radius_m=round(radius))}})
    features += [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [p["longitude"], p["latitude"]]},
                  "properties": {"kind": "reported_observation", "present": p is location or bool(p.get("present")),
                                 "label": t("map.label.current" if p is location else ("map.label.prior_present" if p.get("present") else "map.label.prior_clear")),
                                 "observation_id": observation["id"] if p is location else p.get("id"), "current": p is location}}
                 for p in [location] + priors]
    points = []
    min_sep = max(40.0, 2 * cell_m)
    for rank, cell in enumerate(spatial.pick_points(cells, min_separation_m=min_sep), start=1):
        lat, lon = spatial.to_geo(lat0, lon0, cell["east_m"], cell["north_m"])
        distance = round(math.hypot(cell["east_m"], cell["north_m"]))
        text = (t("scouting.point_origin", rank=rank) if distance < cell_m
                else t("scouting.point", rank=rank, distance_m=distance, bearing=t(f"bearing.{spatial.bearing_label(cell['east_m'], cell['north_m'])}")))
        point = {"id": f"scout_point_{rank}", "text": text, "rank": rank, "priority": cell["priority"],
                 "location": {"latitude": round(lat, 7), "longitude": round(lon, 7)}, "distance_m": distance, "source_ids": []}
        points.append(point)
        features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 7), round(lat, 7)]},
                         "properties": {"kind": "scouting_point", "rank": rank, "label": t("map.label.scouting_point", rank=rank), "priority": cell["priority"], "scouting_id": point["id"]}})
    precise = radius <= sm["cell_size_m"]
    return {
        "status": "available", "type": "FeatureCollection", "features": features,
        "limitations": t("map.limitations") if precise else t("map.limitations_uncertain", radius_m=round(radius), cell_m=round(cell_m)),
        "value_kind": "relative_scouting_priority", "scale": [0, 1], "calibrated": False,
        "crs": "EPSG:4326", "cell_size_m": cell_m, "decay_length_m": round(decay_m, 1),
        "position_uncertainty_m": round(radius), "location_basis": basis,
        "transmission_family": sm.get("transmission_family"), "kernel": sm.get("kernel"),
        "horizon_days": condition["weather_model"]["forecast_days"],
        "wind": {"used": wind_used is not None, "mean_from_deg": round(wind[0]) if wind else None,
                 "consistency": round(wind[1], 2) if wind else None, "stretch": sm["downwind_stretch"]},
        # Same grid geometry as the cell features (row-major); priorities per forecast window.
        "horizons": [{"hours": x["hours"], "priorities": [c["priority"] for c in x["cells"]],
                      "wind_from_deg": round(x["wind"][0]) if x["wind"] else None,
                      "wind_consistency": round(x["wind"][1], 2) if x["wind"] else None, "wind_used": x["wind_used"] is not None}
                     for x in horizons],
        "method": sm["description"],
        "prior_observations_used": len(priors),
    }, points
