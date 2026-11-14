"""Tests for production pipeline modules: parallax, triage, and export."""

from pathlib import Path
from pipeline.parallax import estimate_parallax_distance_range
from pipeline.triage import triage_candidate
from pipeline.schema import validate_file


def test_parallax_distance_range_calculation():
    """Verify that parallax distance bounds are derived with proper labels and assumptions."""
    res = estimate_parallax_distance_range(
        observed_shift_arcsec=44.2,
        baseline_days=184.0,
        d_min_au_grid=10.0,
        d_max_au_grid=500.0,
    )
    assert res.min_au >= 10.0
    assert res.max_au <= 500.0
    assert res.min_au < res.max_au
    assert "Earth-SPHEREx" in res.assumption
    assert "Keplerian" in res.assumption
    assert res.labels["distance_min_au"] == "derived"
    assert res.labels["distance_max_au"] == "derived"


def test_triage_candidate_structure_and_verdict():
    """Verify triage logic produces valid schema dictionary with reason chains."""
    positions = [
        {"time": "2026-03-15T08:00:00Z", "ra": 133.8211, "dec": -7.2104, "err": 0.08},
        {"time": "2026-09-15T08:00:00Z", "ra": 133.8329, "dec": -7.2148, "err": 0.09},
    ]
    cand = triage_candidate(
        candidate_id="cand_test_99",
        field_id="field_kuiper_edge",
        release_batch="2026-W42",
        positions=positions,
        snr=8.5,
        colour_index=1.65,
    )

    assert cand["id"] == "cand_test_99"
    assert len(cand["reason_chain"]) >= 3
    assert cand["confidence"] > 0.0
    # Unknown objects must have distance_range
    if cand["verdict"] == "unknown":
        assert cand["distance_range"] is not None
        assert cand["distance_range"]["min_au"] > 0
        assert "distance_min_au" in cand["labels"]


def test_exported_catalogs_are_valid():
    """Verify exported production catalogs pass validation against JSON schemas."""
    for dirname in ["data", "web/public/data"]:
        cand_path = Path(dirname) / "candidates.json"
        fields_path = Path(dirname) / "fields.json"
        rel_path = Path(dirname) / "releases.json"

        assert cand_path.is_file()
        assert fields_path.is_file()
        assert rel_path.is_file()

        validate_file(cand_path, "candidates")
        validate_file(fields_path, "fields")
        validate_file(rel_path, "releases")
