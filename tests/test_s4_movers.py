"""Unit and integration tests for Spike S4: Multi-Epoch Mover Detection."""

import math
from pathlib import Path

import numpy as np
import pytest
from astropy.wcs import WCS

from pipeline.spikes.s4_movers import (
    Detection,
    create_synthetic_two_epoch_field,
    estimate_background_rms,
    extract_sources_from_image,
    filter_stationary_sources,
    link_moving_detections,
    run_s4_spike,
)


def test_estimate_background_rms():
    """Verify background median and MAD-based standard deviation estimation."""
    rng = np.random.default_rng(123)
    data = rng.normal(loc=25.0, scale=3.5, size=(100, 100))
    bkg_med, bkg_std = estimate_background_rms(data)

    assert abs(bkg_med - 25.0) < 0.2
    assert abs(bkg_std - 3.5) < 0.2


def test_extract_sources_and_coordinate_conversion():
    """Verify source extraction returns detections with valid sky coordinates."""
    data_ep1, wcs, t1_iso, mjd1, _, _, _, _, _ = create_synthetic_two_epoch_field(
        size=256, num_stars=10, seed=7
    )
    sources = extract_sources_from_image(data_ep1, wcs, t1_iso, mjd1, epoch_idx=1, sigma=5.0)

    assert len(sources) >= 10
    for s in sources:
        assert isinstance(s, Detection)
        assert 160.0 < s.ra_deg < 170.0
        assert 25.0 < s.dec_deg < 35.0
        assert s.snr >= 5.0
        assert s.epoch_time_iso == t1_iso


def test_stationary_star_rejection():
    """Verify that stationary stars are matched and separated from moving objects."""
    (
        data_ep1, wcs_ep1, t1, mjd1,
        data_ep2, wcs_ep2, t2, mjd2,
        truth,
    ) = create_synthetic_two_epoch_field(size=256, num_stars=15, delta_t_hours=3.0, seed=99)

    sources_ep1 = extract_sources_from_image(data_ep1, wcs_ep1, t1, mjd1, epoch_idx=1)
    sources_ep2 = extract_sources_from_image(data_ep2, wcs_ep2, t2, mjd2, epoch_idx=2)

    unmatched1, unmatched2, stationary_pairs = filter_stationary_sources(
        sources_ep1, sources_ep2, tolerance_arcsec=1.0
    )

    # All stationary stars should be matched
    assert len(stationary_pairs) >= 14
    # The moving asteroid should remain unmatched in both epochs
    assert len(unmatched1) >= 1
    assert len(unmatched2) >= 1


def test_mover_linking_and_velocity_accuracy():
    """Verify that candidate mover tracks are formed and derive correct velocity."""
    (
        data_ep1, wcs_ep1, t1, mjd1,
        data_ep2, wcs_ep2, t2, mjd2,
        truth,
    ) = create_synthetic_two_epoch_field(
        size=300,
        num_stars=12,
        delta_t_hours=4.0,
        asteroid_velocity_arcsec_per_hr=10.0,  # 240"/day
        seed=42,
    )

    sources_ep1 = extract_sources_from_image(data_ep1, wcs_ep1, t1, mjd1)
    sources_ep2 = extract_sources_from_image(data_ep2, wcs_ep2, t2, mjd2)

    unmatched1, unmatched2, _ = filter_stationary_sources(sources_ep1, sources_ep2, tolerance_arcsec=1.5)
    movers, false_tracks, false_track_count = link_moving_detections(unmatched1, unmatched2, field_id="TEST-01")

    assert len(movers) == 1
    assert false_track_count >= 0
    m = movers[0]
    assert m.field_id == "TEST-01"
    assert m.candidate_id == "CAND-TEST-01-001"
    assert abs(m.delta_time_hours - 4.0) < 0.001
    # Verify derived velocity within 2% of injected truth
    assert abs(m.motion_rate_arcsec_per_hour - truth["velocity_arcsec_per_hr"]) < 0.3
    # Verify labels exist for all displayed numbers
    for key in ["separation_arcsec", "motion_rate_arcsec_per_hour", "motion_rate_arcsec_per_day", "position_angle_deg"]:
        assert key in m.labels
        assert m.labels[key] == "derived"
    for key in ["ra_1_deg", "dec_1_deg", "ra_2_deg", "dec_2_deg", "delta_time_hours"]:
        assert key in m.labels
        assert m.labels[key] == "measured"


def test_s4_end_to_end_synthetic_run():
    """Verify end-to-end execution of run_s4_spike in synthetic mode."""
    res = run_s4_spike(fits_path_ep1=None, delta_t_hours=2.5, field_id="SYN-01", force_synthetic=True)
    assert res["status"] == "success"
    assert res["num_movers"] == 1
    assert res["false_track_count"] >= 1
    assert res["num_stationary_stars"] >= 20
    mover = res["movers"][0]
    assert "labels" in mover
    assert mover["labels"]["motion_rate_arcsec_per_day"] == "derived"


def test_s4_end_to_end_real_fits_if_available():
    """Verify end-to-end execution on real SPHEREx FITS file if present."""
    fits_path = Path("data/raw/spherex_sample.fits")
    if not fits_path.is_file():
        pytest.skip("SPHEREx sample FITS file not downloaded")

    res = run_s4_spike(fits_path_ep1=fits_path, delta_t_hours=4.0, field_id="SPX-REAL-01")
    assert res["status"] == "success"
    assert res["num_movers"] >= 1
    assert res["false_track_count"] >= 0
    assert res["num_stationary_stars"] > 50
