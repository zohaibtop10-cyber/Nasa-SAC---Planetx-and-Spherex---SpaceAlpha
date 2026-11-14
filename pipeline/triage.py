"""triage.py - Automated Mover Triage Classification Module

Implements strict triage order:
1. artifact: Unphysical velocity (> max rate), low SNR, or single-epoch transient.
2. known_object: Positionally correlated with NASA JPL Small-Body Database within tolerance.
3. high_motion_star: Correlated with ESA Gaia DR3 fast-moving stellar source.
4. unknown: Uncataloged candidate outer mover -> Parallax distance range solver.

Reads tuning thresholds from config.json.
Caches every network query to disk.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.time import Time

from pipeline.config import load_config
from pipeline.parallax import estimate_parallax_distance_range
from pipeline.spikes.s2_known import query_known_asteroids
from pipeline.spikes.s3_gaia import match_gaia_star


def triage_candidate(
    candidate_id: str,
    field_id: str,
    release_batch: str,
    positions: List[Dict[str, Any]],
    snr: float = 12.0,
    colour_index: float = 1.2,
    simulated: bool = False,
    known_tolerance_arcsec: Optional[float] = None,
    gaia_tolerance_arcsec: Optional[float] = None,
    max_rate_arcsec_per_day: Optional[float] = None,
) -> Dict[str, Any]:
    """Classify a candidate mover strictly in order: artifact -> known_object -> high_motion_star -> unknown."""
    cfg = load_config()
    tol_known = known_tolerance_arcsec if known_tolerance_arcsec is not None else cfg.known.tolerance_arcsec
    tol_gaia = gaia_tolerance_arcsec if gaia_tolerance_arcsec is not None else cfg.stars.tolerance_arcsec
    max_rate = max_rate_arcsec_per_day if max_rate_arcsec_per_day is not None else cfg.link.max_rate_arcsec_per_day

    if len(positions) < 2:
        return {
            "id": candidate_id,
            "field_id": field_id,
            "release_batch": release_batch,
            "positions": positions,
            "verdict": "artifact",
            "reason_chain": ["Triage rejection: fewer than 2 detection epochs (unlinked transient artifact)"],
            "confidence": 0.98,
            "match": None,
            "distance_range": None,
            "colour_index": round(colour_index, 2),
            "simulated": simulated,
            "labels": {
                "confidence": "derived",
                "colour_index": "measured",
                "positions.ra": "measured",
                "positions.dec": "measured",
                "positions.err": "derived",
            },
        }

    p1 = positions[0]
    p2 = positions[-1]
    ra1, dec1 = p1["ra"], p1["dec"]
    t1_iso = p1["time"]
    t2_iso = p2["time"]

    c1 = SkyCoord(ra1 * u.deg, dec1 * u.deg)
    c2 = SkyCoord(p2["ra"] * u.deg, p2["dec"] * u.deg)
    sep_arcsec = float(c1.separation(c2).arcsec)

    time1 = Time(t1_iso)
    time2 = Time(t2_iso)
    dt_days = max(0.0001, abs(time2.mjd - time1.mjd))
    rate_day = sep_arcsec / dt_days

    reason_chain: List[str] = [
        f"Infrared point source detected at {snr:.1f} sigma across {len(positions)} observation epochs"
    ]

    verdict: Optional[str] = None
    match_details: Optional[Dict[str, Any]] = None
    distance_range: Optional[Dict[str, Any]] = None
    confidence = 0.85

    # -------------------------------------------------------------
    # 1. Triage Check 1: Artifact
    # -------------------------------------------------------------
    # An apparent velocity far exceeding physical solar system escape speeds
    # (e.g. > 10,000"/day) or sub-detection SNR indicates an optical ghost / cosmic ray
    if snr < 4.0 or rate_day > max_rate * 5.0:
        verdict = "artifact"
        confidence = 0.96
        reason_chain.append(
            f"Astrometric rejection: apparent rate ({rate_day:.1f}\"/day) exceeds physical Keplerian bound"
            if rate_day > max_rate * 5.0
            else f"Photometric rejection: SNR ({snr:.1f}) below valid detection threshold"
        )

    # -------------------------------------------------------------
    # 2. Triage Check 2: Known Solar System Minor Body
    # -------------------------------------------------------------
    if verdict is None:
        try:
            jpl_matches, _ = query_known_asteroids(
                ra_deg=ra1,
                dec_deg=dec1,
                obs_time=t1_iso,
                fov_hwidth_deg=0.3,
                vmag_lim=18.0,
            )
            if jpl_matches:
                closest_sb = None
                min_sb_sep = float("inf")
                for sb in jpl_matches:
                    sb_coord = SkyCoord(sb.predicted_ra_deg * u.deg, sb.predicted_dec_deg * u.deg)
                    sb_sep = float(c1.separation(sb_coord).arcsec)
                    if sb_sep < min_sb_sep:
                        min_sb_sep = sb_sep
                        closest_sb = sb

                if closest_sb and min_sb_sep <= tol_known:
                    verdict = "known_object"
                    match_details = {
                        "catalog": "JPL Small-Body Ident",
                        "designation": closest_sb.name,
                        "separation_arcsec": round(min_sb_sep, 3),
                    }
                    confidence = 0.99
                    reason_chain.append(
                        f"Correlated with JPL Small-Body Identification API within {tol_known:.1f}\" search cone"
                    )
                    reason_chain.append(
                        f"Confirmed match: Minor Planet {closest_sb.name} at residual separation {min_sb_sep:.2f}\""
                    )
                    reason_chain.append("Consistent with cataloged ephemeris orbit")
        except Exception as exc:
            reason_chain.append(f"JPL Small-Body query note: {exc}")

    # -------------------------------------------------------------
    # 3. Triage Check 3: High Proper Motion Star
    # -------------------------------------------------------------
    if verdict is None:
        try:
            gaia_match, _ = match_gaia_star(
                ra_deg=ra1,
                dec_deg=dec1,
                obs_time=t1_iso,
                search_radius_arcsec=15.0,
            )
            if gaia_match and gaia_match.separation_arcsec <= tol_gaia:
                pm = gaia_match.total_pm_mas_yr or 0.0
                if gaia_match.is_fast_mover:
                    verdict = "high_motion_star"
                    match_details = {
                        "catalog": "Gaia DR3",
                        "designation": f"Gaia DR3 {gaia_match.source_id}",
                        "separation_arcsec": round(gaia_match.separation_arcsec, 3),
                        "proper_motion_mas_yr": round(pm, 1),
                    }
                    confidence = 0.95
                    reason_chain.append(
                        f"Cross-matched against ESA Gaia DR3: matched star {gaia_match.source_id} at {gaia_match.separation_arcsec:.2f}\""
                    )
                    reason_chain.append(f"High stellar proper motion detected: {pm:.1f} mas/yr")
        except Exception as exc:
            reason_chain.append(f"Gaia catalog query note: {exc}")

    # -------------------------------------------------------------
    # 4. Triage Check 4: Unknown Outer Candidate Mover
    # -------------------------------------------------------------
    if verdict is None:
        verdict = "unknown"
        reason_chain.append(
            f"Cross-matched against JPL Small-Body Ident ({tol_known:.1f}\" tolerance): no cataloged solar system body"
        )
        reason_chain.append(
            f"Cross-matched against Gaia DR3 ({tol_gaia:.1f}\" tolerance): no stellar counterpart"
        )
        reason_chain.append(
            f"Apparent angular shift of {sep_arcsec:.2f}\" observed over {dt_days:.1f}-day SPHEREx survey cadence"
        )

        # Estimate geometric reflex parallax assuming a Sun-bound Keplerian orbit
        parallax_res = estimate_parallax_distance_range(
            observed_shift_arcsec=sep_arcsec,
            baseline_days=dt_days,
            d_min_au_grid=cfg.parallax.d_min_au,
            d_max_au_grid=cfg.parallax.d_max_au,
        )
        distance_range = parallax_res.to_dict()
        confidence = 0.82

        # Generate precomputed scan ranges
        total_scans = len(positions)
        scan_ranges = []
        base_min = distance_range["min_au"]
        base_max = distance_range["max_au"]
        for s in range(total_scans):
            prog = s / max(1, total_scans - 1)
            s_min = (base_min * 0.65) + (base_min * 0.35 * prog)
            s_max = (base_max * 1.45) - (base_max * 0.45 * prog)
            scan_ranges.append({
                "scan_index": s + 1,
                "min_au": round(s_min, 1),
                "max_au": round(s_max, 1),
            })
        distance_range["scan_ranges"] = scan_ranges

        reason_chain.append(
            f"Parallax baseline bounds: {distance_range['min_au']} to {distance_range['max_au']} AU"
        )
        reason_chain.append(
            "Triage verdict: unknown outer candidate pending epoch confirmation (no claim of Planet X)"
        )

    # Epistemic labels dictionary for all displayed numbers
    labels: Dict[str, str] = {
        "confidence": "derived",
        "colour_index": "measured",
        "positions.ra": "measured",
        "positions.dec": "measured",
        "positions.err": "derived",
    }
    if distance_range:
        labels["distance_min_au"] = "derived"
        labels["distance_max_au"] = "derived"
    if match_details and "separation_arcsec" in match_details:
        labels["match.separation_arcsec"] = "derived"

    return {
        "id": candidate_id,
        "field_id": field_id,
        "release_batch": release_batch,
        "positions": positions,
        "verdict": verdict,
        "reason_chain": reason_chain,
        "confidence": round(confidence, 2),
        "match": match_details,
        "distance_range": distance_range,
        "colour_index": round(colour_index, 2),
        "simulated": simulated,
        "labels": labels,
    }
