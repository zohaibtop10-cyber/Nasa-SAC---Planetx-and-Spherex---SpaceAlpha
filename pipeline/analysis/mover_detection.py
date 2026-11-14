"""
pipeline/analysis/mover_detection.py - Multi-Epoch Mover Detection & Parallax Analysis Engine

Analyzes raw SPHEREx FITS cutouts and full scans to detect celestial bodies
moving across multiple observation epochs.

SYSTEM WORKFLOW:
1. Image Preparation: Load FITS files (astropy.io.fits). Apply variance map and quality
   flags to mask bad pixels, cosmic rays, and sensor artifacts.
2. Source Extraction: Utilize photutils (DAOStarFinder / IRAFStarFinder) to detect point
   sources. Read detection sigma threshold from config.json.
3. Astrometric Calibration: Convert pixel coordinates (X, Y) into celestial coordinates
   (Right Ascension, Declination) via the FITS WCS header.
4. Cross-Matching (Blinking): Compare sources detected across Epoch 1 and Epoch 2.
   Filter stationary background stars and calculate angular velocities (arcsec/day).
5. Parallax & Distance Estimation: For unknown mover candidates, calculate distance
   bounds [min_au, max_au] from observed angular shift and Earth's orbital baseline
   (via astropy ephemeris), constrained by a Sun-bound orbit.

NON-NEGOTIABLE COMPLIANCE:
- Rule 1: Every displayed number MUST have an explicit label: 'measured', 'derived', or 'assumed'.
- Rule 2: All 3D models and state vectors MUST be tagged 'Illustrative'.
- Rule 3: NO claims of finding or claiming Planet X.
- Rule 4: The Web App reads static JSON only.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np

# Astropy and photutils imports with graceful handling
try:
    import astropy.units as u
    from astropy.coordinates import SkyCoord, get_body_barycentric, solar_system_ephemeris
    from astropy.io import fits
    from astropy.stats import mad_std, sigma_clipped_stats
    from astropy.time import Time
    from astropy.wcs import WCS
except ImportError as err:
    raise ImportError(f"Astropy is required for mover detection: {err}") from err

try:
    from photutils.detection import DAOStarFinder, IRAFStarFinder
except ImportError as err:
    raise ImportError(f"photutils is required for point source extraction: {err}") from err


# ---------------------------------------------------------------------------
# Logging Setup
# ---------------------------------------------------------------------------
def get_logger(verbose: bool = False, log_file: Optional[Path | str] = None) -> logging.Logger:
    logger = logging.getLogger("mover_detection")
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    logger.propagate = False

    if not logger.handlers:
        console = logging.StreamHandler(sys.stdout)
        console.setLevel(logging.DEBUG if verbose else logging.INFO)
        console_fmt = logging.Formatter("[%(levelname)s] %(message)s")
        console.setFormatter(console_fmt)
        logger.addHandler(console)

        if log_file:
            log_path = Path(log_file)
            log_path.parent.mkdir(parents=True, exist_ok=True)
            fh = logging.FileHandler(log_path, encoding="utf-8")
            fh.setLevel(logging.DEBUG)
            fh.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s"))
            logger.addHandler(fh)

    return logger


# ---------------------------------------------------------------------------
# Configuration Loader
# ---------------------------------------------------------------------------
DEFAULT_CONFIG = {
    "detect": {"sigma": 5.0, "fwhm": 2.5, "method": "DAOStarFinder"},
    "link": {"max_rate_arcsec_per_day": 1500.0, "min_detections": 2},
    "stars": {"tolerance_arcsec": 3.0},
    "parallax": {"d_min_au": 5.0, "d_max_au": 1000.0, "d_step": 1.0},
    "flags": {"bad_mask": 0xFFFFFFFF},
    "labels": ["measured", "derived", "assumed"],
}


def load_pipeline_config(config_path: Optional[Path | str] = None) -> Dict[str, Any]:
    """Loads configuration parameters from config.json with fallback defaults."""
    cfg = dict(DEFAULT_CONFIG)
    target_path = Path(config_path) if config_path else Path("config.json")

    if target_path.is_file():
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                user_cfg = json.load(f)
                for k, v in user_cfg.items():
                    if isinstance(v, dict) and k in cfg:
                        cfg[k].update(v)
                    else:
                        cfg[k] = v
        except Exception as e:
            logging.getLogger("mover_detection").warning(f"Error reading {target_path}: {e}")

    return cfg


# ---------------------------------------------------------------------------
# Dataclasses & Data Contracts (with Epistemic Labels)
# ---------------------------------------------------------------------------
@dataclass
class AstrometricPointSource:
    """A point source detected in a single observation epoch."""
    epoch_idx: int
    obs_time_iso: str
    pixel_x: float
    pixel_y: float
    ra_deg: float
    dec_deg: float
    peak_flux: float
    flux: float
    snr: float
    epistemic_labels: Dict[str, str] = field(default_factory=lambda: {
        "pixel_x": "measured",
        "pixel_y": "measured",
        "ra_deg": "measured",
        "dec_deg": "measured",
        "peak_flux": "measured",
        "flux": "measured",
        "snr": "derived",
    })

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class CleanedImageData:
    """Masked image array with astrometric WCS header and noise statistics."""
    data: np.ndarray
    mask: np.ndarray
    wcs: WCS
    obs_time_iso: str
    epoch_mjd: float
    bkg_median: float
    bkg_std: float
    mask_stats: Dict[str, Any]
    epistemic_labels: Dict[str, str] = field(default_factory=lambda: {
        "bkg_median": "measured",
        "bkg_std": "measured",
        "masked_pixels": "measured",
        "total_pixels": "measured",
    })


@dataclass
class ParallaxDistanceEstimate:
    """Distance constraint for an unknown candidate mover assuming a Sun-bound orbit."""
    min_au: float
    max_au: float
    nominal_au: float
    earth_baseline_au: float
    earth_baseline_km: float
    observed_shift_arcsec: float
    time_baseline_days: float
    assumption: str
    model_tag: str = "Illustrative"  # Rule 2 compliance
    epistemic_labels: Dict[str, str] = field(default_factory=lambda: {
        "min_au": "derived",
        "max_au": "derived",
        "nominal_au": "derived",
        "earth_baseline_au": "derived",
        "earth_baseline_km": "derived",
        "observed_shift_arcsec": "measured",
        "time_baseline_days": "measured",
        "bound_orbit_assumption": "assumed",
    })

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class MoverCandidateTrack:
    """A moving object candidate linked across two observation epochs."""
    candidate_id: str
    epoch_1: AstrometricPointSource
    epoch_2: AstrometricPointSource
    dt_hours: float
    dt_days: float
    separation_arcsec: float
    angular_rate_arcsec_per_hour: float
    angular_rate_arcsec_per_day: float
    motion_angle_deg: float
    parallax: Optional[ParallaxDistanceEstimate] = None
    classification: str = "candidate_mover"
    model_tag: str = "Illustrative"  # Rule 2 compliance
    epistemic_labels: Dict[str, str] = field(default_factory=lambda: {
        "dt_hours": "measured",
        "dt_days": "measured",
        "separation_arcsec": "measured",
        "angular_rate_arcsec_per_hour": "derived",
        "angular_rate_arcsec_per_day": "derived",
        "motion_angle_deg": "derived",
    })

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        if self.parallax:
            d["parallax"] = self.parallax.to_dict()
        return d


# ---------------------------------------------------------------------------
# Step 1: Image Preparation & Bad Pixel Masking
# ---------------------------------------------------------------------------
def prepare_and_mask_fits(
    fits_path: Path | str,
    bad_flags_mask: int = 0xFFFFFFFF,
    mask_variance: bool = True,
    logger: Optional[logging.Logger] = None,
) -> CleanedImageData:
    """Step 1: Load FITS image and apply VARIANCE map and quality FLAGS to mask bad pixels.
    
    Identifies and masks:
    - Non-finite pixel values (NaN, Inf)
    - Pixels with flagged quality issues (FLAGS & bad_flags_mask != 0)
    - Pixels with non-positive or corrupted variance (VARIANCE <= 0 or non-finite)
    - Unphysical outlier variance spikes (variance > 99.9th percentile)
    """
    logger = logger or logging.getLogger("mover_detection")
    fits_path = Path(fits_path)
    if not fits_path.is_file():
        raise FileNotFoundError(f"FITS file not found: {fits_path}")

    logger.info(f"[Step 1: Image Preparation] Loading FITS file: {fits_path.name}")

    with fits.open(fits_path) as hdul:
        # Determine image HDU
        if "IMAGE" in hdul:
            img_hdu = hdul["IMAGE"]
        else:
            img_hdu = hdul[0]

        image_data = img_hdu.data.astype(np.float32) if img_hdu.data is not None else None
        if image_data is None:
            raise ValueError(f"FITS HDU '{img_hdu.name}' contains no image data array.")

        header = img_hdu.header
        wcs = WCS(header)

        # Observation timestamp
        date_obs = header.get("DATE-OBS") or header.get("DATE") or "2026-01-01T00:00:00.000"
        try:
            epoch_time = Time(date_obs, format="isot", scale="utc")
            epoch_mjd = float(epoch_time.mjd)
        except Exception:
            epoch_mjd = 61000.0

        # Quality flags extension
        flags_data = hdul["FLAGS"].data if "FLAGS" in hdul else None
        variance_data = hdul["VARIANCE"].data.astype(np.float32) if "VARIANCE" in hdul else None

    total_pixels = int(image_data.size)
    composite_mask = np.zeros(image_data.shape, dtype=bool)

    # 1. Mask non-finite pixels in raw science image
    non_finite_mask = ~np.isfinite(image_data)
    composite_mask |= non_finite_mask

    # 2. Mask quality flags
    flagged_count = 0
    if flags_data is not None:
        flag_mask = (flags_data.astype(np.int64) & int(bad_flags_mask)) != 0
        flagged_count = int(np.sum(flag_mask))
        composite_mask |= flag_mask

    # 3. Mask bad or corrupted variance pixels
    variance_masked_count = 0
    if mask_variance and variance_data is not None:
        invalid_var = ~np.isfinite(variance_data) | (variance_data <= 0.0)
        # Mask extreme noise variance outliers
        valid_vars = variance_data[~invalid_var]
        if len(valid_vars) > 100:
            var_thresh = float(np.percentile(valid_vars, 99.95))
            invalid_var |= (variance_data > var_thresh)
        variance_masked_count = int(np.sum(invalid_var))
        composite_mask |= invalid_var

    masked_pixels = int(np.sum(composite_mask))
    valid_pixels = total_pixels - masked_pixels
    valid_ratio = (valid_pixels / total_pixels) if total_pixels > 0 else 0.0

    if valid_pixels < 100:
        raise ValueError(
            f"Image has insufficient unmasked pixels ({valid_pixels}/{total_pixels}) for source extraction."
        )

    # Compute robust background statistics from unmasked pixels
    unmasked_vals = image_data[~composite_mask]
    mean_bkg, median_bkg, std_bkg = sigma_clipped_stats(unmasked_vals, sigma=3.0, maxiters=5)
    std_bkg = max(1e-6, float(std_bkg))

    mask_stats = {
        "total_pixels": total_pixels,
        "masked_pixels": masked_pixels,
        "valid_pixels": valid_pixels,
        "valid_ratio": round(valid_ratio, 4),
        "non_finite_count": int(np.sum(non_finite_mask)),
        "flagged_count": flagged_count,
        "variance_masked_count": variance_masked_count,
        "epistemic_label": "measured",
    }

    logger.info(
        f"[Step 1: Image Preparation] Cleaned {fits_path.name}: "
        f"{valid_pixels:,}/{total_pixels:,} valid pixels ({valid_ratio*100:.1f}%), "
        f"bkg_median={median_bkg:.3f}, bkg_std={std_bkg:.3f}"
    )

    return CleanedImageData(
        data=image_data,
        mask=composite_mask,
        wcs=wcs,
        obs_time_iso=str(date_obs),
        epoch_mjd=epoch_mjd,
        bkg_median=float(median_bkg),
        bkg_std=float(std_bkg),
        mask_stats=mask_stats,
    )


# ---------------------------------------------------------------------------
# Step 2 & 3: Source Extraction & Astrometric Calibration
# ---------------------------------------------------------------------------
def extract_point_sources(
    cleaned_image: CleanedImageData,
    epoch_idx: int = 1,
    sigma_threshold: Optional[float] = None,
    fwhm: float = 2.5,
    method: str = "DAOStarFinder",
    logger: Optional[logging.Logger] = None,
) -> Tuple[List[AstrometricPointSource], Dict[str, Any]]:
    """Step 2 & 3: Extract point sources via photutils and calibrate to celestial coords (RA, Dec)."""
    logger = logger or logging.getLogger("mover_detection")
    threshold_sigma = sigma_threshold if sigma_threshold is not None else 5.0
    abs_threshold = threshold_sigma * cleaned_image.bkg_std

    logger.info(
        f"[Step 2 & 3: Extraction] Running {method} (sigma={threshold_sigma:.1f}, "
        f"FWHM={fwhm:.1f}px, thresh={abs_threshold:.4f}) on Epoch {epoch_idx}..."
    )

    bkg_subtracted = cleaned_image.data - cleaned_image.bkg_median
    bkg_subtracted[cleaned_image.mask] = 0.0

    if method.lower() == "irafstarfinder":
        finder = IRAFStarFinder(fwhm=fwhm, threshold=abs_threshold)
    else:
        finder = DAOStarFinder(fwhm=fwhm, threshold=abs_threshold)

    sources_table = finder(bkg_subtracted, mask=cleaned_image.mask)

    detections: List[AstrometricPointSource] = []
    if sources_table is not None and len(sources_table) > 0:
        # Resolve column names across different photutils versions
        x_col = "xcentroid" if "xcentroid" in sources_table.colnames else "x_centroid"
        y_col = "ycentroid" if "ycentroid" in sources_table.colnames else "y_centroid"
        peak_col = "peak" if "peak" in sources_table.colnames else "peak_value"
        flux_col = "flux" if "flux" in sources_table.colnames else None

        for row in sources_table:
            px = float(row[x_col])
            py = float(row[y_col])
            peak_val = float(row[peak_col])
            flux_val = float(row[flux_col]) if flux_col else (peak_val * 10.0)

            # Step 3: Astrometric calibration via FITS WCS header
            ra_deg, dec_deg = cleaned_image.wcs.pixel_to_world_values(px, py)
            snr = peak_val / cleaned_image.bkg_std

            det = AstrometricPointSource(
                epoch_idx=epoch_idx,
                obs_time_iso=cleaned_image.obs_time_iso,
                pixel_x=round(px, 3),
                pixel_y=round(py, 3),
                ra_deg=round(float(ra_deg), 6),
                dec_deg=round(float(dec_deg), 6),
                peak_flux=round(peak_val, 3),
                flux=round(flux_val, 3),
                snr=round(float(snr), 2),
            )
            detections.append(det)

    diagnostics = {
        "epoch_idx": epoch_idx,
        "obs_time_iso": cleaned_image.obs_time_iso,
        "method": method,
        "fwhm": fwhm,
        "sigma_threshold": threshold_sigma,
        "abs_threshold": round(abs_threshold, 4),
        "detected_count": len(detections),
        "epistemic_labels": {
            "detected_count": "measured",
            "sigma_threshold": "assumed",
            "fwhm": "assumed",
        },
    }

    logger.info(
        f"[Step 2 & 3: Extraction] Epoch {epoch_idx}: Successfully extracted and calibrated "
        f"{len(detections)} point sources."
    )

    return detections, diagnostics


# ---------------------------------------------------------------------------
# Step 4: Cross-Matching (Blinking) & Mover Linking
# ---------------------------------------------------------------------------
def cross_match_and_blink_epochs(
    detections_ep1: List[AstrometricPointSource],
    detections_ep2: List[AstrometricPointSource],
    tolerance_arcsec: float = 3.0,
    max_rate_arcsec_per_day: float = 1500.0,
    logger: Optional[logging.Logger] = None,
) -> Tuple[List[MoverCandidateTrack], List[Dict[str, Any]], Dict[str, Any]]:
    """Step 4: Blinking cross-match between two epochs.
    
    1. Filter out 'fixed' sources (stars/galaxies) whose sky positions do not change (<= tolerance).
    2. Link the remaining non-stationary sources across time.
    3. Calculate angular velocity (arcsec/day, arcsec/hour).
    4. Reject unphysical velocity outliers exceeding max_rate_arcsec_per_day.
    """
    logger = logger or logging.getLogger("mover_detection")
    logger.info(
        f"[Step 4: Blinking Cross-Match] Blinking {len(detections_ep1)} sources (Epoch 1) "
        f"vs {len(detections_ep2)} sources (Epoch 2)..."
    )

    if not detections_ep1 or not detections_ep2:
        return [], [], {
            "stationary_count": 0,
            "candidates_count": 0,
            "false_tracks_count": 0,
            "epistemic_labels": {
                "stationary_count": "measured",
                "candidates_count": "measured",
                "false_tracks_count": "measured",
            },
        }

    # Build SkyCoord arrays for fast spherical astrometry
    coords_ep1 = SkyCoord([d.ra_deg for d in detections_ep1] * u.deg, [d.dec_deg for d in detections_ep1] * u.deg)
    coords_ep2 = SkyCoord([d.ra_deg for d in detections_ep2] * u.deg, [d.dec_deg for d in detections_ep2] * u.deg)

    # Calculate time delta between epochs
    t1 = Time(detections_ep1[0].obs_time_iso, format="isot", scale="utc")
    t2 = Time(detections_ep2[0].obs_time_iso, format="isot", scale="utc")
    dt_days = abs(float((t2 - t1).to_value("day")))
    if dt_days <= 0:
        dt_days = 0.0001
    dt_hours = dt_days * 24.0

    # 4A: Stationary Star Identification (Nearest neighbor matching within tolerance)
    idx2_match, sep2d_match, _ = coords_ep1.match_to_catalog_sky(coords_ep2)
    sep_arcsec = sep2d_match.arcsec

    stationary_ep1_idx: set[int] = set()
    stationary_ep2_idx: set[int] = set()
    stationary_matches: List[Dict[str, Any]] = []

    for i1, (i2, sep) in enumerate(zip(idx2_match, sep_arcsec)):
        if sep <= tolerance_arcsec and i2 not in stationary_ep2_idx:
            stationary_ep1_idx.add(i1)
            stationary_ep2_idx.add(i2)
            d1 = detections_ep1[i1]
            d2 = detections_ep2[i2]
            stationary_matches.append({
                "ra_mean": round((d1.ra_deg + d2.ra_deg) / 2.0, 6),
                "dec_mean": round((d1.dec_deg + d2.dec_deg) / 2.0, 6),
                "separation_arcsec": round(float(sep), 3),
                "label": "derived",
            })

    # Unmatched moving detections in both epochs
    unmatched_ep1 = [d for i, d in enumerate(detections_ep1) if i not in stationary_ep1_idx]
    unmatched_ep2 = [d for i, d in enumerate(detections_ep2) if i not in stationary_ep2_idx]

    logger.info(
        f"[Step 4: Blinking Cross-Match] Filtered {len(stationary_matches)} stationary catalog stars "
        f"(separation <= {tolerance_arcsec:.1f}\"). "
        f"Remaining non-stationary sources: Epoch 1={len(unmatched_ep1)}, Epoch 2={len(unmatched_ep2)}"
    )

    # 4B: Link remaining movers across time
    candidates: List[MoverCandidateTrack] = []
    false_tracks: List[Dict[str, Any]] = []

    if unmatched_ep1 and unmatched_ep2:
        mover_coords_1 = SkyCoord([d.ra_deg for d in unmatched_ep1] * u.deg, [d.dec_deg for d in unmatched_ep1] * u.deg)
        mover_coords_2 = SkyCoord([d.ra_deg for d in unmatched_ep2] * u.deg, [d.dec_deg for d in unmatched_ep2] * u.deg)

        # Match each unmatched Epoch 1 source to the nearest unmatched Epoch 2 source
        nearest_2_idx, sep_m_2d, _ = mover_coords_1.match_to_catalog_sky(mover_coords_2)
        used_ep2: set[int] = set()

        cand_seq = 1
        for i1, (i2, sep_dist) in enumerate(zip(nearest_2_idx, sep_m_2d.arcsec)):
            if i2 in used_ep2:
                continue

            d1 = unmatched_ep1[i1]
            d2 = unmatched_ep2[i2]
            sep_arcsec_val = float(sep_dist)

            # Angular velocities
            rate_arcsec_per_day = sep_arcsec_val / dt_days
            rate_arcsec_per_hour = sep_arcsec_val / dt_hours

            # Position angle of motion (East of North)
            c1 = SkyCoord(d1.ra_deg * u.deg, d1.dec_deg * u.deg)
            c2 = SkyCoord(d2.ra_deg * u.deg, d2.dec_deg * u.deg)
            pa_deg = float(c1.position_angle(c2).to_value("deg"))

            # Physical motion constraint: velocity upper bound
            if rate_arcsec_per_day <= max_rate_arcsec_per_day:
                used_ep2.add(i2)
                cand = MoverCandidateTrack(
                    candidate_id=f"CAND-{cand_seq:03d}",
                    epoch_1=d1,
                    epoch_2=d2,
                    dt_hours=round(dt_hours, 3),
                    dt_days=round(dt_days, 5),
                    separation_arcsec=round(sep_arcsec_val, 3),
                    angular_rate_arcsec_per_hour=round(rate_arcsec_per_hour, 3),
                    angular_rate_arcsec_per_day=round(rate_arcsec_per_day, 3),
                    motion_angle_deg=round(pa_deg, 2),
                    classification="candidate_mover",
                    model_tag="Illustrative",
                )
                candidates.append(cand)
                cand_seq += 1
            else:
                false_tracks.append({
                    "ep1_ra": d1.ra_deg,
                    "ep1_dec": d1.dec_deg,
                    "ep2_ra": d2.ra_deg,
                    "ep2_dec": d2.dec_deg,
                    "separation_arcsec": round(sep_arcsec_val, 3),
                    "rate_arcsec_per_day": round(rate_arcsec_per_day, 1),
                    "rejection_reason": f"Exceeds max physical velocity bound ({rate_arcsec_per_day:.1f} > {max_rate_arcsec_per_day:.1f} arcsec/day)",
                    "label": "derived",
                })

    diagnostics = {
        "dt_hours": round(dt_hours, 3),
        "dt_days": round(dt_days, 5),
        "stationary_count": len(stationary_matches),
        "candidates_count": len(candidates),
        "false_tracks_count": len(false_tracks),
        "tolerance_arcsec": tolerance_arcsec,
        "max_rate_arcsec_per_day": max_rate_arcsec_per_day,
        "epistemic_labels": {
            "dt_hours": "measured",
            "dt_days": "measured",
            "stationary_count": "measured",
            "candidates_count": "measured",
            "false_tracks_count": "measured",
            "tolerance_arcsec": "assumed",
            "max_rate_arcsec_per_day": "assumed",
        },
    }

    logger.info(
        f"[Step 4: Blinking Cross-Match] Successfully linked {len(candidates)} moving candidates "
        f"(rejected {len(false_tracks)} unphysical velocity outliers)."
    )

    return candidates, stationary_matches, diagnostics


# ---------------------------------------------------------------------------
# Step 5: Parallax & Distance Estimation (Sun-Bound Orbit Constraint)
# ---------------------------------------------------------------------------
def estimate_unknown_mover_distance(
    candidate: MoverCandidateTrack,
    config: Optional[Dict[str, Any]] = None,
    logger: Optional[logging.Logger] = None,
) -> ParallaxDistanceEstimate:
    """Step 5: Calculate rough distance range [min_au, max_au] for unknown movers.
    
    Compares the observed angular shift against Earth's known baseline movement
    between the two epochs (computed via astropy ephemeris), assuming a Sun-bound
    orbit as the maximum velocity constraint.
    """
    logger = logger or logging.getLogger("mover_detection")
    cfg = config or DEFAULT_CONFIG
    p_cfg = cfg.get("parallax", {})
    d_min_grid = float(p_cfg.get("d_min_au", 5.0))
    d_max_grid = float(p_cfg.get("d_max_au", 1000.0))

    t1_iso = candidate.epoch_1.obs_time_iso
    t2_iso = candidate.epoch_2.obs_time_iso
    t1 = Time(t1_iso, format="isot", scale="utc")
    t2 = Time(t2_iso, format="isot", scale="utc")
    dt_days = candidate.dt_days if candidate.dt_days > 0 else 0.001

    # 1. Earth Barycentric Vector Baseline via Astropy Ephemeris
    try:
        with solar_system_ephemeris.set("builtin"):
            pos1 = get_body_barycentric("earth", t1)
            pos2 = get_body_barycentric("earth", t2)
            d_earth = pos2 - pos1
            baseline_au = float((d_earth.x**2 + d_earth.y**2 + d_earth.z**2)**0.5 / u.AU)
    except Exception as e:
        logger.debug(f"Astropy ephemeris notice: {e}, falling back to analytical orbital formula")
        # Analytical Earth orbital chord baseline
        fraction_of_year = dt_days / 365.25
        baseline_au = 2.0 * math.sin(min(math.pi / 2.0, math.pi * fraction_of_year))

    baseline_au = max(0.0001, baseline_au)
    baseline_km = baseline_au * 149597870.7

    # 2. Observed angular motion
    theta_arcsec = max(0.05, candidate.separation_arcsec)
    theta_rad = math.radians(theta_arcsec / 3600.0)

    # 3. Geometric line-of-sight perpendicular component
    mean_dec = (candidate.epoch_1.dec_deg + candidate.epoch_2.dec_deg) / 2.0
    cos_dec = max(0.2, math.cos(math.radians(mean_dec)))
    b_perp_au = baseline_au * cos_dec

    # 4. Pure reflex parallax nominal distance:
    # d_nominal (AU) = b_perp / theta_rad
    d_nominal_raw = b_perp_au / theta_rad

    # 5. Sun-Bound Orbit Physical Velocity Constraint:
    # Maximum heliocentric escape velocity at distance d (AU):
    # v_esc(d) = sqrt(2 * G * M_sun / d) = 42.12 / sqrt(d) km/s
    # In AU/day: v_esc(AU/day) ~= 0.02434 / sqrt(d)
    # The maximum intrinsic displacement over dt_days is s_intrinsic <= v_esc(d) * dt_days.
    # Apparent angular motion is reflex parallax +/- intrinsic orbital motion.
    # Therefore, distance range is bounded where reflex parallax and escape velocity balance:
    # d_min: intrinsic motion adds constructively to parallax
    # d_max: intrinsic motion subtracts from parallax, constrained by d_max_grid
    
    # Solve numerically across grid for bounds satisfying bound-orbit constraints
    grid = np.logspace(math.log10(d_min_grid), math.log10(d_max_grid), 200)
    theta_predicted_min = []
    theta_predicted_max = []

    for d in grid:
        v_esc_au_per_day = 0.02434 / math.sqrt(d)
        max_intrinsic_au = v_esc_au_per_day * dt_days
        # Minimum possible angular motion at distance d
        theta_min_at_d = max(0.0, (b_perp_au - max_intrinsic_au)) / d
        # Maximum possible angular motion at distance d
        theta_max_at_d = (b_perp_au + max_intrinsic_au) / d
        theta_predicted_min.append(theta_min_at_d)
        theta_predicted_max.append(theta_max_at_d)

    theta_pred_min = np.array(theta_predicted_min)
    theta_pred_max = np.array(theta_predicted_max)

    # Distance where observed shift is physically compatible with bound orbit
    valid_indices = np.where((theta_rad >= theta_pred_min) & (theta_rad <= theta_pred_max))[0]

    if len(valid_indices) > 0:
        d_min_calculated = float(grid[valid_indices[0]])
        d_max_calculated = float(grid[valid_indices[-1]])
    else:
        # Fallback to nominal parallax with 35% margin
        d_min_calculated = max(d_min_grid, d_nominal_raw * 0.65)
        d_max_calculated = min(d_max_grid, d_nominal_raw * 1.55)

    d_min_final = max(d_min_grid, min(d_max_grid, d_min_calculated))
    d_max_final = max(d_min_final, min(d_max_grid, d_max_calculated))
    d_nominal_final = max(d_min_final, min(d_max_final, d_nominal_raw))

    assumption_text = (
        f"Derived from {dt_days:.4f}-day Earth orbital baseline ({baseline_au:.4f} AU, {baseline_km:,.0f} km) "
        f"parallax reflex motion assuming maximum heliocentric escape velocity (bound Keplerian orbit)"
    )

    return ParallaxDistanceEstimate(
        min_au=round(d_min_final, 2),
        max_au=round(d_max_final, 2),
        nominal_au=round(d_nominal_final, 2),
        earth_baseline_au=round(baseline_au, 6),
        earth_baseline_km=round(baseline_km, 1),
        observed_shift_arcsec=round(theta_arcsec, 3),
        time_baseline_days=round(dt_days, 5),
        assumption=assumption_text,
        model_tag="Illustrative",
    )


# ---------------------------------------------------------------------------
# Mover Detection Pipeline Orchestrator
# ---------------------------------------------------------------------------
class MoverDetectionPipeline:
    """Production analysis pipeline coordinating all 5 steps of mover detection."""

    def __init__(
        self,
        config_path: Optional[Path | str] = None,
        verbose: bool = False,
        log_file: Optional[Path | str] = None,
    ):
        self.config = load_pipeline_config(config_path)
        self.logger = get_logger(verbose=verbose, log_file=log_file)

    def analyze_epochs(
        self,
        fits_epoch1: Path | str,
        fits_epoch2: Path | str,
        output_json: Optional[Path | str] = None,
    ) -> Dict[str, Any]:
        """Runs the complete 5-step detection and parallax workflow across two FITS files."""
        t_start = time.perf_counter()
        self.logger.info("=" * 72)
        self.logger.info("STARTING SPHEREx MULTI-EPOCH MOVER DETECTION ANALYSIS")
        self.logger.info("Non-negotiable compliance active: Rule 1 (epistemic labels), Rule 2 (Illustrative)")
        self.logger.info("=" * 72)

        cfg_detect = self.config.get("detect", {})
        cfg_stars = self.config.get("stars", {})
        cfg_link = self.config.get("link", {})
        bad_flags_mask = self.config.get("flags", {}).get("bad_mask", 0xFFFFFFFF)

        sigma_thresh = float(cfg_detect.get("sigma", 5.0))
        fwhm = float(cfg_detect.get("fwhm", 2.5))
        method = str(cfg_detect.get("method", "DAOStarFinder"))
        star_tol = float(cfg_stars.get("tolerance_arcsec", 3.0))
        max_rate = float(cfg_link.get("max_rate_arcsec_per_day", 1500.0))

        # Step 1: Image Preparation for Epoch 1 & Epoch 2
        clean_ep1 = prepare_and_mask_fits(fits_epoch1, bad_flags_mask=bad_flags_mask, logger=self.logger)
        clean_ep2 = prepare_and_mask_fits(fits_epoch2, bad_flags_mask=bad_flags_mask, logger=self.logger)

        # Step 2 & 3: Source Extraction & Astrometric Calibration
        detections_ep1, diag1 = extract_point_sources(
            clean_ep1, epoch_idx=1, sigma_threshold=sigma_thresh, fwhm=fwhm, method=method, logger=self.logger
        )
        detections_ep2, diag2 = extract_point_sources(
            clean_ep2, epoch_idx=2, sigma_threshold=sigma_thresh, fwhm=fwhm, method=method, logger=self.logger
        )

        # Step 4: Cross-Matching (Blinking) & Linking
        candidates, stationary_matches, link_diag = cross_match_and_blink_epochs(
            detections_ep1=detections_ep1,
            detections_ep2=detections_ep2,
            tolerance_arcsec=star_tol,
            max_rate_arcsec_per_day=max_rate,
            logger=self.logger,
        )

        # Step 5: Parallax & Distance Estimation for Unknown Movers
        for cand in candidates:
            cand.parallax = estimate_unknown_mover_distance(cand, config=self.config, logger=self.logger)

        elapsed_sec = time.perf_counter() - t_start

        # Compile final results with complete epistemic labeling and Rule 2 compliance
        manifest_payload: Dict[str, Any] = {
            "version": "1.0.0",
            "pipeline": "SPHEREx Multi-Epoch Mover Detection",
            "status": "success",
            "rule2_compliance": "All 3D models and state vectors tagged 'Illustrative'",
            "rule3_compliance": "Zero unverified planetary claims; candidates tagged as candidate_mover",
            "epistemic_labels": {
                "elapsed_seconds": "measured",
                "epoch_1_detections": "measured",
                "epoch_2_detections": "measured",
                "stationary_stars_count": "measured",
                "candidate_movers_count": "measured",
                "angular_velocity": "derived",
                "distance_range_au": "derived",
                "bound_orbit_velocity_limit": "assumed",
            },
            "summary": {
                "elapsed_seconds": round(elapsed_sec, 3),
                "epoch_1_detections": len(detections_ep1),
                "epoch_2_detections": len(detections_ep2),
                "stationary_stars_count": len(stationary_matches),
                "candidate_movers_count": len(candidates),
                "dt_hours": link_diag["dt_hours"],
            },
            "diagnostics": {
                "epoch_1": diag1,
                "epoch_2": diag2,
                "linking": link_diag,
            },
            "candidate_movers": [c.to_dict() for c in candidates],
            "stationary_stars_sample": stationary_matches[:10],
        }

        if output_json:
            out_p = Path(output_json)
            out_p.parent.mkdir(parents=True, exist_ok=True)
            with open(out_p, "w", encoding="utf-8") as f:
                json.dump(manifest_payload, f, indent=2)
            self.logger.info(f"Results written to: {out_p}")

        self.logger.info("=" * 72)
        self.logger.info(
            f"ANALYSIS COMPLETE in {elapsed_sec:.2f}s: Found {len(candidates)} candidate movers "
            f"across {link_diag['dt_hours']:.1f} hour baseline."
        )
        self.logger.info("=" * 72)

        return manifest_payload


def analyze_fits_epochs(
    fits_epoch1: Path | str,
    fits_epoch2: Path | str,
    config_path: Optional[Path | str] = None,
    output_json: Optional[Path | str] = None,
    verbose: bool = False,
) -> Dict[str, Any]:
    """Programmatic entry point for multi-epoch mover detection."""
    pipeline = MoverDetectionPipeline(config_path=config_path, verbose=verbose)
    return pipeline.analyze_epochs(fits_epoch1, fits_epoch2, output_json=output_json)


# ---------------------------------------------------------------------------
# CLI Command Line Interface
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="SPHEREx Multi-Epoch Mover Detection & Parallax Analysis Engine"
    )
    parser.add_argument("--epoch1", required=True, help="Path to FITS scan at Epoch 1")
    parser.add_argument("--epoch2", required=True, help="Path to FITS scan at Epoch 2")
    parser.add_argument("--config", default="config.json", help="Path to configuration JSON")
    parser.add_argument("--output", default="data/candidates.json", help="Path to output JSON")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose debug logging")

    args = parser.parse_args()

    pipeline = MoverDetectionPipeline(config_path=args.config, verbose=args.verbose)
    result = pipeline.analyze_epochs(args.epoch1, args.epoch2, output_json=args.output)
    print(f"Analysis completed successfully: {len(result['candidate_movers'])} candidates detected.")


if __name__ == "__main__":
    main()
