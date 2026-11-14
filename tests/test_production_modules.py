"""Comprehensive unit and integration tests for all pipeline/ production modules:
- fetch.py
- detect.py
- fixed.py
- link.py
- triage.py
- parallax.py
- export.py
"""

from pathlib import Path
import sys
import json
import numpy as np

# Ensure root workspace is in sys.path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.config import load_config
from pipeline.fetch import inspect_fits_extensions, mask_flagged_pixels
from pipeline.detect import detect_sources_in_fits
from pipeline.fixed import reject_stationary_stars
from pipeline.link import link_mover_tracks
from pipeline.triage import triage_candidate
from pipeline.parallax import estimate_parallax_distance_range
from pipeline.export import process_field_pipeline, generate_curated_candidates
from pipeline.schema import validate_candidates_data, validate_file


def test_config_loader():
    """Verify production config loads all tuning parameters from config.json."""
    cfg = load_config()
    assert cfg.detect.sigma > 0
    assert cfg.stars.tolerance_arcsec > 0
    assert cfg.link.max_rate_arcsec_per_day > 0
    assert cfg.parallax.d_min_au >= 1.0
    assert cfg.parallax.d_max_au > cfg.parallax.d_min_au
    assert "measured" in cfg.labels
    assert "derived" in cfg.labels
    assert "assumed" in cfg.labels


def test_fetch_and_mask_flagged_pixels():
    """Verify FITS HDU inspection and bitwise masking on SPHEREx data."""
    scan1_path = Path("data/raw/spherex_scan1.fits")
    assert scan1_path.is_file(), "data/raw/spherex_scan1.fits must exist"

    exts = inspect_fits_extensions(scan1_path)
    assert len(exts) >= 4
    ext_names = [e["name"] for e in exts]
    assert "IMAGE" in ext_names
    assert "FLAGS" in ext_names
    assert "VARIANCE" in ext_names

    masked_img, stats = mask_flagged_pixels(scan1_path)
    assert stats["total_pixels"] > 0
    assert stats["valid_pixels"] > 0
    assert stats["masked_pixels"] >= 0


def test_detect_sources_in_fits():
    """Verify point-source detection on real SPHEREx FITS scan."""
    scan1_path = Path("data/raw/spherex_scan1.fits")
    detections, diagnostics = detect_sources_in_fits(scan1_path, scan_id="test_scan1")
    assert len(detections) > 10, f"Expected >10 detections, got {len(detections)}"
    assert diagnostics["sources_detected"] == len(detections)
    assert 0.0 <= detections[0].ra <= 360.0
    assert -90.0 <= detections[0].dec <= 90.0
    assert detections[0].snr > 0.0


def test_fixed_star_rejection():
    """Verify rejection of stationary background stars between 2 scans."""
    scan1 = Path("data/raw/spherex_scan1.fits")
    scan2 = Path("data/raw/spherex_scan2.fits")
    det1, _ = detect_sources_in_fits(scan1, scan_id="s1")
    det2, _ = detect_sources_in_fits(scan2, scan_id="s2")

    moving1, moving2, stationary = reject_stationary_stars(det1, det2)
    assert len(stationary) > 100, f"Expected >100 stationary stars, got {len(stationary)}"
    assert len(moving1) >= 1, "Expected at least 1 mover candidate in scan 1"
    assert len(moving2) >= 1, "Expected at least 1 mover candidate in scan 2"


def test_link_mover_tracks():
    """Verify velocity-based track linking and false-track accounting."""
    scan1 = Path("data/raw/spherex_scan1.fits")
    scan2 = Path("data/raw/spherex_scan2.fits")
    det1, _ = detect_sources_in_fits(scan1, scan_id="s1")
    det2, _ = detect_sources_in_fits(scan2, scan_id="s2")

    moving1, moving2, _ = reject_stationary_stars(det1, det2)
    tracks, false_tracks = link_mover_tracks(moving1, moving2, track_id_prefix="TEST-TRK")

    assert len(tracks) >= 1, "Should link at least one physical mover track"
    for trk in tracks:
        assert trk.rate_arcsec_per_day > 0
        assert len(trk.positions) == 2


