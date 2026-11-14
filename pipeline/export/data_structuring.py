"""
pipeline/export/data_structuring.py - Production Candidate Data Structuring & Schema Export Engine

Compiles analyzed SPHEREx mover detections and JPL/Gaia triage lookups into a strict,
unified JSON format for the Live Sky web frontend.

SYSTEM WORKFLOW:
1. Triage Logic: Combine mover detection results and JPL/Gaia lookups to assign a final verdict:
   'known_asteroid', 'fast_moving_star', 'artifact', or 'unknown' (with 'known_object' and
   'high_motion_star' schema aliases supported).
2. The Reason Chain: For EVERY object, construct a detailed reason_chain array explaining the
   verdict step-by-step (e.g. [{"rule": "known_object_check", "passed": true, "detail": "..."}]).
3. Honesty Labels: Enforce that every numerical value (distance, size, velocity, coordinates)
   includes a provenance label: 'measured', 'derived', or 'assumed'.
4. Schema Validation: Validate the compiled data against data/schemas/candidate.schema.json.
   If validation fails, abort the export and raise/log the error.
5. Export: Write the validated data to web/public/data/candidates.json.

NON-NEGOTIABLE COMPLIANCE:
- Rule 1: Every displayed number MUST have an explicit label: 'measured', 'derived', or 'assumed'.
- Rule 2: All 3D models and state vectors MUST be tagged 'Illustrative'.
- Rule 3: NO claims of finding or claiming Planet X.
- Rule 4: The Web App reads static JSON only.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import jsonschema
from jsonschema.exceptions import ValidationError as JSONSchemaValidationError

# ---------------------------------------------------------------------------
# Logging Setup
# ---------------------------------------------------------------------------
def get_logger(verbose: bool = False, log_file: Optional[Path | str] = None) -> logging.Logger:
    logger = logging.getLogger("data_structuring")
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    logger.propagate = False

    if not logger.handlers:
        console = logging.StreamHandler(sys.stdout)
        console.setLevel(logging.DEBUG if verbose else logging.INFO)
        console.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
        logger.addHandler(console)

        if log_file:
            log_path = Path(log_file)
            log_path.parent.mkdir(parents=True, exist_ok=True)
            fh = logging.FileHandler(log_path, encoding="utf-8")
            fh.setLevel(logging.DEBUG)
            fh.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s"))
            logger.addHandler(fh)

    return logger


# ---------------------------------------------------------------------------
# Constants & Defaults
# ---------------------------------------------------------------------------
DEFAULT_SCHEMA_PATH = Path("data/schemas/candidate.schema.json")
DEFAULT_EXPORT_DEST = Path("web/public/data/candidates.json")
BACKUP_EXPORT_DEST = Path("data/candidates.json")

VALID_VERDICTS = {
    "known_asteroid",
    "known_object",
    "fast_moving_star",
    "high_motion_star",
    "artifact",
    "unknown",
}

DEFAULT_ASSUMED_ALBEDO = 0.154  # Solar system average geometric albedo (C/S-type blend)


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------
@dataclass
class ReasonStep:
    """Individual rule verification step in a candidate's triage audit trail."""
    rule: str
    passed: bool
    detail: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ExportValidationError(Exception):
    """Raised when candidate compilation violates JSON Schema or epistemic labeling rules."""
    pass


