"""link.py - Multi-Epoch Mover Track Linking Module

Links non-stationary point source detections across multiple SPHEREx scans
into candidate mover tracks based on maximum physical angular rate.
Reads max_rate_arcsec_per_day and min_detections from config.json.
Rejects unphysical velocity outliers and tallies false tracks.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Tuple

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.time import Time

from pipeline.config import load_config
from pipeline.detect import Detection


@dataclass
class LinkedTrack:
    """Linked multi-epoch candidate mover track with calculated rate and positions."""
    track_id: str
    positions: List[Dict[str, Any]]
    rate_arcsec_per_hour: float
    rate_arcsec_per_day: float
    separation_arcsec: float
    dt_hours: float
    snr_mean: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def link_mover_tracks(
    moving_scan1: List[Detection],
    moving_scan2: List[Detection],
    max_rate_arcsec_per_day: Optional[float] = None,
    track_id_prefix: str = "CAND",
) -> Tuple[List[LinkedTrack], List[Dict[str, Any]]]:
    """Link non-stationary moving sources between two scans into candidate tracks.
    
    Returns:
    - verified_tracks: List of LinkedTrack objects satisfying velocity bounds
    - false_tracks: List of rejected pairings exceeding max physical velocity
    """
    cfg = load_config()
    max_rate = (
        max_rate_arcsec_per_day
        if max_rate_arcsec_per_day is not None
        else cfg.link.max_rate_arcsec_per_day
    )

    if not moving_scan1 or not moving_scan2:
        return [], []

    verified_tracks: List[LinkedTrack] = []
    false_tracks: List[Dict[str, Any]] = []

    coords1 = SkyCoord([d.ra for d in moving_scan1] * u.deg, [d.dec for d in moving_scan1] * u.deg)
    coords2 = SkyCoord([d.ra for d in moving_scan2] * u.deg, [d.dec for d in moving_scan2] * u.deg)

    used_scan2: set[int] = set()

    # Search for valid velocity pairings
    for i, d1 in enumerate(moving_scan1):
        c1 = coords1[i]
        t1 = Time(d1.time)

        best_j: Optional[int] = None
        best_rate_day = float("inf")
        best_sep = 0.0
        best_dt_hours = 0.0

        for j, d2 in enumerate(moving_scan2):
            if j in used_scan2:
                continue

            c2 = coords2[j]
            t2 = Time(d2.time)

            dt_days = abs(t2.mjd - t1.mjd)
            if dt_days < 1e-5:
                dt_days = 0.001  # Safeguard against zero delta

            dt_hours = dt_days * 24.0
            sep_arcsec = float(c1.separation(c2).arcsec)
            rate_day = sep_arcsec / dt_days

            if rate_day <= max_rate:
                if rate_day < best_rate_day:
                    best_rate_day = rate_day
                    best_j = j
                    best_sep = sep_arcsec
                    best_dt_hours = dt_hours
            else:
                # Log as false/rejected track
                false_tracks.append({
                    "scan1_det": d1.to_dict(),
                    "scan2_det": d2.to_dict(),
                    "separation_arcsec": round(sep_arcsec, 2),
                    "rate_arcsec_per_day": round(rate_day, 1),
                    "rejection_reason": f"Exceeds max rate limit ({max_rate:.1f}\"/day)",
                })

        if best_j is not None:
            used_scan2.add(best_j)
            d2 = moving_scan2[best_j]
            track_idx = len(verified_tracks) + 1
            rate_hr = best_rate_day / 24.0

            track = LinkedTrack(
                track_id=f"{track_id_prefix}-{track_idx:03d}",
                positions=[
                    {"time": d1.time, "ra": d1.ra, "dec": d1.dec, "err": 0.05},
                    {"time": d2.time, "ra": d2.ra, "dec": d2.dec, "err": 0.05},
                ],
                rate_arcsec_per_hour=round(rate_hr, 3),
                rate_arcsec_per_day=round(best_rate_day, 2),
                separation_arcsec=round(best_sep, 3),
                dt_hours=round(best_dt_hours, 2),
                snr_mean=round((d1.snr + d2.snr) / 2.0, 1),
            )
            verified_tracks.append(track)

    return verified_tracks, false_tracks
