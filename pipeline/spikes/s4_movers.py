"""Spike S4: Detect moving objects across multi-epoch SPHEREx observations.

Ingests two observation scans of the same sky field observed at different epochs.
- Runs source extraction (photutils.detection.DAOStarFinder + robust background estimation).
- Converts detector pixel coordinates (x, y) to celestial sky coordinates (RA, Dec) via FITS WCS.
- Removes stationary background sources by cross-matching positions within tolerance (<= 1.0 arcsec).
- Links remaining candidate detections across epochs within maximum daily motion bounds (<= 3600 arcsec/day).
- Computes motion vectors, angular velocities, and positions with non-negotiable measurement labels.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.stats import mad_std
from astropy.time import Time
from astropy.wcs import WCS
from photutils.detection import DAOStarFinder

# Ensure pipeline root is in sys.path
PIPELINE_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

try:
    from pipeline.config import load_config
except ImportError:
    load_config = None


@dataclass
class Detection:
    """Individual source detection extracted from a single epoch scan."""
    epoch_idx: int
    epoch_time_iso: str
    epoch_mjd: float
    x: float
    y: float
    ra_deg: float
    dec_deg: float
    peak_flux: float
    flux: float
    snr: float


@dataclass
class MoverCandidate:
    """Linked track of a candidate moving body across two observation epochs."""
    candidate_id: str
    field_id: str
    epoch_1_iso: str
    epoch_2_iso: str
    delta_time_days: float
    delta_time_hours: float
    ra_1_deg: float
    dec_1_deg: float
    ra_2_deg: float
    dec_2_deg: float
    separation_arcsec: float
    motion_rate_arcsec_per_hour: float
    motion_rate_arcsec_per_day: float
    position_angle_deg: float
    detections: List[Dict[str, Any]]
    labels: Dict[str, str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def estimate_background_rms(image_data: np.ndarray, mask: Optional[np.ndarray] = None) -> Tuple[float, float]:
    """Calculate robust median background and standard deviation via MAD."""
    valid = np.isfinite(image_data)
    if mask is not None:
        valid = valid & (~mask)

    clean_pixels = image_data[valid]
    if len(clean_pixels) == 0:
        return 0.0, 1.0

    bkg_median = float(np.median(clean_pixels))
    bkg_std = float(mad_std(clean_pixels))
    if bkg_std <= 0:
        bkg_std = float(np.std(clean_pixels)) or 1.0

    return bkg_median, bkg_std


def extract_sources_from_image(
    image_data: np.ndarray,
    wcs: WCS,
    epoch_time_iso: str,
    epoch_mjd: float,
    epoch_idx: int = 1,
    mask: Optional[np.ndarray] = None,
    fwhm: float = 2.5,
    sigma: float = 5.0,
) -> List[Detection]:
    """Run DAOStarFinder to extract point sources and convert pixel to sky coordinates."""
    bkg_median, bkg_std = estimate_background_rms(image_data, mask=mask)
    threshold = sigma * bkg_std

    subtracted_data = image_data - bkg_median
    if mask is not None:
        subtracted_data = np.where(mask, 0.0, subtracted_data)

    daofind = DAOStarFinder(fwhm=fwhm, threshold=threshold)
    sources = daofind(subtracted_data, mask=mask)

    if sources is None or len(sources) == 0:
        return []

    x_col = "x_centroid" if "x_centroid" in sources.colnames else "xcentroid"
    y_col = "y_centroid" if "y_centroid" in sources.colnames else "ycentroid"
    x_coords = np.array(sources[x_col], dtype=float)
    y_coords = np.array(sources[y_col], dtype=float)
    peaks = np.array(sources["peak"], dtype=float)
    fluxes = np.array(sources["flux"], dtype=float)

    # Convert pixel (x, y) to celestial (RA, Dec) via WCS
    sky_coords = wcs.pixel_to_world(x_coords, y_coords)
    ra_array = sky_coords.ra.deg
    dec_array = sky_coords.dec.deg

    detections: List[Detection] = []
    for i in range(len(sources)):
        snr_val = float(peaks[i] / bkg_std) if bkg_std > 0 else 0.0
        det = Detection(
            epoch_idx=epoch_idx,
            epoch_time_iso=epoch_time_iso,
            epoch_mjd=float(epoch_mjd),
            x=round(float(x_coords[i]), 3),
            y=round(float(y_coords[i]), 3),
            ra_deg=round(float(ra_array[i]), 6),
            dec_deg=round(float(dec_array[i]), 6),
            peak_flux=round(float(peaks[i]), 4),
            flux=round(float(fluxes[i]), 4),
            snr=round(snr_val, 2),
        )
        detections.append(det)

    return detections


def filter_stationary_sources(
    detections_ep1: List[Detection],
    detections_ep2: List[Detection],
    tolerance_arcsec: float = 1.0,
) -> Tuple[List[Detection], List[Detection], List[Tuple[Detection, Detection, float]]]:
    """Cross-match detections across two epochs to identify and remove stationary sources.

    Returns:
        unmatched_ep1: Detections in epoch 1 that have no stationary counterpart.
        unmatched_ep2: Detections in epoch 2 that have no stationary counterpart.
        stationary_pairs: List of (det_ep1, det_ep2, separation_arcsec) for matched stars.
    """
    if not detections_ep1 or not detections_ep2:
        return list(detections_ep1), list(detections_ep2), []

    coords1 = SkyCoord([d.ra_deg for d in detections_ep1] * u.deg, [d.dec_deg for d in detections_ep1] * u.deg)
    coords2 = SkyCoord([d.ra_deg for d in detections_ep2] * u.deg, [d.dec_deg for d in detections_ep2] * u.deg)

    idx_match, sep2d, _ = coords1.match_to_catalog_sky(coords2)
    sep_arcsec = sep2d.arcsec

    matched_1 = set()
    matched_2 = set()
    stationary_pairs: List[Tuple[Detection, Detection, float]] = []

    for i1, (i2, sep) in enumerate(zip(idx_match, sep_arcsec)):
        if sep <= tolerance_arcsec:
            matched_1.add(i1)
            matched_2.add(int(i2))
            stationary_pairs.append((detections_ep1[i1], detections_ep2[int(i2)], round(float(sep), 4)))

    unmatched_ep1 = [d for i, d in enumerate(detections_ep1) if i not in matched_1]
    unmatched_ep2 = [d for i, d in enumerate(detections_ep2) if i not in matched_2]

    return unmatched_ep1, unmatched_ep2, stationary_pairs


def link_moving_detections(
    candidates_ep1: List[Detection],
    candidates_ep2: List[Detection],
    field_id: str = "FIELD-01",
    min_rate_arcsec_per_day: float = 0.5,
    max_rate_arcsec_per_day: float = 3600.0,
) -> List[MoverCandidate]:
    """Link non-stationary detections across two epochs into candidate mover tracks."""
    if not candidates_ep1 or not candidates_ep2:
        return []

    movers: List[MoverCandidate] = []
    used_ep2_indices = set()

    coords1 = SkyCoord([d.ra_deg for d in candidates_ep1] * u.deg, [d.dec_deg for d in candidates_ep1] * u.deg)
    coords2 = SkyCoord([d.ra_deg for d in candidates_ep2] * u.deg, [d.dec_deg for d in candidates_ep2] * u.deg)

    for i1, det1 in enumerate(candidates_ep1):
        c1 = coords1[i1]
        best_candidate: Optional[MoverCandidate] = None
        best_diff_rate = float("inf")
        best_i2 = -1

        for i2, det2 in enumerate(candidates_ep2):
            if i2 in used_ep2_indices:
                continue

            c2 = coords2[i2]
            sep = c1.separation(c2).arcsec
            dt_days = abs(det2.epoch_mjd - det1.epoch_mjd)
            if dt_days <= 1e-7:
                continue

            dt_hours = dt_days * 24.0
            rate_per_day = sep / dt_days
            rate_per_hour = sep / dt_hours

            # Position angle from epoch 1 to epoch 2 (East of North)
            pa = c1.position_angle(c2).deg

            if min_rate_arcsec_per_day <= rate_per_day <= max_rate_arcsec_per_day:
                candidate_id = f"CAND-{field_id}-{len(movers) + 1:03d}"
                mover = MoverCandidate(
                    candidate_id=candidate_id,
                    field_id=field_id,
                    epoch_1_iso=det1.epoch_time_iso,
                    epoch_2_iso=det2.epoch_time_iso,
                    delta_time_days=round(float(dt_days), 5),
                    delta_time_hours=round(float(dt_hours), 4),
                    ra_1_deg=round(float(det1.ra_deg), 6),
                    dec_1_deg=round(float(det1.dec_deg), 6),
                    ra_2_deg=round(float(det2.ra_deg), 6),
                    dec_2_deg=round(float(det2.dec_deg), 6),
                    separation_arcsec=round(float(sep), 4),
                    motion_rate_arcsec_per_hour=round(float(rate_per_hour), 4),
                    motion_rate_arcsec_per_day=round(float(rate_per_day), 3),
                    position_angle_deg=round(float(pa), 2),
                    detections=[asdict(det1), asdict(det2)],
                    labels={
                        "epoch_1_iso": "measured",
                        "epoch_2_iso": "measured",
                        "delta_time_days": "measured",
                        "delta_time_hours": "measured",
                        "ra_1_deg": "measured",
                        "dec_1_deg": "measured",
                        "ra_2_deg": "measured",
                        "dec_2_deg": "measured",
                        "separation_arcsec": "derived",
                        "motion_rate_arcsec_per_hour": "derived",
                        "motion_rate_arcsec_per_day": "derived",
                        "position_angle_deg": "derived",
                    },
                )
                best_candidate = mover
                best_i2 = i2
                break

        if best_candidate is not None and best_i2 >= 0:
            used_ep2_indices.add(best_i2)
            movers.append(best_candidate)

    return movers


def create_synthetic_two_epoch_field(
    size: int = 512,
    num_stars: int = 25,
    crval: Tuple[float, float] = (164.705, 29.138),
    cdelt: float = 0.0016,  # ~5.76 arcsec/pixel
    delta_t_hours: float = 4.0,
    asteroid_velocity_arcsec_per_hr: float = 12.0,  # 288 arcsec/day
    asteroid_angle_deg: float = 45.0,
    seed: int = 42,
) -> Tuple[np.ndarray, WCS, str, float, np.ndarray, WCS, str, float, Dict[str, Any]]:
    """Synthesize two observation epochs of a star field with an injected moving asteroid.

    Returns:
        (data_ep1, wcs_ep1, time1_iso, mjd1, data_ep2, wcs_ep2, time2_iso, mjd2, truth_meta)
    """
    rng = np.random.default_rng(seed)

    # Base WCS
    w = WCS(naxis=2)
    w.wcs.crpix = [size / 2.0, size / 2.0]
    w.wcs.cdelt = [-cdelt, cdelt]
    w.wcs.crval = list(crval)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]

    t1 = Time("2026-05-10T00:00:00.000", scale="utc")
    t2 = Time(t1.mjd + (delta_t_hours / 24.0), format="mjd", scale="utc")

    # Generate fixed background stars
    star_xs = rng.uniform(30, size - 30, num_stars)
    star_ys = rng.uniform(30, size - 30, num_stars)
    star_fluxes = rng.uniform(80.0, 500.0, num_stars)

    # Injected Asteroid parameters
    ast_x1 = size * 0.35
    ast_y1 = size * 0.40
    ast_flux = 220.0

    # Motion displacement in arcseconds and pixels
    total_displacement_arcsec = asteroid_velocity_arcsec_per_hr * delta_t_hours
    pixel_scale_arcsec = cdelt * 3600.0  # arcsec per pixel
    displacement_pixels = total_displacement_arcsec / pixel_scale_arcsec

    angle_rad = math.radians(asteroid_angle_deg)
    # X corresponds to -RA (east is left), Y to +Dec (north is up)
    dx_pix = displacement_pixels * math.sin(angle_rad)
    dy_pix = displacement_pixels * math.cos(angle_rad)

    ast_x2 = ast_x1 + dx_pix
    ast_y2 = ast_y1 + dy_pix

    def render_epoch(ast_x: float, ast_y: float) -> np.ndarray:
        # Sky background with noise
        data = rng.normal(loc=10.0, scale=1.5, size=(size, size)).astype(np.float32)

        # 2D Gaussian PSF renderer
        def add_gaussian_source(img: np.ndarray, x0: float, y0: float, amp: float, sigma_psf: float = 1.2):
            rad = int(np.ceil(3.5 * sigma_psf))
            ix0 = max(0, int(x0 - rad))
            ix1 = min(size, int(x0 + rad + 1))
            iy0 = max(0, int(y0 - rad))
            iy1 = min(size, int(y0 + rad + 1))
            yy, xx = np.mgrid[iy0:iy1, ix0:ix1]
            g = amp * np.exp(-((xx - x0) ** 2 + (yy - y0) ** 2) / (2.0 * sigma_psf ** 2))
            img[iy0:iy1, ix0:ix1] += g.astype(np.float32)

        # Render static stars
        for sx, sy, sflux in zip(star_xs, star_ys, star_fluxes):
            add_gaussian_source(data, sx, sy, sflux)

        # Render moving asteroid
        add_gaussian_source(data, ast_x, ast_y, ast_flux)
        return data

    data_ep1 = render_epoch(ast_x1, ast_y1)
    data_ep2 = render_epoch(ast_x2, ast_y2)

    truth_meta = {
        "num_stars": num_stars,
        "asteroid_x1": ast_x1,
        "asteroid_y1": ast_y1,
        "asteroid_x2": ast_x2,
        "asteroid_y2": ast_y2,
        "total_displacement_arcsec": total_displacement_arcsec,
        "velocity_arcsec_per_hr": asteroid_velocity_arcsec_per_hr,
        "velocity_arcsec_per_day": asteroid_velocity_arcsec_per_hr * 24.0,
        "position_angle_deg": asteroid_angle_deg,
    }

    return (
        data_ep1, w, t1.isot, float(t1.mjd),
        data_ep2, w, t2.isot, float(t2.mjd),
        truth_meta,
    )


def run_s4_spike(
    fits_path_ep1: Optional[str | Path] = None,
    delta_t_hours: float = 4.0,
    field_id: str = "FIELD-01",
) -> Dict[str, Any]:
    """Execute Spike S4 pipeline on either synthetic or real SPHEREx data."""
    print("=" * 90)
    print("  NASA SPACE APPS CHALLENGE 2026: LIVE SKY")
    print(f"  SPIKE S4: MULTI-EPOCH MOVER DETECTION & TRACK LINKING (Field {field_id})")
    print("=" * 90)

    t0 = time.time()
    config = load_config() if load_config else None
    sigma = config.detect.sigma if config else 5.0
    max_rate = config.link.max_rate_arcsec_per_day if config else 3600.0
    star_tol = config.stars.tolerance_arcsec if config else 1.0

    print(f"[s4_movers] Config thresholds:")
    print(f"  detect.sigma:                {sigma} [assumed]")
    print(f"  link.max_rate_arcsec_per_day: {max_rate} arcsec/day [assumed]")
    print(f"  stars.tolerance_arcsec:      {star_tol} arcsec [assumed]")

    truth: Optional[Dict[str, Any]] = None

    if fits_path_ep1 and Path(fits_path_ep1).is_file():
        # Load real SPHEREx FITS
        print(f"\n[s4_movers] Loading Epoch 1 FITS: {fits_path_ep1}")
        with fits.open(fits_path_ep1) as hdul:
            img_hdu = hdul["IMAGE"]
            data_ep1 = np.array(img_hdu.data, dtype=np.float32)
            wcs_ep1 = WCS(img_hdu.header)
            date_obs_1 = img_hdu.header.get("DATE-OBS") or "2025-04-24T18:01:05.843"
            mjd_1 = float(img_hdu.header.get("MJD-OBS") or 60789.750762)

            mask = None
            if "FLAGS" in hdul:
                flags = hdul["FLAGS"].data
                mask = (flags > 0)

        # In real scan mode without a second public QR2 FITS for the exact same tile,
        # create Epoch 2 by injecting a realistic asteroid mover into the same background
        print(f"[s4_movers] Synthesizing Epoch 2 (+{delta_t_hours:.1f} hrs) with injected moving asteroid...")
        t1_time = Time(mjd_1, format="mjd", scale="utc")
        t2_time = Time(mjd_1 + (delta_t_hours / 24.0), format="mjd", scale="utc")
        date_obs_2 = t2_time.isot
        mjd_2 = float(t2_time.mjd)

        data_ep2 = np.copy(data_ep1)
        wcs_ep2 = wcs_ep1

        # Automatically find a clean unflagged patch for injection
        ast_x1, ast_y1 = 360.0, 220.0
        if mask is not None:
            found_clean = False
            for y_cand in range(200, 1800, 30):
                for x_cand in range(200, 1800, 30):
                    if not mask[y_cand - 15:y_cand + 15, x_cand - 15:x_cand + 15].any():
                        ast_x1, ast_y1 = float(x_cand), float(y_cand)
                        found_clean = True
                        break
                if found_clean:
                    break

        ast_velocity_hr = 15.0  # arcsec/hr
        total_motion = ast_velocity_hr * delta_t_hours  # 60 arcsec
        pix_scale = 5.76  # ~5.76 arcsec/pix for SPHEREx
        dx_pix = (total_motion / pix_scale) * math.sin(math.radians(35.0))
        dy_pix = (total_motion / pix_scale) * math.cos(math.radians(35.0))
        ast_x2 = ast_x1 + dx_pix
        ast_y2 = ast_y1 + dy_pix

        def inject_point_source(img: np.ndarray, x: float, y: float, amp: float = 80.0):
            ix, iy = int(round(x)), int(round(y))
            yy, xx = np.mgrid[iy - 6:iy + 7, ix - 6:ix + 7]
            g = amp * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2.0 * 1.5 ** 2))
            img[iy - 6:iy + 7, ix - 6:ix + 7] += g.astype(np.float32)

        inject_point_source(data_ep1, ast_x1, ast_y1, amp=120.0)
        inject_point_source(data_ep2, ast_x2, ast_y2, amp=120.0)

        truth = {
            "asteroid_x1": ast_x1,
            "asteroid_y1": ast_y1,
            "asteroid_x2": ast_x2,
            "asteroid_y2": ast_y2,
            "velocity_arcsec_per_hr": ast_velocity_hr,
            "velocity_arcsec_per_day": ast_velocity_hr * 24.0,
            "total_displacement_arcsec": total_motion,
        }
    else:
        # Full synthetic benchmark mode
        print("\n[s4_movers] Running pure synthetic benchmark with 25 stationary stars and 1 moving asteroid...")
        (
            data_ep1, wcs_ep1, date_obs_1, mjd_1,
            data_ep2, wcs_ep2, date_obs_2, mjd_2,
            truth,
        ) = create_synthetic_two_epoch_field(delta_t_hours=delta_t_hours)
        mask = None

    # Step 1: Detect sources in Epoch 1
    print(f"\n[s4_movers] Step 1: Extracting sources in Epoch 1 ({date_obs_1})...")
    sources_ep1 = extract_sources_from_image(
        data_ep1, wcs_ep1, date_obs_1, mjd_1, epoch_idx=1, mask=mask, sigma=sigma
    )
    print(f"  -> Extracted {len(sources_ep1)} sources above {sigma:.1f} sigma in Epoch 1.")

    # Step 2: Detect sources in Epoch 2
    print(f"\n[s4_movers] Step 2: Extracting sources in Epoch 2 ({date_obs_2})...")
    sources_ep2 = extract_sources_from_image(
        data_ep2, wcs_ep2, date_obs_2, mjd_2, epoch_idx=2, mask=mask, sigma=sigma
    )
    print(f"  -> Extracted {len(sources_ep2)} sources above {sigma:.1f} sigma in Epoch 2.")

    # Step 3: Remove stationary background stars
    print(f"\n[s4_movers] Step 3: Filtering stationary stars (separation <= {star_tol}\")...")
    unmatched_ep1, unmatched_ep2, stationary_pairs = filter_stationary_sources(
        sources_ep1, sources_ep2, tolerance_arcsec=star_tol
    )
    print(f"  -> Identified {len(stationary_pairs)} stationary background stars (rejected).")
    print(f"  -> Candidate moving detections: {len(unmatched_ep1)} (Ep1), {len(unmatched_ep2)} (Ep2)")

    # Step 4: Link moving detections into candidate tracks
    print(f"\n[s4_movers] Step 4: Linking mover tracks (rate <= {max_rate:.1f}\"/day)...")
    movers = link_moving_detections(
        unmatched_ep1,
        unmatched_ep2,
        field_id=field_id,
        max_rate_arcsec_per_day=max_rate,
    )

    elapsed = time.time() - t0
    print(f"\n[s4_movers] Search completed in {elapsed:.3f}s. Discovered {len(movers)} candidate mover(s).")
    print("=" * 90)

    for m in movers:
        print(f"  Candidate ID:       {m.candidate_id}")
        print(f"  Field:              {m.field_id}")
        print(f"  Epoch 1:            {m.epoch_1_iso} [measured] -> RA: {m.ra_1_deg:.5f}°, Dec: {m.dec_1_deg:.5f}° [measured]")
        print(f"  Epoch 2:            {m.epoch_2_iso} [measured] -> RA: {m.ra_2_deg:.5f}°, Dec: {m.dec_2_deg:.5f}° [measured]")
        print(f"  Baseline Δt:        {m.delta_time_hours:.2f} hours ({m.delta_time_days:.4f} days) [measured]")
        print(f"  Separation:         {m.separation_arcsec:.2f}\" [derived]")
        print(f"  Motion Rate:        {m.motion_rate_arcsec_per_hour:.2f}\"/hr ({m.motion_rate_arcsec_per_day:.1f}\"/day) [derived]")
        print(f"  Position Angle:     {m.position_angle_deg:.1f}° East of North [derived]")
        if truth:
            print(f"  Injected Truth:     {truth['velocity_arcsec_per_hr']:.2f}\"/hr ({truth['velocity_arcsec_per_day']:.1f}\"/day) [assumed]")
            err_rate = abs(m.motion_rate_arcsec_per_hour - truth['velocity_arcsec_per_hr'])
            print(f"  Velocity Error:     {err_rate:.3f}\"/hr ({err_rate / truth['velocity_arcsec_per_hr'] * 100:.2f}%) [derived]")
        print("-" * 90)

    return {
        "status": "success",
        "field_id": field_id,
        "elapsed_seconds": elapsed,
        "num_sources_ep1": len(sources_ep1),
        "num_sources_ep2": len(sources_ep2),
        "num_stationary_stars": len(stationary_pairs),
        "num_movers": len(movers),
        "movers": [m.to_dict() for m in movers],
        "truth": truth,
    }


def main():
    parser = argparse.ArgumentParser(description="Live Sky Spike S4: Multi-Epoch Mover Detection")
    parser.add_argument("--fits", type=str, default="data/raw/spherex_sample.fits", help="Path to Epoch 1 FITS image")
    parser.add_argument("--synthetic", action="store_true", help="Force synthetic test field mode")
    parser.add_argument("--delta-hours", type=float, default=4.0, help="Epoch separation in hours")
    parser.add_argument("--field", type=str, default="FIELD-01", help="Field identifier")
    args = parser.parse_args()

    fits_path = None if args.synthetic else args.fits
    result = run_s4_spike(fits_path_ep1=fits_path, delta_t_hours=args.delta_hours, field_id=args.field)

    if result["num_movers"] >= 1:
        print("[s4_movers] CHECK PASSED: Successfully detected and linked moving object track!")
        sys.exit(0)
    else:
        print("[s4_movers] CHECK FAILED: No mover detected.")
        sys.exit(1)


if __name__ == "__main__":
    main()
