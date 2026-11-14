#!/usr/bin/env python3
"""
Spike S1: Fetch NASA SPHEREx Data Using Official IRSA SIA2 and Cutout APIs.

NASA Space Apps Challenge 2026 · Planet X and SPHEREx · Live Sky
Non-negotiable compliance:
1. Every displayed number MUST have an epistemic label: measured, derived, or assumed.
2. All 3D/2D visual models MUST be tagged 'Illustrative'.
3. NO claims of discovering Planet X.
4. Reads from official unauthenticated NASA/IPAC IRSA SIA2 and Cutout APIs.

Workflow:
1. Defines the 5 MVP celestial targets with standard astropy SkyCoord (ICRS):
   - Comet 3I/ATLAS
   - Barnard's Star
   - Epsilon Indi B
   - WISE 0855
   - RW Aurigae
2. Queries the IRSA SIA2 service (collection=['spherex_qr3', 'spherex_dr1']) using astroquery.irsa.
   Gracefully handles collection fallbacks if 'spherex_qr3' is empty for a target.
3. Extracts access_url and appends IRSA Cutout Service query parameters:
   ?center={ra},{dec}&size=0.1 (in degrees)
4. Downloads the specific cutout to data/raw/ with local disk caching.
5. Inspects HDUs via astropy.io.fits, displaying extension names, shapes,
   and headers for image data (IMAGE), variance map (VARIANCE), and pixel bitmasks (FLAGS).
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import astropy.units as u
import requests
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astroquery.irsa import Irsa


# ---------------------------------------------------------------------------
# Target Definitions
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class TargetDef:
    name: str
    coord: SkyCoord
    description: str

    @property
    def ra_deg(self) -> float:
        return float(self.coord.ra.deg)

    @property
    def dec_deg(self) -> float:
        return float(self.coord.dec.deg)


MVP_TARGETS: Dict[str, TargetDef] = {
    "3I": TargetDef(
        name="Comet 3I/ATLAS",
        coord=SkyCoord(ra=280.1160 * u.deg, dec=-19.7913 * u.deg, frame="icrs"),
        description="Incoming interstellar / hyperbolic solar system small-body candidate",
    ),
    "barnard": TargetDef(
        name="Barnard's Star",
        coord=SkyCoord(ra=269.4521 * u.deg, dec=4.6934 * u.deg, frame="icrs"),
        description="High proper motion red dwarf calibration benchmark (mu = 10,393 mas/yr)",
    ),
    "eps_indi_b": TargetDef(
        name="Epsilon Indi B",
        coord=SkyCoord(ra=330.8404 * u.deg, dec=-56.7861 * u.deg, frame="icrs"),
        description="Sub-stellar binary brown dwarf benchmark system (Epsilon Indi Ba/Bb)",
    ),
    "wise0855": TargetDef(
        name="WISE 0855",
        coord=SkyCoord(ra=133.8562 * u.deg, dec=-7.2415 * u.deg, frame="icrs"),
        description="Extremely cold sub-stellar Y-type brown dwarf (T ~ 250 K)",
    ),
    "rw_aur": TargetDef(
        name="RW Aurigae",
        coord=SkyCoord(ra=76.9563 * u.deg, dec=30.4014 * u.deg, frame="icrs"),
        description="Classical T Tauri variable star with profound infrared accretion dips",
    ),
}


# ---------------------------------------------------------------------------
# IRSA SIA2 Query Service
# ---------------------------------------------------------------------------

def query_spherex_sia2(
    coord: SkyCoord,
    radius_deg: float = 0.05,
    collections: Optional[List[str]] = None,
) -> Any:
    """Query the official unauthenticated NASA/IPAC IRSA SIA2 service for SPHEREx images.

    Handles exceptions and empty tables gracefully by falling back through
    the requested collections ('spherex_qr3' -> 'spherex_dr1').
    """
    if collections is None:
        collections = ["spherex_qr3", "spherex_dr1"]

    radius_quantity = radius_deg * u.deg
    pos = (coord, radius_quantity)

    print(f"[s1_fetch_spherex] Querying IRSA SIA2 at RA: {coord.ra.deg:.4f}° [measured], Dec: {coord.dec.deg:.4f}° [measured]")
    print(f"[s1_fetch_spherex] Search radius: {radius_deg:.3f}° [assumed]")

    # 1. Attempt multi-collection query first
    try:
        print(f"[s1_fetch_spherex] Attempting primary SIA2 query for collections: {collections}...")
        table = Irsa.query_sia(pos=pos, collection=collections)
        if table is not None and len(table) > 0:
            print(f"[s1_fetch_spherex] Found {len(table)} [measured] SIA2 records matching collections: {collections}")
            return table
        print(f"[s1_fetch_spherex] Primary query returned 0 rows. Falling back to individual collection queries...")
    except Exception as exc:
        print(f"[s1_fetch_spherex] Primary SIA2 query encountered notice: {exc}. Retrying collection-by-collection...")

    # 2. Sequential fallback through individual collections
    for coll in collections:
        try:
            print(f"[s1_fetch_spherex] Querying IRSA SIA2 for collection: '{coll}'...")
            table = Irsa.query_sia(pos=pos, collection=coll)
            if table is not None and len(table) > 0:
                print(f"[s1_fetch_spherex] Found {len(table)} [measured] records in collection '{coll}'")
                return table
            print(f"[s1_fetch_spherex] Collection '{coll}' returned 0 matches for this position.")
        except Exception as exc:
            print(f"[s1_fetch_spherex] Query for collection '{coll}' returned notice: {exc}")

    raise RuntimeError(
        f"No SPHEREx SIA2 records found at coordinates ({coord.ra.deg:.4f}°, {coord.dec.deg:.4f}°) across collections {collections}."
    )


# ---------------------------------------------------------------------------
# IRSA Cutout Download & Caching
# ---------------------------------------------------------------------------

def fetch_spherex_cutout(
    sia_table: Any,
    coord: SkyCoord,
    cutout_size_deg: float = 0.1,
    output_dir: Path | str = "data/raw",
    filename_prefix: str = "spherex_cutout",
) -> Path:
    """Extract access_url from SIA2 table, append cutout parameters, and download with disk caching.

    IRSA Cutout API specification:
      {access_url}?center={ra_deg},{dec_deg}&size={size_deg}
    """
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    ra = coord.ra.deg
    dec = coord.dec.deg

    # Check candidates in the SIA2 table for valid spatial overlap
    num_rows = len(sia_table)
    print(f"[s1_fetch_spherex] Inspecting {num_rows} [measured] available SPHEREx Level 2 image products...")

    chosen_url: Optional[str] = None
    target_fits_name: Optional[str] = None

    for i in range(num_rows):
        raw_url = str(sia_table["access_url"][i]).strip()
        obs_id = str(sia_table["obs_id"][i]) if "obs_id" in sia_table.colnames else f"row_{i}"
        base_name = raw_url.split("/")[-1] or f"spherex_{obs_id}.fits"
        local_filename = f"{filename_prefix}_{base_name}"
        cached_file = out_dir / local_filename

        # If already cached locally, return immediately
        if cached_file.is_file() and cached_file.stat().st_size > 10_000:
            print(f"[s1_fetch_spherex] Using cached FITS cutout: {cached_file.resolve()} ({cached_file.stat().st_size:,} bytes [measured])")
            return cached_file

        # Format IRSA Cutout URL
        sep = "&" if "?" in raw_url else "?"
        cutout_url = f"{raw_url}{sep}center={ra:.4f},{dec:.4f}&size={cutout_size_deg}"

        print(f"[s1_fetch_spherex] Testing IRSA Cutout URL (row {i + 1}/{num_rows}):\n  {cutout_url}")
        try:
            resp = requests.get(cutout_url, stream=True, timeout=45)
            if resp.status_code == 200 and len(resp.content) > 10_000:
                print(f"[s1_fetch_spherex] HTTP 200 OK! Received {len(resp.content):,} bytes [measured]")
                with open(cached_file, "wb") as f:
                    f.write(resp.content)
                print(f"[s1_fetch_spherex] Saved FITS cutout to: {cached_file.resolve()}")
                return cached_file
            elif resp.status_code == 422 and "Arrays do not overlap" in resp.text:
                # Expected when detector edge does not encompass cutout box
                continue
            else:
                print(f"[s1_fetch_spherex] Row {i}: HTTP {resp.status_code} ({resp.reason}). Continuing search...")
        except Exception as exc:
            print(f"[s1_fetch_spherex] Row {i} request error: {exc}. Trying next...")

    raise RuntimeError(
        f"Failed to retrieve an overlapping SPHEREx cutout across {num_rows} candidates for RA={ra:.4f}°, Dec={dec:.4f}°."
    )


# ---------------------------------------------------------------------------
# FITS Structure Inspection
# ---------------------------------------------------------------------------

def inspect_fits_file(fits_path: Path | str) -> None:
    """Open downloaded FITS file and print header metadata and extensions (IMAGE, VARIANCE, FLAGS)."""
    p = Path(fits_path)
    if not p.is_file():
        raise FileNotFoundError(f"FITS file not found: {p}")

    print("\n" + "=" * 78)
    print(f"SPHEREx FITS CUTOUT INSPECTION: {p.name}")
    print(f"File size: {p.stat().st_size:,} bytes [measured]")
    print("=" * 78)

    with fits.open(p) as hdul:
        print("\n--- HDU List Overview ---")
        hdul.info()

        print("\n--- Detailed Extension Breakdown ---")
        for i, hdu in enumerate(hdul):
            name = hdu.name or f"HDU_{i}"
            shape = getattr(hdu, "shape", None)
            dtype = getattr(hdu, "data", None).dtype if getattr(hdu, "data", None) is not None else None

            print(f"\n[Extension {i}] Name: '{name}' | Type: {type(hdu).__name__}")
            print(f"  Dimensions: {shape} [measured] | Data Type: {dtype}")

            # Highlight core science extensions
            if name.upper() in ["IMAGE", "SCI", "PRIMARY"] and shape:
                print("  Role: Primary Spectrophotometric Science Pixel Data")
                bunit = hdu.header.get("BUNIT", "Unknown")
                exptime = hdu.header.get("EXPTIME", "Unknown")
                print(f"  Flux Unit: {bunit} | Exposure Time: {exptime} s [measured]")
                if hdu.data is not None:
                    finite_vals = hdu.data[np.isfinite(hdu.data)]
                    if len(finite_vals) > 0:
                        print(f"  Flux Min: {np.min(finite_vals):.4f} [measured], Max: {np.max(finite_vals):.4f} [measured], Median: {np.median(finite_vals):.4f} [derived]")

            elif name.upper() in ["VARIANCE", "VAR", "UNCERT", "ERR"] and shape:
                print("  Role: Measurement Variance / Noise Estimation Map (sigma^2)")
                if hdu.data is not None:
                    finite_vals = hdu.data[np.isfinite(hdu.data)]
                    if len(finite_vals) > 0:
                        print(f"  Variance Min: {np.min(finite_vals):.4e} [measured], Median: {np.median(finite_vals):.4e} [derived]")

            elif name.upper() in ["FLAGS", "FLAG", "MASK", "BITMASK"] and shape:
                print("  Role: Data Quality & Pixel Masking Bitmask")
                if hdu.data is not None:
                    unique_flags = np.unique(hdu.data)
                    print(f"  Unique Bitmask Flags Encountered: {unique_flags.tolist()} [measured]")

            elif name.upper() == "ZODI":
                print("  Role: Modeled Zodiacal Light Background Emission Map")
            elif name.upper() == "EPSF":
                print("  Role: Empirical Point Spread Function (ePSF) Table")
            elif name.upper() == "WCS-WAVE":
                print("  Role: Spectrophotometric Wavelength Calibration Table")

            # Print representative header cards
            header_keys = ["TELESCOP", "INSTRUME", "OBJECT", "FILTER", "DATE-OBS", "EQUINOX", "CRVAL1", "CRVAL2", "CDELT1", "CDELT2"]
            cards = [f"{k}={hdu.header[k]}" for k in header_keys if k in hdu.header]
            if cards:
                print("  Key Header Cards: " + ", ".join(cards[:6]))

    print("\n" + "=" * 78)
    print("FITS Cutout Inspection Successfully Completed!")
    print("=" * 78 + "\n")


# ---------------------------------------------------------------------------
# CLI Entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch NASA SPHEREx Cutout via official IRSA SIA2 & Cutout APIs (Live Sky Spike S1)"
    )
    parser.add_argument(
        "--target",
        type=str,
        default="barnard",
        choices=list(MVP_TARGETS.keys()),
        help="Target key to fetch (default: barnard). Available: " + ", ".join(MVP_TARGETS.keys()),
    )
    parser.add_argument(
        "--size",
        type=float,
        default=0.1,
        help="Cutout size in degrees (default: 0.1 deg)",
    )
    parser.add_argument(
        "--outdir",
        type=str,
        default="data/raw",
        help="Local directory to cache cutout FITS files (default: data/raw)",
    )
    args = parser.parse_args()

    target = MVP_TARGETS[args.target]
    print("=" * 78)
    print("LIVE SKY · NASA SPHEREx OFFICIAL IRSA SIA2 & CUTOUT FETCH SPIKE (S1)")
    print(f"Selected Target: {target.name} ({target.description})")
    print(f"Equatorial Coordinates: RA = {target.ra_deg:.4f}° [measured], Dec = {target.dec_deg:.4f}° [measured]")
    print(f"Cutout Size: {args.size:.3f}° [assumed]")
    print(f"Cache Directory: {args.outdir}")
    print("=" * 78 + "\n")

    # 1. Query IRSA SIA2
    sia_table = query_spherex_sia2(
        coord=target.coord,
        radius_deg=0.05,
        collections=["spherex_qr3", "spherex_dr1"],
    )

    # 2. Download and cache Cutout
    fits_path = fetch_spherex_cutout(
        sia_table=sia_table,
        coord=target.coord,
        cutout_size_deg=args.size,
        output_dir=args.outdir,
        filename_prefix=f"spx_{args.target}",
    )

    # 3. Open and inspect FITS structure
    inspect_fits_file(fits_path)


if __name__ == "__main__":
    import numpy as np
    main()
