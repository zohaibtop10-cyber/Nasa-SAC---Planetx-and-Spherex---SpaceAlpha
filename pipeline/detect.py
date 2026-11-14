"""detect.py - Point Source Detection Module for SPHEREx Images

Uses photutils (DAOStarFinder) to detect point sources on SPHEREx FITS images,
masking flagged pixels using FLAGS and VARIANCE extensions.
Converts centroid coordinates to celestial sky positions (RA, Dec) via WCS.
Reads detection sigma threshold from config.json.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS
from photutils.detection import DAOStarFinder

from pipeline.config import load_config
from pipeline.fetch import mask_flagged_pixels


@dataclass
class Detection:
    """Astrometric and photometric measurement of a detected point source."""
    x: float
    y: float
    ra: float
    dec: float
    flux: float
    peak: float
    snr: float
    time: str
    scan_id: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def detect_sources_in_fits(
    fits_path: Path | str,
    sigma_threshold: Optional[float] = None,
    fwhm: float = 2.5,
    scan_id: str = "scan_01",
    obs_time: Optional[str] = None,
) -> Tuple[List[Detection], Dict[str, Any]]:
    """Detect point sources on a SPHEREx FITS image with bad-pixel masking.
    
    Reads default detection threshold from config.json if not explicitly provided.
    """
    fits_path = Path(fits_path)
    if not fits_path.is_file():
        raise FileNotFoundError(f"FITS file not found: {fits_path}")

    # Load tuning parameters from config.json
    cfg = load_config()
    threshold_sigma = sigma_threshold if sigma_threshold is not None else cfg.detect.sigma

    # Load header and WCS
    with fits.open(fits_path) as hdul:
        header = hdul["IMAGE"].header
        time_iso = obs_time or header.get("DATE-OBS", "2026-04-12T00:00:00Z")
        wcs = WCS(header)

    # Mask flagged pixels and bad variance
    masked_img, mask_stats = mask_flagged_pixels(fits_path)
    data = masked_img.data
    mask = masked_img.mask

    # Estimate background level and RMS from unmasked pixels
    unmasked_vals = data[~mask]
    if len(unmasked_vals) < 100:
        raise ValueError("Insufficient unmasked pixels to estimate background statistics")

    mean_bkg, median_bkg, std_bkg = sigma_clipped_stats(unmasked_vals, sigma=3.0, maxiters=5)
    std_bkg = max(1e-6, float(std_bkg))

    # DAOStarFinder point-source extraction
    daofind = DAOStarFinder(fwhm=fwhm, threshold=threshold_sigma * std_bkg)
    bkg_subtracted = data - median_bkg
    bkg_subtracted[mask] = 0.0

    sources = daofind(bkg_subtracted, mask=mask)

    detections: List[Detection] = []
    if sources is not None and len(sources) > 0:
        # Support both photutils naming conventions
        x_col = "xcentroid" if "xcentroid" in sources.colnames else "x_centroid"
        y_col = "ycentroid" if "ycentroid" in sources.colnames else "y_centroid"
        peak_col = "peak" if "peak" in sources.colnames else "peak_value"
        flux_col = "flux"

        for row in sources:
            px = float(row[x_col])
            py = float(row[y_col])
            peak_val = float(row[peak_col])
            flux_val = float(row[flux_col]) if flux_col in sources.colnames else peak_val * 10.0

            # Convert pixel coords to sky coords (RA, Dec) via WCS
            ra_deg, dec_deg = wcs.pixel_to_world_values(px, py)
            snr = peak_val / std_bkg

            det = Detection(
                x=round(px, 3),
                y=round(py, 3),
                ra=round(float(ra_deg), 6),
                dec=round(float(dec_deg), 6),
                flux=round(flux_val, 3),
                peak=round(peak_val, 3),
                snr=round(float(snr), 2),
                time=str(time_iso),
                scan_id=scan_id,
            )
            detections.append(det)

    diagnostics = {
        "scan_id": scan_id,
        "obs_time": time_iso,
        "threshold_sigma": threshold_sigma,
        "bkg_median": float(median_bkg),
        "bkg_std": float(std_bkg),
        "sources_detected": len(detections),
        "mask_stats": mask_stats,
    }

    return detections, diagnostics