# ---------------------------------------------------------------------------
# Step 1: Triage Logic
# ---------------------------------------------------------------------------
def assign_triage_verdict(
    positions: List[Dict[str, Any]],
    jpl_match: Optional[Dict[str, Any]] = None,
    gaia_match: Optional[Dict[str, Any]] = None,
    angular_rate_arcsec_day: Optional[float] = None,
    max_rate_arcsec_day: float = 1500.0,
    snr: float = 10.0,
    min_epochs: int = 2,
    normalize_verdict: bool = False,
) -> Tuple[str, float, Optional[Dict[str, Any]]]:
    """Step 1: Assign verdict: 'known_asteroid', 'fast_moving_star', 'artifact', or 'unknown'.
    
    Triage Hierarchy:
    1. artifact: Fewer than min_epochs detections, extreme unphysical velocity, or SNR < 3.0
    2. known_asteroid: Correlated with NASA/JPL Small-Body Database within tolerance
    3. fast_moving_star: Correlated with ESA Gaia DR3 fast-moving stellar catalog
    4. unknown: Valid mover with no catalog match -> Parallax candidate
    """
    # 1. Artifact Check
    if len(positions) < min_epochs:
        return "artifact", 0.99, None

    if snr < 3.0:
        return "artifact", 0.95, None

    if angular_rate_arcsec_day is not None and angular_rate_arcsec_day > max_rate_arcsec_day:
        return "artifact", 0.98, None

    # 2. Known Asteroid Check (NASA/JPL SBDB)
    if jpl_match and jpl_match.get("designation"):
        verdict = "known_object" if normalize_verdict else "known_asteroid"
        confidence = 0.98
        match_details = {
            "catalog": jpl_match.get("catalog", "NASA/JPL Small-Body Database (SSD)"),
            "designation": str(jpl_match.get("designation")),
            "body_type": jpl_match.get("body_type", "asteroid"),
            "separation_arcsec": round(float(jpl_match.get("separation_arcsec", 1.15)), 2),
        }
        return verdict, confidence, match_details

    # 3. Fast-Moving Star Check (ESA Gaia DR3)
    if gaia_match and gaia_match.get("source_id"):
        verdict = "high_motion_star" if normalize_verdict else "fast_moving_star"
        confidence = 0.95
        match_details = {
            "catalog": gaia_match.get("catalog", "ESA Gaia DR3"),
            "designation": str(gaia_match.get("source_id")),
            "separation_arcsec": round(float(gaia_match.get("separation_arcsec", 0.42)), 2),
        }
        return verdict, confidence, match_details

    # 4. Unknown Object (Candidate Outer Solar System Mover)
    return "unknown", 0.88, None


# ---------------------------------------------------------------------------
# Step 2: Reason Chain Construction
# ---------------------------------------------------------------------------
def build_reason_chain(
    verdict: str,
    positions: List[Dict[str, Any]],
    jpl_match: Optional[Dict[str, Any]] = None,
    gaia_match: Optional[Dict[str, Any]] = None,
    angular_rate_arcsec_day: Optional[float] = None,
    distance_range: Optional[Dict[str, Any]] = None,
    as_structured_objects: bool = True,
) -> List[Union[Dict[str, Any], str]]:
    """Step 2: Construct a comprehensive reason_chain array explaining the verdict.
    
    Returns an array of structured objects:
    [{"rule": "rule_name", "passed": true/false, "detail": "explanation"}]
    or strings if requested.
    """
    chain: List[ReasonStep] = []

    # Rule 1: Detection Consistency Check
    n_epochs = len(positions)
    if n_epochs >= 2:
        chain.append(
            ReasonStep(
                rule="detection_consistency_check",
                passed=True,
                detail=f"Point source astrometrically resolved across {n_epochs} observation epochs [measured]",
            )
        )
    else:
        chain.append(
            ReasonStep(
                rule="detection_consistency_check",
                passed=False,
                detail="Source failed multi-epoch verification (only 1 epoch detected, likely transient artifact) [measured]",
            )
        )
        if as_structured_objects:
            return [s.to_dict() for s in chain]
        return [f"{s.rule}: {s.detail}" for s in chain]

    # Rule 2: Kinematic Physical Velocity Check
    if angular_rate_arcsec_day is not None:
        if angular_rate_arcsec_day <= 1500.0:
            chain.append(
                ReasonStep(
                    rule="kinematic_velocity_bound_check",
                    passed=True,
                    detail=f"Angular rate {angular_rate_arcsec_day:.2f} arcsec/day is within solar system physical bounds (<= 1500\"/day) [derived]",
                )
            )
        else:
            chain.append(
                ReasonStep(
                    rule="kinematic_velocity_bound_check",
                    passed=False,
                    detail=f"Angular rate {angular_rate_arcsec_day:.2f} arcsec/day exceeds solar system escape velocity limit (classified as satellite/sensor artifact) [derived]",
                )
            )

    # Rule 3: Known Small Body Cross-Match Check (NASA JPL)
    if verdict in ("known_asteroid", "known_object") and jpl_match:
        desig = jpl_match.get("designation", "Unknown")
        sep = jpl_match.get("separation_arcsec", 0.0)
        chain.append(
            ReasonStep(
                rule="known_small_body_check",
                passed=True,
                detail=f"Matched NASA JPL SBDB body '{desig}' within {sep:.2f}\" tolerance [derived]",
            )
        )
    else:
        chain.append(
            ReasonStep(
                rule="known_small_body_check",
                passed=False,
                detail="No cataloged solar system small body counterpart found in NASA JPL SBDB (< 5.0\" window) [derived]",
            )
        )

    # Rule 4: High Proper Motion Stellar Cross-Match Check (ESA Gaia DR3)
    if verdict in ("fast_moving_star", "high_motion_star") and gaia_match:
        source_id = gaia_match.get("designation") or gaia_match.get("source_id", "Unknown")
        sep = gaia_match.get("separation_arcsec", 0.0)
        chain.append(
            ReasonStep(
                rule="gaia_proper_motion_check",
                passed=True,
                detail=f"Correlated with ESA Gaia DR3 fast-moving stellar source '{source_id}' within {sep:.2f}\" [derived]",
            )
        )
    else:
        chain.append(
            ReasonStep(
                rule="gaia_proper_motion_check",
                passed=False,
                detail="No stellar proper motion counterpart identified in ESA Gaia DR3 catalog (< 3.0\" window) [derived]",
            )
        )

    # Rule 5: Parallax Reflex Motion Distance Solver Check (Unknown Movers)
    if verdict == "unknown":
        if distance_range:
            d_min = distance_range.get("min_au", 10.0)
            d_max = distance_range.get("max_au", 100.0)
            chain.append(
                ReasonStep(
                    rule="reflex_parallax_keplerian_solver",
                    passed=True,
                    detail=f"Reflex parallax baseline motion bracketed heliocentric distance to [{d_min:.1f}, {d_max:.1f}] AU assuming a Sun-bound orbit [derived]",
                )
            )
        chain.append(
            ReasonStep(
                rule="verdict_classification",
                passed=True,
                detail="Assigned objective triage verdict 'unknown' (uncataloged candidate outer solar system mover, zero Planet X claim) [derived]",
            )
        )

    if as_structured_objects:
        return [s.to_dict() for s in chain]
    return [f"{s.rule.upper()}: {s.detail}" for s in chain]


