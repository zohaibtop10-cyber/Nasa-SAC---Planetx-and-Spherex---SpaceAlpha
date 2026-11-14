"""Verify that the web app production dataset in web/public/data strictly conforms to JSON contracts."""

from pathlib import Path
from pipeline.schema import validate_file


def test_public_candidates_conform_to_schema():
    path = Path("web/public/data/candidates.json")
    assert path.is_file(), "web/public/data/candidates.json must exist"
    data = validate_file(path, "candidates")
    candidates = data["candidates"]

    # Verify known asteroid and unknown object presence
    assert len(candidates) >= 2
    verdicts = {c["verdict"] for c in candidates}
    assert "known_object" in verdicts
    assert "unknown" in verdicts

    known = next(c for c in candidates if c["verdict"] == "known_object")
    assert known["distance_range"] is None
    assert "1 Ceres" in known["match"]["designation"] or known["match"]["catalog"] == "JPL Small-Body Ident"

    unknown = next(c for c in candidates if c["verdict"] == "unknown")
    assert unknown["distance_range"] is not None
    assert unknown["distance_range"]["min_au"] > 0
    assert unknown["distance_range"]["max_au"] > unknown["distance_range"]["min_au"]


def test_public_fields_conform_to_schema():
    path = Path("web/public/data/fields.json")
    assert path.is_file(), "web/public/data/fields.json must exist"
    data = validate_file(path, "fields")
    assert len(data["fields"]) >= 2


def test_public_releases_conform_to_schema():
    path = Path("web/public/data/releases.json")
    assert path.is_file(), "web/public/data/releases.json must exist"
    data = validate_file(path, "releases")
    assert len(data["releases"]) >= 1
    rel = data["releases"][0]
    assert rel["candidate_counts"]["total"] >= 2
    assert rel["candidate_counts"]["known_object"] >= 1
    assert rel["candidate_counts"]["unknown"] >= 1
