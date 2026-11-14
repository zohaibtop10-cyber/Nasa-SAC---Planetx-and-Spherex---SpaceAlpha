"""Unit tests for JSON data contracts and domain validation rules."""

import json
from pathlib import Path

import pytest
from pipeline.schema import (
    ContractValidationError,
    validate_candidate_domain_rules,
    validate_candidates_data,
    validate_file,
    validate_json_schema,
)


@pytest.fixture
def valid_unknown_candidate() -> dict:
    return {
        "id": "cand_2026_001",
        "field_id": "field_wise0855",
        "release_batch": "2026-W42",
        "positions": [
            {"time": "2026-03-01T12:00:00Z", "ra": 133.795, "dec": -7.245, "err": 0.08},
            {"time": "2026-09-01T12:00:00Z", "ra": 133.805, "dec": -7.248, "err": 0.09},
        ],
        "verdict": "unknown",
        "reason_chain": [
            "Source detected at 6.2 sigma in SPHEREx QR2 Band 3",
            "Cross-matched against JPL Small-Body Ident (5 arcsec radius): no known asteroid match",
            "Cross-matched against Gaia DR3 (3 arcsec radius): no star catalog match",
            "Classified as unknown mover pending multi-epoch baseline extension",
        ],
        "confidence": 0.88,
        "match": None,
        "distance_range": {
            "min_au": 45.0,
            "max_au": 180.0,
            "assumption": "Calculated from 6-month Earth-SPHEREx 2.0 AU orbital baseline parallax",
        },
        "colour_index": 1.42,
        "labels": {
            "confidence": "derived",
            "colour_index": "measured",
            "distance_min_au": "derived",
            "distance_max_au": "derived",
            "positions.ra": "measured",
            "positions.dec": "measured",
            "positions.err": "derived",
        },
    }


@pytest.fixture
def valid_known_candidate() -> dict:
    return {
        "id": "cand_2026_002",
        "field_id": "field_asteroid_ceres",
        "release_batch": "2026-W42",
        "positions": [
            {"time": "2026-04-10T00:00:00Z", "ra": 180.12, "dec": 12.34, "err": 0.05},
            {"time": "2026-04-11T00:00:00Z", "ra": 180.18, "dec": 12.39, "err": 0.05},
        ],
        "verdict": "known_object",
        "reason_chain": [
            "Source detected at 14.5 sigma in SPHEREx QR2",
            "Matched JPL Small-Body Ident: 1 Ceres with separation 0.32 arcsec",
        ],
        "confidence": 0.99,
        "match": {
            "catalog": "JPL Small-Body Ident",
            "designation": "1 Ceres",
            "separation_arcsec": 0.32,
        },
        "distance_range": None,
        "colour_index": 0.78,
        "labels": {
            "confidence": "derived",
            "colour_index": "measured",
            "positions.ra": "measured",
            "positions.dec": "measured",
            "positions.err": "derived",
            "separation_arcsec": "derived",
        },
    }


def test_valid_candidates_pass(valid_unknown_candidate, valid_known_candidate):
    """Verify that correctly formatted candidates pass both schema and domain validation."""
    payload = {"candidates": [valid_unknown_candidate, valid_known_candidate]}
    validate_candidates_data(payload)


def test_empty_reason_chain_fails(valid_unknown_candidate):
    """Verify that an empty reason chain raises ContractValidationError."""
    valid_unknown_candidate["reason_chain"] = []
    payload = {"candidates": [valid_unknown_candidate]}
    with pytest.raises(ContractValidationError) as exc:
        validate_candidates_data(payload)
    assert "reason_chain" in str(exc.value)


def test_single_position_fails(valid_unknown_candidate):
    """Verify that fewer than 2 positions raises ContractValidationError."""
    valid_unknown_candidate["positions"] = [valid_unknown_candidate["positions"][0]]
    payload = {"candidates": [valid_unknown_candidate]}
    with pytest.raises(ContractValidationError) as exc:
        validate_candidates_data(payload)
    assert "positions" in str(exc.value)


def test_unknown_verdict_without_distance_range_fails(valid_unknown_candidate):
    """Verify that unknown verdict requires distance_range."""
    valid_unknown_candidate["distance_range"] = None
    payload = {"candidates": [valid_unknown_candidate]}
    with pytest.raises(ContractValidationError) as exc:
        validate_candidates_data(payload)
    assert "distance_range" in str(exc.value)


def test_known_verdict_with_distance_range_fails(valid_known_candidate):
    """Verify that known object cannot have distance_range (distance is known from orbit)."""
    valid_known_candidate["distance_range"] = {
        "min_au": 2.5,
        "max_au": 3.0,
        "assumption": "Invalid assumption",
    }
    payload = {"candidates": [valid_known_candidate]}
    with pytest.raises(ContractValidationError) as exc:
        validate_candidates_data(payload)
    assert "exists only for 'unknown' verdicts" in str(exc.value)


def test_missing_confidence_label_fails(valid_unknown_candidate):
    """Verify that omitting a label for confidence fails."""
    del valid_unknown_candidate["labels"]["confidence"]
    payload = {"candidates": [valid_unknown_candidate]}
    with pytest.raises(ContractValidationError) as exc:
        validate_candidates_data(payload)
    assert "confidence" in str(exc.value)
    assert "missing an explicit classification" in str(exc.value)


def test_missing_distance_range_label_fails(valid_unknown_candidate):
    """Verify that omitting distance_range labels for an unknown candidate fails."""
    del valid_unknown_candidate["labels"]["distance_min_au"]
    payload = {"candidates": [valid_unknown_candidate]}
    with pytest.raises(ContractValidationError) as exc:
        validate_candidates_data(payload)
    assert "distance_range" in str(exc.value)


def test_invalid_label_name_fails(valid_unknown_candidate):
    """Verify that non-standard labels (e.g. 'guess') violate non-negotiables."""
    valid_unknown_candidate["labels"]["confidence"] = "estimated"
    payload = {"candidates": [valid_unknown_candidate]}
    with pytest.raises(ContractValidationError) as exc:
        validate_candidates_data(payload)
    assert "not one of" in str(exc.value) or "must be one of" in str(exc.value)


def test_validate_config_file_against_schema():
    """Verify that repository config.json satisfies config schema."""
    config_path = Path("config.json")
    assert config_path.is_file()
    data = validate_file(config_path, "config")
    assert data["detect"]["sigma"] == 5.0
    assert "measured" in data["labels"]


def test_validate_fields_schema(tmp_path: Path):
    """Verify fields schema against a valid sky fields document."""
    fields_data = {
        "fields": [
            {
                "id": "field_wise0855",
                "name": "WISE 0855-0714 Field",
                "ra_deg": 133.795,
                "dec_deg": -7.245,
                "fov_deg": 0.5,
                "description": "High proper motion sub-brown dwarf test benchmark",
                "target_type": "benchmark_brown_dwarf",
                "scans": [
                    {"scan_id": "SPHEREX_S1_001", "epoch_utc": "2026-03-01T12:00:00Z"},
                    {"scan_id": "SPHEREX_S2_002", "epoch_utc": "2026-09-01T12:00:00Z"},
                ],
                "labels": {
                    "ra_deg": "measured",
                    "dec_deg": "measured",
                    "fov_deg": "assumed",
                },
            }
        ]
    }
    field_file = tmp_path / "test_fields.json"
    field_file.write_text(json.dumps(fields_data), encoding="utf-8")
    data = validate_file(field_file, "fields")
    assert len(data["fields"]) == 1
