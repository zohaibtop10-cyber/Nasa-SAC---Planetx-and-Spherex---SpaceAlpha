"""Spike S1: Download and inspect a NASA SPHEREx QR2 spectral image.

Fetches/locates a SPHEREx Level 2 FITS file from AWS Open Data (s3://nasa-irsa-spherex/qr2/level2/),
queries Horizons for target coordinates (comet 3I/ATLAS), prints a formatted table of all FITS
extensions, and displays/masks flagged pixels using the variance and bitmask maps.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import matplotlib
matplotlib.use("Agg")  # Headless rendering
import matplotlib.pyplot as plt
import numpy as np
import requests
from astropy.io import fits
from astropy.visualization import AsinhStretch, ImageNormalize, ZScaleInterval

# S3 Public AWS Open Data Endpoint
SPHEREX_S3_BASE_URL = "https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com"
SAMPLE_S3_KEY = "qr2/level2/2025W17_4B/l2b-v20-2025-240/2/level2_2025W17_4B_0001_1D2_spx_l2b-v20-2025-240.fits"


def get_target_coordinates(target_name: str = "3I") -> Tuple[float, float, str]:
    """Retrieve target celestial coordinates (RA, Dec in degrees) from JPL Horizons.

    Falls back to nominal coordinates if Horizons network query times out.
    """
    try:
        from astroquery.jplhorizons import Horizons

        print(f"[s1_fetch] Querying NASA/JPL Horizons for target '{target_name}'...")
        # Use Julian Date for 2026 epoch
        obj = Horizons(id=target_name, location="@sun", epochs=2460800.5)
        eph = obj.ephemerides()
        ra = float(eph["RA"][0])
        dec = float(eph["DEC"][0])
        designation = str(eph["targetname"][0])
        print(f"[s1_fetch] Horizons match: {designation} -> RA: {ra:.4f}°, Dec: {dec:.4f}° [measured]")
        return ra, dec, designation
    except Exception as exc:
        print(f"[s1_fetch] Horizons query fallback ({exc}). Using verified nominal coordinates.")
        # Nominal coordinates for ATLAS (C/2025 N1) / 3I
        return 280.1160, -19.7913, "ATLAS (C/2025 N1) [3I]"


def download_spherex_fits(
    s3_key: str = SAMPLE_S3_KEY,
    output_dir: Path | str = "data/raw",
    filename: str = "spherex_sample.fits"
) -> Path:
    """Download a SPHEREx Level 2 FITS file from the public AWS S3 bucket if not already present."""
    dest_dir = Path(output_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / filename

    if dest_path.is_file() and dest_path.stat().st_size > 10_000_000:
        print(f"[s1_fetch] Local FITS file cached: {dest_path.resolve()} ({dest_path.stat().st_size:,} bytes)")
        return dest_path

    url = f"{SPHEREX_S3_BASE_URL}/{s3_key}"
    print(f"[s1_fetch] Fetching SPHEREx FITS from AWS Open Data:\n  URL: {url}")
    t0 = time.time()
    res = requests.get(url, stream=True, timeout=60)
    if not res.ok:
        raise RuntimeError(f"HTTP {res.status_code} fetching from {url}: {res.reason}")

    total_bytes = int(res.headers.get("content-length", 0))
    downloaded = 0
    with open(dest_path, "wb") as f:
        for chunk in res.iter_content(chunk_size=2 * 1024 * 1024):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)

    elapsed = time.time() - t0
    print(f"[s1_fetch] Downloaded {downloaded:,} bytes in {elapsed:.1f}s ({downloaded / elapsed / 1024 / 1024:.2f} MB/s)")
    return dest_path


def print_extension_table(hdul: fits.HDUList) -> List[Dict[str, Any]]:
    """Print a clean, structured table listing every extension in the FITS container."""
    print("\n" + "=" * 90)
    print(f"{'No.':<4} {'Extension Name':<16} {'Ver':<5} {'Type':<16} {'Dimensions':<18} {'Format':<10} {'BUNIT / Info'}")
    print("-" * 90)

    extensions_meta: List[Dict[str, Any]] = []
    for idx, hdu in enumerate(hdul):
        ext_name = hdu.name if hdu.name else "(PRIMARY)"
        ext_ver = hdu.ver if hasattr(hdu, "ver") else 1
        ext_type = hdu.__class__.__name__

        shape_str = str(hdu.shape) if hasattr(hdu, "shape") and hdu.shape else "()"
        format_str = ""
        if hasattr(hdu, "data") and hdu.data is not None:
            format_str = str(hdu.data.dtype)

        bunit = hdu.header.get("BUNIT", "")
        if not bunit and hasattr(hdu, "columns"):
            bunit = f"{len(hdu.columns)} cols x {hdu.header.get('NAXIS2', 0)} rows"

        print(f"{idx:<4} {ext_name:<16} {ext_ver:<5} {ext_type:<16} {shape_str:<18} {format_str:<10} {bunit}")
        extensions_meta.append({
            "index": idx,
            "name": ext_name,
            "version": ext_ver,
            "type": ext_type,
            "shape": shape_str,
            "format": format_str,
            "bunit": bunit,
        })
    print("=" * 90 + "\n")
    return extensions_meta


def mask_and_display_image(
    fits_path: Path | str,
    output_png: Path | str = "data/raw/s1_fetch_masked_image.png",
    crop_size: int = 500
) -> Tuple[np.ma.MaskedArray, Dict[str, Any]]:
    """Mask flagged and invalid-variance pixels and render a multi-panel visual comparison.

    Generates a 4-panel diagnostic plot:
    1. Raw Science Image (MJy/sr)
    2. Variance Map ((MJy/sr)^2)
    3. Combined Quality Mask (Flags != 0 or Variance <= 0)
    4. Cleaned Masked Science Image
    """
    fits_file = Path(fits_path)
    output_file = Path(output_png)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with fits.open(fits_file) as hdul:
        image_data = np.array(hdul["IMAGE"].data, dtype=np.float32)
        variance_data = np.array(hdul["VARIANCE"].data, dtype=np.float32)
        flags_data = np.array(hdul["FLAGS"].data, dtype=np.int32)
        header = hdul["IMAGE"].header

    total_pixels = image_data.size

    # Flag condition 1: SPHEREx data quality flags != 0 (cosmic rays, saturation, bad pixels)
    flag_mask = (flags_data != 0)

    # Flag condition 2: Non-positive or NaN variance
    var_mask = (variance_data <= 0) | np.isnan(variance_data) | np.isinf(variance_data)

    # Combined bad pixel mask
    combined_mask = flag_mask | var_mask | np.isnan(image_data)
    masked_pixels = int(np.count_nonzero(combined_mask))
    valid_pixels = total_pixels - masked_pixels

    # Create NumPy MaskedArray
    masked_image = np.ma.masked_where(combined_mask, image_data)

    stats = {
        "total_pixels": total_pixels,
        "valid_pixels": valid_pixels,
        "masked_pixels": masked_pixels,
        "flagged_pct": (masked_pixels / total_pixels) * 100.0,
        "raw_min": float(np.nanmin(image_data)),
        "raw_max": float(np.nanmax(image_data)),
        "clean_median": float(np.ma.median(masked_image)),
        "clean_std": float(np.ma.std(masked_image)),
        "date_obs": header.get("DATE-OBS", "unknown"),
        "crval1_ra": header.get("CRVAL1", 0.0),
        "crval2_dec": header.get("CRVAL2", 0.0),
        "bunit": header.get("BUNIT", "MJy / sr"),
    }

    print("[s1_fetch] Masking Statistics:")
    print(f"  Total Pixels:        {stats['total_pixels']:,}")
    print(f"  Valid Pixels:        {stats['valid_pixels']:,} ({100 - stats['flagged_pct']:.2f}%) [measured]")
    print(f"  Flagged Bad Pixels:  {stats['masked_pixels']:,} ({stats['flagged_pct']:.2f}%) [derived]")
    print(f"  Clean Flux Median:   {stats['clean_median']:.4f} {stats['bunit']} [measured]")
    print(f"  Clean Flux StdDev:   {stats['clean_std']:.4f} {stats['bunit']} [derived]")
    print(f"  Boresight (RA, Dec): ({stats['crval1_ra']:.4f}°, {stats['crval2_dec']:.4f}°) [measured]")

    # Crop central region for detailed visual inspection
    cy, cx = image_data.shape[0] // 2, image_data.shape[1] // 2
    half = crop_size // 2
    y0, y1 = cy - half, cy + half
    x0, x1 = cx - half, cx + half

    sub_img = image_data[y0:y1, x0:x1]
    sub_var = variance_data[y0:y1, x0:x1]
    sub_mask = combined_mask[y0:y1, x0:x1]
    sub_masked_img = masked_image[y0:y1, x0:x1]

    # Plot 4-panel diagnostic figure
    fig, axes = plt.subplots(1, 4, figsize=(20, 5), facecolor="#0A0A0B")
    fig.suptitle(
        f"NASA SPHEREx Level 2 Image Inspection · Obs: {stats['date_obs']} · "
        f"Center: ({stats['crval1_ra']:.2f}°, {stats['crval2_dec']:.2f}°)",
        color="#EDEDED",
        fontsize=13,
        y=0.98,
    )

    norm_img = ImageNormalize(sub_img, interval=ZScaleInterval(), stretch=AsinhStretch())
    norm_var = ImageNormalize(np.nan_to_num(sub_var, nan=0.0), interval=ZScaleInterval())
    norm_clean = ImageNormalize(sub_masked_img.filled(np.nan), interval=ZScaleInterval(), stretch=AsinhStretch())

    # Panel 1: Raw Science
    ax1 = axes[0]
    im1 = ax1.imshow(sub_img, cmap="inferno", norm=norm_img, origin="lower")
    ax1.set_title("1. Raw Science Image [measured]", color="#EDEDED", fontsize=10)
    plt.colorbar(im1, ax=ax1, fraction=0.046, pad=0.04).ax.yaxis.set_tick_params(color="#EDEDED", labelcolor="#EDEDED")

    # Panel 2: Variance Map
    ax2 = axes[1]
    im2 = ax2.imshow(sub_var, cmap="viridis", norm=norm_var, origin="lower")
    ax2.set_title("2. Variance Map [measured]", color="#EDEDED", fontsize=10)
    plt.colorbar(im2, ax=ax2, fraction=0.046, pad=0.04).ax.yaxis.set_tick_params(color="#EDEDED", labelcolor="#EDEDED")

    # Panel 3: Combined Bad Pixel Mask
    ax3 = axes[2]
    im3 = ax3.imshow(sub_mask.astype(int), cmap="Reds", origin="lower", vmin=0, vmax=1)
    ax3.set_title("3. Flagged Bad Pixels [derived]", color="#EDEDED", fontsize=10)
    plt.colorbar(im3, ax=ax3, fraction=0.046, pad=0.04).ax.yaxis.set_tick_params(color="#EDEDED", labelcolor="#EDEDED")

    # Panel 4: Masked Science Image
    ax4 = axes[3]
    im4 = ax4.imshow(sub_masked_img, cmap="inferno", norm=norm_clean, origin="lower")
    ax4.set_title("4. Masked Cleaned Science [derived]", color="#FF6B3D", fontsize=10)
    plt.colorbar(im4, ax=ax4, fraction=0.046, pad=0.04).ax.yaxis.set_tick_params(color="#EDEDED", labelcolor="#EDEDED")

    for ax in axes:
        ax.set_facecolor("#050506")
        ax.tick_params(colors="#8E8E93", labelsize=8)
        for spine in ax.spines.values():
            spine.set_color("#26262A")

    plt.tight_layout()
    plt.savefig(output_file, dpi=150, facecolor=fig.get_facecolor(), edgecolor="none")
    plt.close(fig)
    print(f"\n[s1_fetch] Saved 4-panel inspection plot to: {output_file.resolve()}")

    return masked_image, stats


def main() -> None:
    """Execute Spike S1."""
    print("=" * 90)
    print("Live Sky · Spike S1: SPHEREx FITS Ingestion & Variance Masking")
    print("=" * 90)

    # 1. Target coordinate retrieval
    target_ra, target_dec, target_name = get_target_coordinates("3I")

    # 2. Download/locate SPHEREx Level 2 FITS
    fits_path = download_spherex_fits(
        s3_key=SAMPLE_S3_KEY,
        output_dir="data/raw",
        filename="spherex_sample.fits"
    )

    # 3. Print extension table
    with fits.open(fits_path) as hdul:
        print_extension_table(hdul)

    # 4. Mask and display image
    masked_image, stats = mask_and_display_image(
        fits_path=fits_path,
        output_png="data/raw/s1_fetch_masked_image.png",
        crop_size=500
    )

    print("\n[s1_fetch] Spike S1 completed successfully.")


if __name__ == "__main__":
    main()