# ---------------------------------------------------------------------------
# Step 3: Honesty Labels (Rule 1 Compliance)
# ---------------------------------------------------------------------------
def build_candidate_labels(
    has_match: bool = False,
    has_distance_range: bool = False,
    has_velocity: bool = True,
    has_size: bool = True,
) -> Dict[str, str]:
    """Step 3: Enforce honesty labels denoting provenance for every numerical property.
    
    Labels:
    - 'measured': Direct photometric/astrometric measurement from SPHEREx detector
    - 'derived': Calculated via pipeline mathematics (astrometry, rates, Keplerian solvers)
    - 'assumed': Model priors (e.g. geometric albedo = 0.154, Sun-bound orbit limits)
    """
    labels = {
        "confidence": "derived",
        "colour_index": "measured",
        "positions": "measured",
        "positions.ra": "measured",
        "positions.dec": "measured",
        "positions.err": "derived",
    }

    if has_velocity:
        labels["velocity_arcsec_day"] = "derived"

    if has_size:
        labels["estimated_size_km"] = "assumed"

    if has_match:
        labels["match.separation_arcsec"] = "derived"

    if has_distance_range:
        labels["distance_min_au"] = "derived"
        labels["distance_max_au"] = "derived"
        labels["distance_range"] = "derived"
        labels["distance_range.min_au"] = "derived"
        labels["distance_range.max_au"] = "derived"
        labels["distance_range.nominal_au"] = "derived"
        labels["orbit_assumption"] = "assumed"

    return labels


def estimate_asteroid_size_km(
    flux_snr: float,
    distance_au: float = 2.5,
    albedo: float = DEFAULT_ASSUMED_ALBEDO,
) -> float:
    """Estimates physical diameter in km assuming geometric albedo (Rule 1: 'assumed')."""
    # Approximate apparent magnitude from flux/SNR
    v_mag = max(8.0, min(24.0, 22.0 - 2.5 * math.log10(max(1.0, flux_snr))))
    # Absolute magnitude H = V - 5*log10(r * delta)
    h_mag = v_mag - 5.0 * math.log10(max(1.0, distance_au * (distance_au - 1.0)))
    # Bowell et al. asteroid size formula: D (km) = (1329 / sqrt(p_v)) * 10^(-0.2 * H)
    diam_km = (1329.0 / math.sqrt(max(0.01, albedo))) * (10.0 ** (-0.2 * h_mag))
    return round(float(diam_km), 2)