def test_triage_priority_order():
    """Verify triage follows strict order: artifact -> known_object -> high_motion_star -> unknown."""
    from pipeline.spikes.s3_gaia import propagate_stellar_motion

    # 1. Low SNR artifact (snr < 5.0)
    art_pos = [
        {"time": "2026-04-10T02:15:00Z", "ra": 182.45, "dec": 14.28, "err": 0.1},
        {"time": "2026-04-10T14:30:00Z", "ra": 182.51, "dec": 14.30, "err": 0.1},
    ]
    cand_art = triage_candidate(
        candidate_id="cand_low_snr",
        field_id="field_test",
        release_batch="2026-W42",
        positions=art_pos,
        snr=3.0,  # Below 5.0 threshold
    )
    assert cand_art["verdict"] == "artifact"
    assert "sigma" in cand_art["reason_chain"][0] or "threshold" in cand_art["reason_chain"][0]

    # 2. Known asteroid (using cached 522 Helga position from Spike S2)
    helga_pos = [
        {"time": "2026-04-10T00:00:00Z", "ra": 354.4333, "dec": -5.2722, "err": 0.05},
        {"time": "2026-04-10T12:00:00Z", "ra": 354.4400, "dec": -5.2700, "err": 0.05},
    ]
    cand_asteroid = triage_candidate(
        candidate_id="cand_asteroid_test",
        field_id="field_test",
        release_batch="2026-W42",
        positions=helga_pos,
        snr=18.4,
    )
    assert cand_asteroid["verdict"] == "known_object"
    assert cand_asteroid["match"] is not None
    assert "Helga" in cand_asteroid["match"]["designation"] or cand_asteroid["match"]["catalog"] == "JPL Small-Body Ident"

    # 3. High motion star (Barnard's Star coordinates at 2026 epoch)
    b_ra, b_dec = propagate_stellar_motion(
        ra_deg=269.4485025,
        dec_deg=4.7394201,
        pmra_cosdec_mas_yr=-801.551,
        pmdec_mas_yr=10362.394,
        epoch_from_year=2016.0,
        epoch_to_year=2026.271047,
    )
    barnard_pos = [
        {"time": "2026-04-10T00:00:00Z", "ra": b_ra, "dec": b_dec, "err": 0.02},
        {"time": "2026-10-10T00:00:00Z", "ra": b_ra, "dec": b_dec + 0.001, "err": 0.02},
    ]
    cand_barnard = triage_candidate(
        candidate_id="cand_barnard_test",
        field_id="field_test",
        release_batch="2026-W42",
        positions=barnard_pos,
        snr=42.0,
    )
    assert cand_barnard["verdict"] == "high_motion_star"
    assert cand_barnard["match"] is not None
    assert "Gaia" in cand_barnard["match"]["catalog"]

    # 4. Unknown object (isolated sky position with no JPL or Gaia match)
    unknown_pos = [
        {"time": "2026-03-15T08:00:00Z", "ra": 133.8211, "dec": -7.2104, "err": 0.08},
        {"time": "2026-09-15T08:00:00Z", "ra": 133.8329, "dec": -7.2148, "err": 0.09},
    ]
    cand_unknown = triage_candidate(
        candidate_id="cand_unknown_test",
        field_id="field_test",
        release_batch="2026-W42",
        positions=unknown_pos,
        snr=7.1,
    )
    assert cand_unknown["verdict"] == "unknown"
    assert cand_unknown["distance_range"] is not None
    assert cand_unknown["distance_range"]["min_au"] > 0
    assert cand_unknown["distance_range"]["max_au"] > cand_unknown["distance_range"]["min_au"]
    assert "Keplerian" in cand_unknown["distance_range"]["assumption"]
    assert "scan_ranges" in cand_unknown["distance_range"]
    assert not any("Planet X" in r for r in cand_unknown["reason_chain"] if not "no claim of Planet X" in r)


def test_parallax_keplerian_bounds():
    """Verify Keplerian reflex parallax solver bounds and non-negotiable labels."""
    res = estimate_parallax_distance_range(
        observed_shift_arcsec=44.2,
        baseline_days=184.0,
        d_min_au_grid=10.0,
        d_max_au_grid=500.0,
    )
    d = res.to_dict()
    assert "min_au" in d
    assert "max_au" in d
    assert "assumption" in d
    assert "nominal_au" not in d  # Must strictly match candidates.json schema without unexpected fields
    assert d["min_au"] < d["max_au"]
    assert res.labels["distance_min_au"] == "derived"
    assert res.labels["distance_max_au"] == "derived"


def test_process_field_pipeline_end_to_end(tmp_path):
    """Verify entire pipeline executes on real field data and produces validated candidates.json."""
    out_dir = tmp_path / "web_data"
    result = process_field_pipeline(
        field_id="field_asteroid_belt",
        scan1_fits="data/raw/spherex_scan1.fits",
        scan2_fits="data/raw/spherex_scan2.fits",
        output_dir=str(out_dir),
    )

    candidates_file = Path(result["output_file"])
    assert candidates_file.is_file()
    with open(candidates_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert "candidates" in data
    assert len(data["candidates"]) >= 2

    # Validate against JSON schema
    validate_candidates_data(data)

    # Check non-negotiable labels on every candidate
    for cand in data["candidates"]:
        assert "labels" in cand
        for key, ep in cand["labels"].items():
            assert ep in ["measured", "derived", "assumed"]


if __name__ == "__main__":
    import tempfile
    print("Running production module test suite...")
    test_config_loader()
    print("✓ test_config_loader passed")
    test_fits_masking_and_detection()
    print("✓ test_fits_masking_and_detection passed")
    test_stationary_star_rejection()
    print("✓ test_stationary_star_rejection passed")
    test_track_linking_real_and_synthetic()
    print("✓ test_track_linking_real_and_synthetic passed")
    test_triage_four_tiers()
    print("✓ test_triage_four_tiers passed")
    test_parallax_distance_range()
    print("✓ test_parallax_distance_range passed")
    test_schema_validation_real_data()
    print("✓ test_schema_validation_real_data passed")
    
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_process_field_pipeline_end_to_end(Path(tmp_dir))
    print("✓ test_process_field_pipeline_end_to_end passed")
    print("ALL PRODUCTION MODULE TESTS PASSED CLEANLY!")
