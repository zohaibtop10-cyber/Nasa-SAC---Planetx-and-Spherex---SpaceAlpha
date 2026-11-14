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