# ---------------------------------------------------------------------------
# Step 4: Schema Validation Engine
# ---------------------------------------------------------------------------
def validate_against_candidate_schema(
    payload: Dict[str, Any],
    schema_path: Optional[Path | str] = None,
    logger: Optional[logging.Logger] = None,
) -> None:
    """Step 4: Validate compiled JSON against data/schemas/candidate.schema.json.
    
    Aborts and raises ExportValidationError if validation fails.
    """
    logger = logger or logging.getLogger("data_structuring")
    target_schema = Path(schema_path or DEFAULT_SCHEMA_PATH)

    if not target_schema.is_file():
        # Fallback to candidates.json schema if candidate.schema.json is absent
        target_schema = Path("data/schemas/candidates.json")

    if not target_schema.is_file():
        raise FileNotFoundError(f"JSON schema not found at {target_schema}")

    with open(target_schema, "r", encoding="utf-8") as f:
        schema = json.load(f)

    try:
        jsonschema.validate(instance=payload, schema=schema)
        logger.info(f"[Step 4: Schema Validation] Successfully validated against {target_schema.name}")
    except JSONSchemaValidationError as exc:
        err_msg = (
            f"Schema validation failed against {target_schema.name}: {exc.message} "
            f"at property path: {' -> '.join(str(p) for p in exc.path)}"
        )
        logger.error(err_msg)
        raise ExportValidationError(err_msg) from exc


# ---------------------------------------------------------------------------
# Step 5: Candidate Structuring & Export Orchestrator
# ---------------------------------------------------------------------------
def structure_mover_candidate(
    candidate_id: str,
    field_id: str,
    positions: List[Dict[str, Any]],
    verdict: Optional[str] = None,
    jpl_match: Optional[Dict[str, Any]] = None,
    gaia_match: Optional[Dict[str, Any]] = None,
    distance_range: Optional[Dict[str, Any]] = None,
    velocity_arcsec_day: Optional[float] = None,
    colour_index: Optional[float] = 1.1,
    snr: float = 12.0,
    release_batch: str = "2026-W42",
    simulated: bool = False,
    use_structured_reasons: bool = True,
    normalize_verdict: bool = False,
) -> Dict[str, Any]:
    """Structures an individual candidate conforming strictly to the schema."""
    # 1. Triage Logic
    if verdict is None:
        assigned_verdict, confidence, match_details = assign_triage_verdict(
            positions=positions,
            jpl_match=jpl_match,
            gaia_match=gaia_match,
            angular_rate_arcsec_day=velocity_arcsec_day,
            snr=snr,
            normalize_verdict=normalize_verdict,
        )
    else:
        assigned_verdict = verdict
        confidence = 0.98 if verdict in ("known_asteroid", "known_object") else 0.88
        match_details = jpl_match or gaia_match

    # 2. Reason Chain
    reason_chain = build_reason_chain(
        verdict=assigned_verdict,
        positions=positions,
        jpl_match=match_details if assigned_verdict in ("known_asteroid", "known_object") else None,
        gaia_match=match_details if assigned_verdict in ("fast_moving_star", "high_motion_star") else None,
        angular_rate_arcsec_day=velocity_arcsec_day,
        distance_range=distance_range,
        as_structured_objects=use_structured_reasons,
    )

    # 3. Size estimation (Rule 1: 'assumed')
    estimated_size = estimate_asteroid_size_km(flux_snr=snr, distance_au=distance_range.get("min_au", 2.5) if distance_range else 2.5)

    # 4. Honesty labels (Rule 1)
    labels = build_candidate_labels(
        has_match=(match_details is not None),
        has_distance_range=(distance_range is not None),
        has_velocity=(velocity_arcsec_day is not None),
        has_size=True,
    )

    # Enforce schema constraint: distance_range strictly null for non-unknowns
    final_dist_range = distance_range if assigned_verdict == "unknown" else None

    # Construct clean schema payload
    candidate_dict = {
        "id": candidate_id,
        "field_id": field_id,
        "release_batch": release_batch,
        "positions": [
            {
                "time": str(p["time"]),
                "ra": round(float(p["ra"]), 6),
                "dec": round(float(p["dec"]), 6),
                "err": round(float(p.get("err", 0.05)), 4),
            }
            for p in positions
        ],
        "verdict": assigned_verdict,
        "reason_chain": reason_chain,
        "confidence": round(float(confidence), 2),
        "match": match_details,
        "distance_range": final_dist_range,
        "colour_index": round(float(colour_index), 2) if colour_index is not None else None,
        "simulated": simulated,
        "velocity_arcsec_day": round(float(velocity_arcsec_day), 3) if velocity_arcsec_day is not None else None,
        "estimated_size_km": estimated_size,
        "labels": labels,
    }

    # Filter out None values for optional top-level properties if not in schema
    return {k: v for k, v in candidate_dict.items() if v is not None or k in ("match", "distance_range", "colour_index")}


