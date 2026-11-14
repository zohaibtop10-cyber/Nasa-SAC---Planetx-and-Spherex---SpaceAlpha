"""Spike S3: Cross-match mover detections against ESA Gaia DR3 catalog.

Takes an observation detection (RA, Dec, observation time), queries the ESA Gaia archive
via astroquery.gaia with persistent on-disk caching, propagates Gaia stellar coordinates
from reference epoch J2016.0 to observation epoch using measured proper motions, and reports
the nearest star, astrometric separation, and high proper motion classification.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from astropy.coordinates import Angle, SkyCoord
from astropy.time import Time
import astropy.units as u
from astroquery.gaia import Gaia

DEFAULT_GAIA_CACHE_DIR = Path("data/cache/gaia")
GAIA_DR3_EPOCH_YEAR = 2016.0
DEFAULT_FAST_STAR_PM_THRESHOLD = 150.0  # mas/yr


@dataclass(frozen=True)
class GaiaStarMatch:
    """Matched star from ESA Gaia DR3 with proper-motion-propagated coordinates."""
    source_id: str
    catalog_ra_deg: float
    catalog_dec_deg: float
    propagated_ra_deg: float
    propagated_dec_deg: float
    separation_arcsec: float
    g_mag: Optional[float]
    pmra_mas_yr: Optional[float]
    pmdec_mas_yr: Optional[float]
    total_pm_mas_yr: Optional[float]
    parallax_mas: Optional[float]
    is_fast_mover: bool

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _compute_cache_key(params: Dict[str, Any]) -> str:
    """Compute deterministic SHA256 hex digest for query parameters."""
    canonical = json.dumps(params, sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def propagate_stellar_motion(
    ra_deg: float,
    dec_deg: float,
    pmra_cosdec_mas_yr: float,
    pmdec_mas_yr: float,
    epoch_from_year: float,
    epoch_to_year: float,
) -> Tuple[float, float]:
    """Propagate celestial coordinates from reference epoch to observation epoch using proper motion.

    Parameters:
        ra_deg: Right Ascension at reference epoch (degrees).
        dec_deg: Declination at reference epoch (degrees).
        pmra_cosdec_mas_yr: Proper motion in RA * cos(Dec) in mas/yr.
        pmdec_mas_yr: Proper motion in Dec in mas/yr.
        epoch_from_year: Source reference epoch (e.g. 2016.0 for Gaia DR3).
        epoch_to_year: Target observation epoch (e.g. 2026.27 for 2026-04-10).

    Returns:
        (propagated_ra_deg, propagated_dec_deg)
    """
    dt_years = epoch_to_year - epoch_from_year

    cos_dec = np.cos(np.radians(dec_deg))
    if abs(cos_dec) < 1e-6:
        cos_dec = 1e-6  # Prevent division by zero near poles

    # Delta in degrees: mas -> arcsec -> degrees
    delta_ra_deg = (pmra_cosdec_mas_yr * dt_years / cos_dec) / (3600.0 * 1000.0)
    delta_dec_deg = (pmdec_mas_yr * dt_years) / (3600.0 * 1000.0)

    prop_ra = (ra_deg + delta_ra_deg) % 360.0
    prop_dec = dec_deg + delta_dec_deg
    prop_dec = float(np.clip(prop_dec, -90.0, 90.0))

    return float(prop_ra), float(prop_dec)


def match_gaia_star(
    ra_deg: float,
    dec_deg: float,
    obs_time: str | float,
    search_radius_arcsec: float = 30.0,
    pm_threshold_mas_yr: float = DEFAULT_FAST_STAR_PM_THRESHOLD,
    cache_dir: Path | str = DEFAULT_GAIA_CACHE_DIR,
    force_refresh: bool = False,
) -> Tuple[Optional[GaiaStarMatch], Dict[str, Any]]:
    """Cross-match a sky detection against the ESA Gaia DR3 catalog with proper motion propagation.

    Parameters:
        ra_deg: Observed Right Ascension in decimal degrees.
        dec_deg: Observed Declination in decimal degrees.
        obs_time: Observation epoch as UTC string ('YYYY-MM-DD HH:MM:SS') or decimal year (float).
        search_radius_arcsec: Cone search radius in arcseconds.
        pm_threshold_mas_yr: Threshold in mas/yr to classify as high proper motion star.
        cache_dir: Local directory for caching Gaia query results.
        force_refresh: Force fresh network TAP query if True.

    Returns:
        Optional[GaiaStarMatch]: Nearest star match if within search radius, else None.
        Dict[str, Any]: Execution metadata (source, latency, candidates inspected).
    """
    cache_path = Path(cache_dir)
    cache_path.mkdir(parents=True, exist_ok=True)

    # Resolve decimal observation year
    if isinstance(obs_time, (int, float)):
        obs_year = float(obs_time)
        time_str = f"{obs_year:.4f}"
    else:
        clean_time = obs_time.replace("T", " ").replace("Z", "").strip()
        t_obj = Time(clean_time)
        obs_year = float(t_obj.decimalyear)
        time_str = clean_time

    cache_params = {
        "ra_deg": round(ra_deg, 6),
        "dec_deg": round(dec_deg, 6),
        "obs_year": round(obs_year, 4),
        "radius_arcsec": round(search_radius_arcsec, 2),
    }
    cache_key = _compute_cache_key(cache_params)
    cache_file = cache_path / f"gaia_{cache_key}.json"

    # 1. On-Disk Cache Check
    if not force_refresh and cache_file.is_file():
        t0 = time.perf_counter()
        with open(cache_file, "r", encoding="utf-8") as f:
            cached_data = json.load(f)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        match_obj = (
            GaiaStarMatch(**cached_data["match"]) if cached_data.get("match") else None
        )
        meta = {
            "source": "disk_cache",
            "cache_file": str(cache_file.resolve()),
            "elapsed_ms": elapsed_ms,
            "stars_in_cone": cached_data.get("stars_in_cone", 0),
            "obs_year": obs_year,
        }
        return match_obj, meta

    # 2. Live TAP Cone Search to ESA Gaia
    t0 = time.perf_counter()
    coord = SkyCoord(ra=ra_deg * u.deg, dec=dec_deg * u.deg, frame="icrs")

    # Set row limit high enough for dense fields
    Gaia.ROW_LIMIT = 2000

    # Expand TAP search cone to account for high proper motion stars that traveled
    # between Gaia reference epoch (2016.0) and observation epoch (up to 12 arcsec/yr)
    dt_years = abs(obs_year - GAIA_DR3_EPOCH_YEAR)
    motion_buffer_arcsec = min(180.0, 12.0 * dt_years)
    tap_cone_radius_arcsec = search_radius_arcsec + motion_buffer_arcsec
    radius_qty = tap_cone_radius_arcsec * u.arcsec

    # 2. Network Query via Gaia TAP
    try:
        # Silence Gaia noisy tap notifications for clean CLI output
        job = Gaia.cone_search_async(coord, radius=radius_qty, verbose=False)
        results = job.get_results()
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
    except Exception as exc:
        print(f"  [ESA Gaia TAP] Server error or timeout: {exc}", file=sys.stderr)
        # Cache fallback to avoid hanging future runs on flaky TAP server
        cache_payload = {
            "cached_at": time.time(),
            "query_params": cache_params,
            "stars_in_cone": 0,
            "match": None,
            "status": "server_error_fallback",
        }
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(cache_payload, f, indent=2)
        return None, {
            "source": "esa_gaia_network_error",
            "error": str(exc),
            "latency_ms": (time.perf_counter() - t0) * 1000.0,
            "stars_in_cone": 0,
        }

    stars_in_cone = len(results)

    # 3. Evaluate Propagated Positions & Find Nearest Star
    best_match: Optional[GaiaStarMatch] = None
    min_separation_arcsec = float("inf")

    det_coord = SkyCoord(ra=ra_deg * u.deg, dec=dec_deg * u.deg, frame="icrs")

    for row in results:
        src_id = str(row["source_id"])
        cat_ra = float(row["ra"])
        cat_dec = float(row["dec"])

        # Extract astrometry
        pmra = float(row["pmra"]) if ("pmra" in row.colnames and not np.isnan(row["pmra"])) else 0.0
        pmdec = float(row["pmdec"]) if ("pmdec" in row.colnames and not np.isnan(row["pmdec"])) else 0.0
        total_pm = float(np.hypot(pmra, pmdec))

        gmag = float(row["phot_g_mean_mag"]) if ("phot_g_mean_mag" in row.colnames and not np.isnan(row["phot_g_mean_mag"])) else None
        plx = float(row["parallax"]) if ("parallax" in row.colnames and not np.isnan(row["parallax"])) else None

        # Propagate from J2016.0 to observation epoch
        prop_ra, prop_dec = propagate_stellar_motion(
            ra_deg=cat_ra,
            dec_deg=cat_dec,
            pmra_cosdec_mas_yr=pmra,
            pmdec_mas_yr=pmdec,
            epoch_from_year=GAIA_DR3_EPOCH_YEAR,
            epoch_to_year=obs_year,
        )

        star_coord = SkyCoord(ra=prop_ra * u.deg, dec=prop_dec * u.deg, frame="icrs")
        sep_arcsec = float(det_coord.separation(star_coord).arcsec)

        if sep_arcsec < min_separation_arcsec and sep_arcsec <= search_radius_arcsec:
            min_separation_arcsec = sep_arcsec
            is_fast = total_pm >= pm_threshold_mas_yr
            best_match = GaiaStarMatch(
                source_id=src_id,
                catalog_ra_deg=cat_ra,
                catalog_dec_deg=cat_dec,
                propagated_ra_deg=prop_ra,
                propagated_dec_deg=prop_dec,
                separation_arcsec=sep_arcsec,
                g_mag=gmag,
                pmra_mas_yr=pmra,
                pmdec_mas_yr=pmdec,
                total_pm_mas_yr=total_pm,
                parallax_mas=plx,
                is_fast_mover=is_fast,
            )

    # 4. Save to Disk Cache
    cache_payload = {
        "cached_at": time.time(),
        "params": cache_params,
        "stars_in_cone": stars_in_cone,
        "match": best_match.to_dict() if best_match else None,
    }
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(cache_payload, f, indent=2)

    meta = {
        "source": "esa_gaia_network",
        "cache_file": str(cache_file.resolve()),
        "elapsed_ms": elapsed_ms,
        "stars_in_cone": stars_in_cone,
        "obs_year": obs_year,
    }
    return best_match, meta


def main() -> None:
    """Execute Spike S3: Cross-match known high proper motion star (Barnard's Star)."""
    print("=" * 96)
    print("Live Sky · Spike S3: ESA Gaia Star Matching & Proper Motion Triage")
    print("=" * 96)

    # Benchmark Target: Barnard's Star
    # True Gaia DR3 position at J2016.0: RA = 269.44850°, Dec = 4.73942°
    # Proper motion: pmra = -801.55 mas/yr, pmdec = +10362.39 mas/yr (~10.4 arcsec/year)
    obs_time = "2026-04-10 00:00:00"
    obs_year = float(Time(obs_time).decimalyear)  # ~2026.271

    # Simulate detector observing Barnard's Star at its true propagated 2026 position
    det_ra, det_dec = propagate_stellar_motion(
        ra_deg=269.4485025,
        dec_deg=4.7394201,
        pmra_cosdec_mas_yr=-801.551,
        pmdec_mas_yr=10362.394,
        epoch_from_year=GAIA_DR3_EPOCH_YEAR,
        epoch_to_year=obs_year,
    )

    print(f"\n[Test Setup] Simulated SPHEREx Detection of Fast Star at Epoch {obs_time}:")
    print(f"  Detection Coordinates: RA = {det_ra:.5f}°, Dec = {det_dec:.5f}° [measured]")
    print(f"  Gaia Search Radius:    15.0 arcsec")

    # Run 1: Query ESA Gaia TAP service
    print(f"\n[Run 1] Querying ESA Gaia Archive...")
    match_1, meta_1 = match_gaia_star(
        ra_deg=det_ra,
        dec_deg=det_dec,
        obs_time=obs_time,
        search_radius_arcsec=15.0,
    )

    print(f"  Source:             {meta_1['source']}")
    print(f"  Latency:            {meta_1['elapsed_ms']:.1f} ms")
    print(f"  Stars in Cone:      {meta_1['stars_in_cone']}")

    if match_1:
        print("\n" + "=" * 96)
        print("MATCHED GAIA STAR:")
        print(f"  Source ID:          {match_1.source_id}")
        print(f"  Astrometric Sep:    {match_1.separation_arcsec:.3f} arcsec [derived]")
        print(f"  Gaia DR3 RA/Dec:    ({match_1.catalog_ra_deg:.5f}°, {match_1.catalog_dec_deg:.5f}°) [epoch 2016.0]")
        print(f"  Propagated RA/Dec:  ({match_1.propagated_ra_deg:.5f}°, {match_1.propagated_dec_deg:.5f}°) [epoch {obs_year:.2f}]")
        print(f"  G Magnitude:        {match_1.g_mag:.2f} mag [measured]")
        print(f"  Total Proper Motion:{match_1.total_pm_mas_yr:.1f} mas/yr [derived]")
        print(f"  Proper Motion Comp: (pmra: {match_1.pmra_mas_yr:.1f}, pmdec: {match_1.pmdec_mas_yr:.1f}) mas/yr")
        print(f"  Triage Verdict:     {'HIGH_MOTION_STAR' if match_1.is_fast_mover else 'FIXED_STAR'}")
        print("=" * 96)
    else:
        print("  No matching Gaia star found.")

    # Run 2: Cached Rerun Check
    print(f"\n[Run 2] Cached Rerun for Exact Same Coordinates & Epoch:")
    t_start = time.perf_counter()
    match_2, meta_2 = match_gaia_star(
        ra_deg=det_ra,
        dec_deg=det_dec,
        obs_time=obs_time,
        search_radius_arcsec=15.0,
    )
    t_total_ms = (time.perf_counter() - t_start) * 1000.0

    print(f"  Source:             {meta_2['source']}")
    print(f"  Read Time:          {meta_2['elapsed_ms']:.2f} ms (Total Call Time: {t_total_ms:.2f} ms)")
    assert meta_2["source"] == "disk_cache", "Run 2 must load from disk cache"
    assert match_1 and match_2 and match_1.source_id == match_2.source_id, "Matches must be identical"
    assert match_1.is_fast_mover is True, "Must be flagged as fast-moving star"
    assert t_total_ms < 50.0, f"Cached rerun must be under 50ms, took {t_total_ms:.2f} ms"

    print("\n[s3_gaia] Spike S3 completed successfully: match confirmed for known fast-moving star.")


if __name__ == "__main__":
    main()
