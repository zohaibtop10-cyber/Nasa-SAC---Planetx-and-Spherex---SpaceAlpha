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
        assert len(extensions) >= 6
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

