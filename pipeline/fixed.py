"""fixed.py - Stationary Star Subtraction and Background Rejection Module

Separates fixed background celestial stars from true moving point sources.
Cross-matches multi-epoch detections: point sources whose positions remain identical
within astrometric tolerance (stars.tolerance_arcsec from config.json) are classified
as stationary catalog stars and subtracted from the mover candidate list.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import astropy.units as u
from astropy.coordinates import SkyCoord

from pipeline.config import load_config
from pipeline.detect import Detection


def reject_stationary_stars(
    detections_scan1: List[Detection],
    detections_scan2: List[Detection],
    tolerance_arcsec: Optional[float] = None,
) -> Tuple[List[Detection], List[Detection], List[Dict[str, Any]]]:
    """Identify and remove stationary background stars matching between two observation scans.
    
    Returns:
    - moving_scan1: Detections in scan 1 with no stationary counterpart in scan 2
    - moving_scan2: Detections in scan 2 with no stationary counterpart in scan 1
    - stationary_pairs: Matched stationary stars with measured astrometric residual
    """
    cfg = load_config()
    tol = tolerance_arcsec if tolerance_arcsec is not None else cfg.stars.tolerance_arcsec

    if not detections_scan1 or not detections_scan2:
        return list(detections_scan1), list(detections_scan2), []

    coords1 = SkyCoord([d.ra for d in detections_scan1] * u.deg, [d.dec for d in detections_scan1] * u.deg)
    coords2 = SkyCoord([d.ra for d in detections_scan2] * u.deg, [d.dec for d in detections_scan2] * u.deg)

    # 1-to-1 nearest neighbor matching from scan1 to scan2
    idx2, sep2d, _ = coords1.match_to_catalog_sky(coords2)
    sep_arcsec = sep2d.arcsec

    matched_1: set[int] = set()
    matched_2: set[int] = set()
    stationary_pairs: List[Dict[str, Any]] = []

    for i, (j, sep) in enumerate(zip(idx2, sep_arcsec)):
        if sep <= tol and j not in matched_2:
            matched_1.add(i)
            matched_2.add(j)
            d1 = detections_scan1[i]
            d2 = detections_scan2[j]
            stationary_pairs.append({
                "ra": round((d1.ra + d2.ra) / 2.0, 6),
                "dec": round((d1.dec + d2.dec) / 2.0, 6),
                "separation_arcsec": round(float(sep), 3),
                "flux_scan1": d1.flux,
                "flux_scan2": d2.flux,
                "scan1_det": d1.to_dict(),
                "scan2_det": d2.to_dict(),
            })

    moving_scan1 = [d for i, d in enumerate(detections_scan1) if i not in matched_1]
    moving_scan2 = [d for j, d in enumerate(detections_scan2) if j not in matched_2]

    return moving_scan1, moving_scan2, stationary_pairs
