"""Unit tests for Spike S1 (SPHEREx FITS parsing and masking logic)."""

from pathlib import Path
import numpy as np
from astropy.io import fits
from pipeline.spikes.s1_fetch import print_extension_table, mask_and_display_image, get_target_coordinates


def test_target_coordinates():
    """Verify target coordinate retrieval for comet 3I."""
    ra, dec, name = get_target_coordinates("3I")
    assert 0.0 <= ra <= 360.0
    assert -90.0 <= dec <= 90.0
    assert "ATLAS" in name or "3I" in name


def test_fits_extension_table_and_masking():
    """Verify FITS extension listing and variance masking on downloaded SPHEREx sample."""
    fits_path = Path("data/raw/spherex_sample.fits")
    assert fits_path.is_file(), "Downloaded SPHEREx FITS file must exist in data/raw"

    with fits.open(fits_path) as hdul:
        extensions = print_extension_table(hdul)
        assert len(extensions) >= 4
        names = [e["name"] for e in extensions]
        assert "PRIMARY" in names or "(PRIMARY)" in names
        assert "IMAGE" in names
        assert "FLAGS" in names
        assert "VARIANCE" in names

    out_png = Path("data/raw/test_masked_output.png")
    masked_img, stats = mask_and_display_image(fits_path, output_png=out_png, crop_size=100)
    assert out_png.is_file()
    assert isinstance(masked_img, np.ma.MaskedArray)
    assert stats["total_pixels"] == 2040 * 2040
    assert stats["valid_pixels"] > 0
    assert stats["masked_pixels"] > 0

    # Cleanup temporary test png
    if out_png.is_file():
        out_png.unlink()


def test_deg_to_sexagesimal_formatting():
    """Verify conversion from decimal degrees to sexagesimal format for JPL API."""
    from pipeline.spikes.s2_known import deg_to_sexagesimal, parse_jpl_ra_dec

    ra_str, dec_str = deg_to_sexagesimal(354.3429, -4.9898)
    assert ra_str.startswith("23-37-")
    assert dec_str.startswith("-04-59-")

    # Roundtrip check
    ra_deg, dec_deg = parse_jpl_ra_dec(ra_str, dec_str)
    assert abs(ra_deg - 354.3429) < 0.01
    assert abs(dec_deg - (-4.9898)) < 0.01


def test_s2_known_asteroids_and_instant_cache():
    """Verify Spike S2 returns known asteroids and subsequent call is instant via disk cache."""
    import time
    from pipeline.spikes.s2_known import query_known_asteroids, KnownAsteroid

    test_ra = 354.3429
    test_dec = -4.9898
    test_time = "2026-04-10 00:00:00"

    # Query (will hit disk cache created by s2_known run)
    t0 = time.perf_counter()
    asteroids, meta = query_known_asteroids(
        ra_deg=test_ra,
        dec_deg=test_dec,
        obs_time=test_time,
        fov_hwidth_deg=0.3,
        vmag_lim=18.0,
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert len(asteroids) >= 1, "Must return at least one known small body"
    assert meta["source"] == "disk_cache", "Should load from disk cache"
    assert elapsed_ms < 50.0, f"Cached call took {elapsed_ms:.2f} ms (must be < 50ms)"

    first = asteroids[0]
    assert isinstance(first, KnownAsteroid)
    assert first.name
    assert 0.0 <= first.predicted_ra_deg <= 360.0
    assert -90.0 <= first.predicted_dec_deg <= 90.0


def test_propagate_stellar_motion():
    """Verify stellar proper motion propagation arithmetic."""
    from pipeline.spikes.s3_gaia import propagate_stellar_motion

    # 10 years of +3600 mas/yr (3.6 arcsec/yr) in Dec should move exactly 36.0 arcsec (0.01 deg)
    ra_prop, dec_prop = propagate_stellar_motion(
        ra_deg=100.0,
        dec_deg=0.0,
        pmra_cosdec_mas_yr=0.0,
        pmdec_mas_yr=3600.0,
        epoch_from_year=2016.0,
        epoch_to_year=2026.0,
    )
    assert abs(ra_prop - 100.0) < 1e-6
    expected_dec = 36.0 / 3600.0  # 0.01 deg
    assert abs(dec_prop - expected_dec) < 1e-6


def test_s3_gaia_fast_star_matching_and_cache():
    """Verify Spike S3 returns a match for Barnard's Star and flags it as a fast mover."""
    import time
    from pipeline.spikes.s3_gaia import match_gaia_star, propagate_stellar_motion, GaiaStarMatch

    obs_time = "2026-04-10 00:00:00"
    obs_year = 2026.271047

    det_ra, det_dec = propagate_stellar_motion(
        ra_deg=269.4485025,
        dec_deg=4.7394201,
        pmra_cosdec_mas_yr=-801.551,
        pmdec_mas_yr=10362.394,
        epoch_from_year=2016.0,
        epoch_to_year=obs_year,
    )

    t0 = time.perf_counter()
    match, meta = match_gaia_star(
        ra_deg=det_ra,
        dec_deg=det_dec,
        obs_time=obs_time,
        search_radius_arcsec=15.0,
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert match is not None, "Barnard's Star must be matched"
    assert isinstance(match, GaiaStarMatch)
    assert match.source_id == "4472832130942575872"
    assert match.separation_arcsec < 0.1, f"Separation should be ~0, got {match.separation_arcsec}"
    assert match.is_fast_mover is True, "Must be flagged as high proper motion star"
    assert match.total_pm_mas_yr > 10000.0, "Proper motion must be > 10,000 mas/yr"
    assert meta["source"] == "disk_cache", "Should load from disk cache"
    assert elapsed_ms < 50.0, f"Cached execution took {elapsed_ms:.2f} ms (must be < 50ms)"


