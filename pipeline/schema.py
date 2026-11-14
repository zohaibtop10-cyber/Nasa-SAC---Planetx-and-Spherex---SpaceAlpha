"""JSON Schema validation and domain rule enforcement for Live Sky data contracts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import jsonschema
from jsonschema.exceptions import ValidationError as JSONSchemaValidationError


class ContractValidationError(Exception):
    """Raised when a data contract or domain invariant is violated."""
    pass


ALLOWED_LABELS: Set[str] = {"measured", "derived", "assumed"}
ALLOWED_VERDICTS: Set[str] = {"artifact", "known_object", "high_motion_star", "unknown"}


def get_schema_dir() -> Path:
    """Return path to data/schemas/ directory."""
    candidates = [
        Path.cwd() / "data" / "schemas",
        Path(__file__).resolve().parent.parent / "data" / "schemas",
    ]
    for c in candidates:
        if c.is_dir():
            return c
    raise FileNotFoundError("Could not find 'data/schemas' directory.")


def load_schema(schema_name: str) -> dict[str, Any]:
    """Load JSON schema by name (e.g. 'candidates', 'fields', 'releases', 'config')."""
    base_name = schema_name.removesuffix(".json")
    schema_path = get_schema_dir() / f"{base_name}.json"
    if not schema_path.is_file():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")

    with open(schema_path, "r", encoding="utf-8") as f:
        return json.load(f)


def validate_json_schema(instance: Any, schema_name: str) -> None:
    """Validate JSON instance against JSON Schema specification."""
    schema = load_schema(schema_name)
    try:
        jsonschema.validate(instance=instance, schema=schema)
    except JSONSchemaValidationError as exc:
        raise ContractValidationError(
            f"Schema validation error in '{schema_name}': {exc.message} at path: {list(exc.path)}"
        ) from exc


def _check_label_presence(labels: dict[str, str], accepted_keys: list[str], display_name: str) -> None:
    """Ensure at least one of the accepted keys for a displayed number exists in the labels map."""
    found = any(k in labels for k in accepted_keys)
    if not found:
        raise ContractValidationError(
            f"Displayed number '{display_name}' is missing an explicit classification in labels map. "
            f"Expected one of keys: {accepted_keys}"
        )
    # Check that any matching label is an allowed non-negotiable label
    for k in accepted_keys:
        if k in labels:
            val = labels[k]
            if val not in ALLOWED_LABELS:
                raise ContractValidationError(
                    f"Label for '{k}' must be one of {sorted(ALLOWED_LABELS)}, got '{val}'"
                )


def validate_candidate_domain_rules(candidate: dict[str, Any]) -> None:
    """Enforce strict astronomical and epistemic domain rules on a candidate dictionary:

    1. reason_chain must be non-empty (at least 1 entry).
    2. positions must have at least 2 coordinate observations.
    3. distance_range exists ONLY for unknown verdicts.
    4. Every displayed number has a valid label in labels map.
    """
    candidate_id = candidate.get("id", "<unknown_id>")

    # 1. Reason chain non-empty
    reason_chain = candidate.get("reason_chain")
    if not isinstance(reason_chain, list) or len(reason_chain) == 0:
        raise ContractValidationError(
            f"Candidate '{candidate_id}': 'reason_chain' must be a non-empty list of strings."
        )

    # 2. Positions has at least 2 entries
    positions = candidate.get("positions")
    if not isinstance(positions, list) or len(positions) < 2:
        raise ContractValidationError(
            f"Candidate '{candidate_id}': 'positions' must contain at least 2 observations, "
            f"got {len(positions) if isinstance(positions, list) else 0}."
        )

    verdict = candidate.get("verdict")
    if verdict not in ALLOWED_VERDICTS:
        raise ContractValidationError(
            f"Candidate '{candidate_id}': invalid verdict '{verdict}'. Allowed: {sorted(ALLOWED_VERDICTS)}"
        )

    # 3. distance_range exists ONLY for unknown verdicts
    distance_range = candidate.get("distance_range")
    if verdict == "unknown":
        if distance_range is None or not isinstance(distance_range, dict):
            raise ContractValidationError(
                f"Candidate '{candidate_id}': 'distance_range' MUST exist for verdict 'unknown'."
            )
        if "min_au" not in distance_range or "max_au" not in distance_range or "assumption" not in distance_range:
            raise ContractValidationError(
                f"Candidate '{candidate_id}': 'distance_range' must specify 'min_au', 'max_au', and 'assumption'."
            )
        min_au = float(distance_range["min_au"])
        max_au = float(distance_range["max_au"])
        if max_au < min_au:
            raise ContractValidationError(
                f"Candidate '{candidate_id}': 'distance_range.max_au' ({max_au}) cannot be less than "
                f"'distance_range.min_au' ({min_au})."
            )
    else:
        if distance_range is not None:
            raise ContractValidationError(
                f"Candidate '{candidate_id}': 'distance_range' exists only for 'unknown' verdicts, "
                f"but verdict is '{verdict}'."
            )

    # 4. Every displayed number has a key in labels
    labels = candidate.get("labels")
    if not isinstance(labels, dict):
        raise ContractValidationError(
            f"Candidate '{candidate_id}': 'labels' must be an object/dict mapping field names to "
            f"one of {sorted(ALLOWED_LABELS)}."
        )

    # Required displayed number: confidence
    if "confidence" in candidate and isinstance(candidate["confidence"], (int, float)):
        _check_label_presence(labels, ["confidence"], f"candidate['{candidate_id}'].confidence")

    # Displayed number: colour_index (if present and non-null)
    if candidate.get("colour_index") is not None and isinstance(candidate["colour_index"], (int, float)):
        _check_label_presence(labels, ["colour_index"], f"candidate['{candidate_id}'].colour_index")

    # Displayed numbers in distance_range (for unknown objects)
    if distance_range is not None:
        _check_label_presence(
            labels,
            ["distance_range.min_au", "distance_min_au", "distance_range"],
            f"candidate['{candidate_id}'].distance_range.min_au"
        )
        _check_label_presence(
            labels,
            ["distance_range.max_au", "distance_max_au", "distance_range"],
            f"candidate['{candidate_id}'].distance_range.max_au"
        )

    # Displayed numbers in positions: ra, dec, err
    for idx, pos in enumerate(positions):
        if not isinstance(pos, dict):
            continue
        _check_label_presence(
            labels,
            [f"positions[{idx}].ra", "positions.ra", "ra", "positions"],
            f"candidate['{candidate_id}'].positions[{idx}].ra"
        )
        _check_label_presence(
            labels,
            [f"positions[{idx}].dec", "positions.dec", "dec", "positions"],
            f"candidate['{candidate_id}'].positions[{idx}].dec"
        )
        _check_label_presence(
            labels,
            [f"positions[{idx}].err", "positions.err", "err", "positions"],
            f"candidate['{candidate_id}'].positions[{idx}].err"
        )

    # Displayed numbers in match (if separation_arcsec present)
    match_data = candidate.get("match")
    if isinstance(match_data, dict) and "separation_arcsec" in match_data:
        _check_label_presence(
            labels,
            ["match.separation_arcsec", "separation_arcsec", "match"],
            f"candidate['{candidate_id}'].match.separation_arcsec"
        )


def validate_candidates_data(data: dict[str, Any]) -> None:
    """Validate full candidates JSON data structure including schema and all domain invariants."""
    validate_json_schema(data, "candidates")
    candidates_list = data.get("candidates", [])
    for cand in candidates_list:
        validate_candidate_domain_rules(cand)


def validate_file(file_path: Path | str, schema_name: str) -> dict[str, Any]:
    """Validate a JSON file against schema and domain rules."""
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"File to validate not found: {path.resolve()}")

    with open(path, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as exc:
            raise ContractValidationError(f"Invalid JSON syntax in {path}: {exc}") from exc

    if schema_name == "candidates":
        validate_candidates_data(data)
    else:
        validate_json_schema(data, schema_name)

    return data
