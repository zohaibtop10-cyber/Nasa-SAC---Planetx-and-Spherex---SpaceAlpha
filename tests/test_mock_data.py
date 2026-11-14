"""Verify that the web app mock dataset strictly conforms to the pipeline JSON contracts."""

from pathlib import Path
from pipeline.schema import validate_file


def test_mock_candidates_conform_to_schema():
    path = Path("web/public/data/mock/candidates.json")
    assert path.is_file(), "web/public/data/mock/candidates.json must exist"
    data = validate_file(path, "candidates")
    candidates = data["candidates"]

    # Verify known asteroid and unknown object presence
    assert len(candidates) >= 2
    verdicts = {c["verdict"] for c in candidates}
    assert "known_object" in verdicts
    assert "unknown" in verdicts

    known = next(c for c in candidates if c["verdict"] == "known_object")
    assert known["distance_range"] is None
    assert known["match"]["designation"] == "1 Ceres"

    unknown = next(c for c in candidates if c["verdict"] == "unknown")
    assert unknown["distance_range"] is not None
    assert unknown["distance_range"]["min_au"] == 55.0
    assert unknown["distance_range"]["max_au"] == 180.0


def test_mock_fields_conform_to_schema():
    path = Path("web/public/data/mock/fields.json")
    assert path.is_file(), "web/public/data/mock/fields.json must exist"
    data = validate_file(path, "fields")
    assert len(data["fields"]) >= 2


def test_mock_releases_conform_to_schema():
    path = Path("web/public/data/mock/releases.json")
    assert path.is_file(), "web/public/data/mock/releases.json must exist"
    data = validate_file(path, "releases")
    assert len(data["releases"]) >= 1
    rel = data["releases"][0]
    assert rel["candidate_counts"]["total"] >= 2
    assert rel["candidate_counts"]["known_object"] >= 1
    assert rel["candidate_counts"]["unknown"] >= 1
