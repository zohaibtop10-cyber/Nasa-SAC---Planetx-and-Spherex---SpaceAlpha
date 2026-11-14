"""Spike S2: Cross-match sky fields against NASA/JPL Small-Body Identification API.

Queries https://ssd-api.jpl.nasa.gov/sb_ident.api for known asteroids and comets within
a specified field of view and epoch, returning predicted astrometric RA/Dec and magnitudes
with on-disk persistent caching.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import requests
from astropy.coordinates import Angle
import astropy.units as u

JPL_SB_IDENT_URL = "https://ssd-api.jpl.nasa.gov/sb_ident.api"
DEFAULT_CACHE_DIR = Path("data/cache/sb_ident")


@dataclass(frozen=True)
class KnownAsteroid:
    """Predicted observation of a known solar system small body from NASA/JPL."""
    name: str
    predicted_ra_deg: float
    predicted_dec_deg: float
    ra_str: str
    dec_str: str
    vmag: Optional[float]
    dist_from_center_arcsec: Optional[float]
    rate_ra_arcsec_hr: Optional[float]
    rate_dec_arcsec_hr: Optional[float]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def deg_to_sexagesimal(ra_deg: float, dec_deg: float) -> Tuple[str, str]:
    """Convert decimal degrees to sexagesimal format required by JPL sb_ident:

    RA: 'hh-mm-ss.ss'
    Dec: '±dd-mm-ss.ss'
    """
    ra_angle = Angle(ra_deg, unit=u.deg)
    dec_angle = Angle(dec_deg, unit=u.deg)

    ra_str = ra_angle.to_string(unit=u.hour, sep="-", precision=2, pad=True)
    dec_str = dec_angle.to_string(unit=u.deg, sep="-", precision=2, alwayssign=True, pad=True)
    return ra_str, dec_str


def parse_jpl_ra_dec(ra_str: str, dec_str: str) -> Tuple[float, float]:
    """Parse JPL return strings into decimal degrees.

    Supports:
      RA: 'hh:mm:ss', 'hh mm ss', or 'hh-mm-ss'
      Dec: '±dd mm'ss"', '±dd:mm:ss', or '±dd-mm-ss'
    """
    clean_ra = ra_str.strip().replace(":", " ").replace("-", " ")
    ra_parts = [float(p) for p in clean_ra.split() if p]
    if len(ra_parts) >= 3:
        ra_hours = ra_parts[0] + ra_parts[1] / 60.0 + ra_parts[2] / 3600.0
    elif len(ra_parts) == 2:
        ra_hours = ra_parts[0] + ra_parts[1] / 60.0
    elif len(ra_parts) == 1:
        ra_hours = ra_parts[0]
    else:
        raise ValueError(f"Cannot parse RA: '{ra_str}'")
    ra_deg = (ra_hours * 15.0) % 360.0

    s = dec_str.strip()
    sign = -1.0 if s.startswith("-") else 1.0
    if s.startswith("-") or s.startswith("+"):
        s = s[1:]
    s = s.replace(":", " ").replace("-", " ").replace("d", " ").replace("'", " ").replace('"', " ").replace("m", " ").replace("s", " ")
    dec_parts = [float(p) for p in s.split() if p]
    if len(dec_parts) >= 3:
        dec_deg = sign * (dec_parts[0] + dec_parts[1] / 60.0 + dec_parts[2] / 3600.0)
    elif len(dec_parts) == 2:
        dec_deg = sign * (dec_parts[0] + dec_parts[1] / 60.0)
    elif len(dec_parts) == 1:
        dec_deg = sign * dec_parts[0]
    else:
        raise ValueError(f"Cannot parse Dec: '{dec_str}'")

    return float(ra_deg), float(dec_deg)


def _compute_cache_key(params: Dict[str, Any]) -> str:
    """Compute deterministic SHA256 hex digest for query parameters."""
    canonical = json.dumps(params, sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def query_known_asteroids(
    ra_deg: float,
    dec_deg: float,
    obs_time: str,
    fov_hwidth_deg: float = 0.5,
    vmag_lim: float = 22.0,
    mpc_code: str = "500",
    cache_dir: Path | str = DEFAULT_CACHE_DIR,
    force_refresh: bool = False,
    timeout_sec: float = 60.0,
) -> Tuple[List[KnownAsteroid], Dict[str, Any]]:
    """Query NASA/JPL SB Identification API with persistent on-disk caching.

    Parameters:
        ra_deg: Field center Right Ascension in decimal degrees (J2000).
        dec_deg: Field center Declination in decimal degrees (J2000).
        obs_time: Observation epoch in UTC (e.g. 'YYYY-MM-DD HH:MM:SS').
        fov_hwidth_deg: Half-width of FOV box in degrees.
        vmag_lim: Visual magnitude faint limit.
        mpc_code: MPC observer location ('500' = Geocentric).
        cache_dir: Directory for cached responses.
        force_refresh: Bypass cache if True.
        timeout_sec: HTTP timeout limit.

    Returns:
        List[KnownAsteroid]: Structured list of predicted asteroids in the field.
        Dict[str, Any]: Query metadata including source ('disk_cache' or 'nasa_jpl_network')
                        and elapsed latency.
    """
    cache_path = Path(cache_dir)
    cache_path.mkdir(parents=True, exist_ok=True)

    # Format observation time to 'YYYY-MM-DD HH:MM:SS'
    clean_time = obs_time.replace("T", " ").replace("Z", "").strip()
    if "." in clean_time:
        clean_time = clean_time.split(".")[0]
    if len(clean_time) == 10:
        clean_time = f"{clean_time} 00:00:00"

    ra_sex, dec_sex = deg_to_sexagesimal(ra_deg, dec_deg)

    query_params = {
        "mpc-code": str(mpc_code),
        "obs-time": clean_time,
        "fov-ra-center": ra_sex,
        "fov-dec-center": dec_sex,
        "fov-ra-hwidth": f"{fov_hwidth_deg:.4f}",
        "fov-dec-hwidth": f"{fov_hwidth_deg:.4f}",
        "vmag-lim": f"{vmag_lim:.1f}",
    }

    cache_key = _compute_cache_key(query_params)
    cache_file = cache_path / f"sb_ident_{cache_key}.json"

    # 1. On-Disk Cache Check
    if not force_refresh and cache_file.is_file():
        t0 = time.perf_counter()
        with open(cache_file, "r", encoding="utf-8") as f:
            cached_payload = json.load(f)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        asteroids = [
            KnownAsteroid(**item) for item in cached_payload.get("asteroids", [])
        ]
        meta = {
            "source": "disk_cache",
            "cache_file": str(cache_file.resolve()),
            "elapsed_ms": elapsed_ms,
            "count": len(asteroids),
            "obs_time": clean_time,
            "center_ra_deg": ra_deg,
            "center_dec_deg": dec_deg,
        }
        return asteroids, meta

    # 2. Live HTTP Query to NASA/JPL
    t0 = time.perf_counter()
    headers = {"User-Agent": "LiveSky-SPHEREx-Pipeline/0.1.0"}
    res = requests.get(JPL_SB_IDENT_URL, params=query_params, headers=headers, timeout=timeout_sec)
    network_elapsed_ms = (time.perf_counter() - t0) * 1000.0

    if not res.ok:
        try:
            err_json = res.json()
            err_msg = err_json.get("message", res.text)
        except Exception:
            err_msg = res.text
        raise RuntimeError(f"NASA/JPL SB Ident API returned HTTP {res.status_code}: {err_msg}")

    raw_data = res.json()

    # 3. Parse Response Data
    fields = raw_data.get("fields_first") or raw_data.get("fields") or []
    rows = raw_data.get("data_first_pass") or raw_data.get("data") or []

    field_map = {name: idx for idx, name in enumerate(fields)}

    name_idx = field_map.get("Object name", 0)
    ra_idx = field_map.get("Astrometric RA (hh:mm:ss)", 1)
    dec_idx = field_map.get("Astrometric Dec (dd mm'ss\")", 2)
    dist_idx = field_map.get("Dist. from center Norm (\")", 5)
    vmag_idx = field_map.get("Visual magnitude (V)", 6)
    rate_ra_idx = field_map.get("RA rate (\"/h)", 7)
    rate_dec_idx = field_map.get("Dec rate (\"/h)", 8)

    parsed_asteroids: List[KnownAsteroid] = []
    for row in rows:
        obj_name = str(row[name_idx]).strip()
        obj_ra_str = str(row[ra_idx]).strip()
        obj_dec_str = str(row[dec_idx]).strip()

        try:
            ra_val, dec_val = parse_jpl_ra_dec(obj_ra_str, obj_dec_str)
        except Exception:
            continue

        def _safe_float(val: Any) -> Optional[float]:
            try:
                f = float(val)
                return None if (np.isnan(f) or np.isinf(f)) else f
            except (ValueError, TypeError):
                return None

        vmag_val = _safe_float(row[vmag_idx]) if vmag_idx < len(row) else None
        dist_val = _safe_float(row[dist_idx]) if dist_idx < len(row) else None
        rate_ra_val = _safe_float(row[rate_ra_idx]) if rate_ra_idx < len(row) else None
        rate_dec_val = _safe_float(row[rate_dec_idx]) if rate_dec_idx < len(row) else None

        asteroid = KnownAsteroid(
            name=obj_name,
            predicted_ra_deg=ra_val,
            predicted_dec_deg=dec_val,
            ra_str=obj_ra_str,
            dec_str=obj_dec_str,
            vmag=vmag_val,
            dist_from_center_arcsec=dist_val,
            rate_ra_arcsec_hr=rate_ra_val,
            rate_dec_arcsec_hr=rate_dec_val,
        )
        parsed_asteroids.append(asteroid)

    # Sort by separation from FOV center
    parsed_asteroids.sort(
        key=lambda a: a.dist_from_center_arcsec if a.dist_from_center_arcsec is not None else float("inf")
    )

    # 4. Save to Disk Cache
    cache_payload = {
        "cached_at": time.time(),
        "query_params": query_params,
        "count": len(parsed_asteroids),
        "asteroids": [a.to_dict() for a in parsed_asteroids],
    }
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(cache_payload, f, indent=2)

    meta = {
        "source": "nasa_jpl_network",
        "cache_file": str(cache_file.resolve()),
        "elapsed_ms": network_elapsed_ms,
        "count": len(parsed_asteroids),
        "obs_time": clean_time,
        "center_ra_deg": ra_deg,
        "center_dec_deg": dec_deg,
    }
    return parsed_asteroids, meta


def print_asteroid_table(asteroids: List[KnownAsteroid], max_rows: int = 12) -> None:
    """Print formatted summary table of detected known asteroids with epistemic labels."""
    print("\n" + "=" * 96)
    print(f"{'Target Designation':<28} {'Pred RA (deg)':<15} {'Pred Dec (deg)':<15} {'Dist (\")':<10} {'Vmag':<8} {'Rate (\'/h)'}")
    print("-" * 96)
    for ast in asteroids[:max_rows]:
        dist_str = f"{ast.dist_from_center_arcsec:.1f}" if ast.dist_from_center_arcsec is not None else "-"
        vmag_str = f"{ast.vmag:.1f}" if ast.vmag is not None else "-"
        rate_str = f"{ast.rate_ra_arcsec_hr:.1f}, {ast.rate_dec_arcsec_hr:.1f}" if ast.rate_ra_arcsec_hr is not None else "-"
        print(f"{ast.name:<28} {ast.predicted_ra_deg:<15.4f} {ast.predicted_dec_deg:<15.4f} {dist_str:<10} {vmag_str:<8} {rate_str}")

    if len(asteroids) > max_rows:
        print(f"... and {len(asteroids) - max_rows} additional known small bodies in field.")
    print("=" * 96)
    print("Labels: Pred RA/Dec [derived from orbital ephemeris], Vmag [derived], Dist [derived]")
    print("=" * 96 + "\n")


def main() -> None:
    """Execute Spike S2 with live fetch and instant cached rerun check."""
    print("=" * 96)
    print("Live Sky · Spike S2: NASA/JPL Small-Body Identification & Caching")
    print("=" * 96)

    # Benchmark test field near ecliptic plane on 2026-04-10
    test_ra = 354.3429
    test_dec = -4.9898
    test_time = "2026-04-10 00:00:00"
    test_hwidth = 0.3  # 0.3 degree half-width (0.6° x 0.6° survey box)
    test_vmag = 18.0

    print(f"\n[Run 1] Query for Field (RA: {test_ra}°, Dec: {test_dec}°) at Epoch: {test_time}")
    asteroids_1, meta_1 = query_known_asteroids(
        ra_deg=test_ra,
        dec_deg=test_dec,
        obs_time=test_time,
        fov_hwidth_deg=test_hwidth,
        vmag_lim=test_vmag,
        timeout_sec=60.0,
    )
    print(f"  Source:      {meta_1['source']}")
    print(f"  Latency:     {meta_1['elapsed_ms']:.1f} ms")
    print(f"  Found:       {meta_1['count']} known small bodies")
    print(f"  Cache File:  {meta_1['cache_file']}")

    print_asteroid_table(asteroids_1, max_rows=8)

    # Benchmark cached rerun
    print(f"[Run 2] Cached Rerun for Exact Same Field & Epoch:")
    t_start = time.perf_counter()
    asteroids_2, meta_2 = query_known_asteroids(
        ra_deg=test_ra,
        dec_deg=test_dec,
        obs_time=test_time,
        fov_hwidth_deg=test_hwidth,
        vmag_lim=test_vmag,
    )
    t_total_ms = (time.perf_counter() - t_start) * 1000.0

    print(f"  Source:      {meta_2['source']}")
    print(f"  Read Time:   {meta_2['elapsed_ms']:.2f} ms (Total Call Time: {t_total_ms:.2f} ms)")
    print(f"  Found:       {meta_2['count']} known small bodies")
    assert meta_2["source"] == "disk_cache", "Run 2 must load from disk cache"
    assert len(asteroids_2) == len(asteroids_1), "Cached data count must match network data count"
    assert t_total_ms < 50.0, f"Cached rerun must be under 50ms, took {t_total_ms:.2f} ms"
    print("\n[s2_known] Spike S2 completed successfully: known objects verified and cache verified instant (< 50ms).")


if __name__ == "__main__":
    main()