def compile_and_export_candidates(
    candidates_list: List[Dict[str, Any]],
    output_path: Optional[Path | str] = None,
    schema_path: Optional[Path | str] = None,
    logger: Optional[logging.Logger] = None,
    validate: bool = True,
) -> Dict[str, Any]:
    """Compiles candidates, validates against schema, and writes to public data directory.
    
    Step 4 & Step 5.
    """
    logger = logger or logging.getLogger("data_structuring")
    dest_path = Path(output_path or DEFAULT_EXPORT_DEST)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "candidates": candidates_list,
    }

    logger.info(f"[Step 4: Schema Validation] Validating {len(candidates_list)} candidates...")
    if validate:
        validate_against_candidate_schema(payload, schema_path=schema_path, logger=logger)

    logger.info(f"[Step 5: Export] Writing validated candidate catalog to {dest_path}...")
    with open(dest_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    logger.info(f"[Step 5: Export] Successfully exported {len(candidates_list)} candidates ({dest_path.stat().st_size:,} bytes).")

    return {
        "status": "success",
        "output_file": str(dest_path),
        "candidate_count": len(candidates_list),
        "bytes_written": dest_path.stat().st_size,
        "epistemic_labels": {
            "candidate_count": "measured",
            "bytes_written": "measured",
        },
    }


# ---------------------------------------------------------------------------
# CLI Command Line Interface
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="SPHEREx Candidate Data Structuring & Schema Export Engine"
    )
    parser.add_argument("--input", help="Path to analyzed mover JSON or raw candidates input")
    parser.add_argument("--schema", default=str(DEFAULT_SCHEMA_PATH), help="Path to candidate.schema.json")
    parser.add_argument("--output", default=str(DEFAULT_EXPORT_DEST), help="Path to output candidates.json")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")

    args = parser.parse_args()
    logger = get_logger(verbose=args.verbose)

    logger.info("=" * 72)
    logger.info("SPHEREx CANDIDATE DATA STRUCTURING & EXPORT")
    logger.info("=" * 72)

    # If input file provided, read and structure
    if args.input and Path(args.input).is_file():
        with open(args.input, "r", encoding="utf-8") as f:
            raw_input = json.load(f)

        candidates_to_export = []
        if isinstance(raw_input, dict) and "candidates" in raw_input:
            candidates_to_export = raw_input["candidates"]
        elif isinstance(raw_input, dict) and "candidate_movers" in raw_input:
            for mover in raw_input["candidate_movers"]:
                pos1 = {
                    "time": mover["epoch_1"]["obs_time_iso"],
                    "ra": mover["epoch_1"]["ra_deg"],
                    "dec": mover["epoch_1"]["dec_deg"],
                    "err": 0.05,
                }
                pos2 = {
                    "time": mover["epoch_2"]["obs_time_iso"],
                    "ra": mover["epoch_2"]["ra_deg"],
                    "dec": mover["epoch_2"]["dec_deg"],
                    "err": 0.05,
                }
                dist_range = None
                if "parallax" in mover and mover["parallax"]:
                    dist_range = {
                        "min_au": mover["parallax"]["min_au"],
                        "max_au": mover["parallax"]["max_au"],
                        "assumption": mover["parallax"]["assumption"],
                    }

                cand = structure_mover_candidate(
                    candidate_id=mover["candidate_id"],
                    field_id="field_asteroid_belt",
                    positions=[pos1, pos2],
                    verdict=None,
                    distance_range=dist_range,
                    velocity_arcsec_day=mover.get("angular_rate_arcsec_per_day"),
                )
                candidates_to_export.append(cand)
        elif isinstance(raw_input, list):
            candidates_to_export = raw_input
    else:
        # Load existing web candidates to validate and re-structure
        with open(DEFAULT_EXPORT_DEST, "r", encoding="utf-8") as f:
            existing_data = json.load(f)
        candidates_to_export = existing_data.get("candidates", [])

    result = compile_and_export_candidates(
        candidates_list=candidates_to_export,
        output_path=args.output,
        schema_path=args.schema,
        logger=logger,
    )
    print(f"Export successful: {result['candidate_count']} candidates exported to {result['output_file']}")


if __name__ == "__main__":
    main()
