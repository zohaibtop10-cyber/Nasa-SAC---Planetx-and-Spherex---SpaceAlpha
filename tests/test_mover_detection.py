"""
Unit tests for pipeline.analysis.mover_detection using Python's standard unittest.
Validates all 5 steps of the multi-epoch mover detection workflow:
1. Image Preparation & Quality Masking (FLAGS & VARIANCE)
2. Source Extraction (photutils DAOStarFinder / IRAFStarFinder)
3. Astrometric Calibration (pixel -> celestial WCS RA/Dec)
4. Cross-Matching / Blinking (stationary star rejection & mover linking)
5. Parallax & Distance Estimation (Earth orbital baseline & Sun-bound constraint)
Non-Negotiables: Rule 1 (epistemic labels), Rule 2 (Illustrative), Rule 3 (Zero Planet X claims).
"""

import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

# Ensure project root is in sys.path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from pipeline.analysis.mover_detection import (
    AstrometricPointSource,
    MoverCandidateTrack,
    MoverDetectionPipeline,
    analyze_fits_epochs,
    cross_match_and_blink_epochs,
    estimate_unknown_mover_distance,
    extract_point_sources,
    load_pipeline_config,
    prepare_and_mask_fits,
)


class TestMoverDetection(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scan1_path = ROOT / "data" / "raw" / "spherex_scan1.fits"
        cls.scan2_path = ROOT / "data" / "raw" / "spherex_scan2.fits"
        assert cls.scan1_path.is_file(), f"Missing {cls.scan1_path}"
        assert cls.scan2_path.is_file(), f"Missing {cls.scan2_path}"

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="mover_detection_test_")
        self.temp_path = Path(self.temp_dir)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    # -----------------------------------------------------------------------
    # 1. Image Preparation & Bad Pixel Masking Tests
    # -----------------------------------------------------------------------
    def test_prepare_and_mask_fits_real_scans(self):
        cleaned = prepare_and_mask_fits(self.scan1_path)
        self.assertIsNotNone(cleaned.data)
        self.assertIsNotNone(cleaned.mask)
        self.assertGreater(cleaned.mask_stats["total_pixels"], 1000000)
        self.assertGreater(cleaned.mask_stats["valid_pixels"], 1000000)
        self.assertGreater(cleaned.mask_stats["masked_pixels"], 0)
        self.assertGreater(cleaned.bkg_std, 0.0)
        self.assertTrue(cleaned.obs_time_iso.startswith("2025-04-24"))
        self.assertIn("CRVAL1", cleaned.wcs.to_header())

    def test_prepare_and_mask_synthetic_bad_pixels(self):
        # Create a small FITS with intentional NaNs, flagged pixels, and bad variance
        nx, ny = 100, 100
        img = np.ones((ny, nx), dtype=np.float32) * 10.0
        img[10, 10] = np.nan
        img[20, 20] = np.inf

        flags = np.zeros((ny, nx), dtype=np.int16)
        flags[30, 30] = 0x0001  # bad pixel flag

        variance = np.ones((ny, nx), dtype=np.float32) * 2.0
        variance[40, 40] = -1.0  # unphysical negative variance

        w = WCS(naxis=2)
        w.wcs.crpix = [50.0, 50.0]
        w.wcs.cdelt = [-0.001, 0.001]
        w.wcs.crval = [180.0, 0.0]
        w.wcs.ctype = ["RA---TAN", "DEC--TAN"]

        test_fits = self.temp_path / "test_mask.fits"
        hdul = fits.HDUList([
            fits.PrimaryHDU(),
            fits.ImageHDU(img, header=w.to_header(), name="IMAGE"),
            fits.ImageHDU(flags, name="FLAGS"),
            fits.ImageHDU(variance, name="VARIANCE"),
        ])
        hdul.writeto(test_fits, overwrite=True)

        cleaned = prepare_and_mask_fits(test_fits)
        # All 4 corrupted pixels must be masked
        self.assertTrue(cleaned.mask[10, 10])  # NaN
        self.assertTrue(cleaned.mask[20, 20])  # Inf
        self.assertTrue(cleaned.mask[30, 30])  # Flag
        self.assertTrue(cleaned.mask[40, 40])  # Negative variance

    # -----------------------------------------------------------------------
    # 2 & 3. Source Extraction & Astrometric Calibration Tests
    # -----------------------------------------------------------------------
    def test_extract_point_sources_dao_and_iraf(self):
        cleaned = prepare_and_mask_fits(self.scan1_path)

        # DAOStarFinder extraction
        sources_dao, diag_dao = extract_point_sources(
            cleaned, epoch_idx=1, sigma_threshold=5.0, method="DAOStarFinder"
        )
        self.assertGreater(len(sources_dao), 100)
        self.assertEqual(diag_dao["detected_count"], len(sources_dao))

        # Check astrometric calibration on the first detection
        first = sources_dao[0]
        self.assertIsInstance(first, AstrometricPointSource)
        self.assertGreater(first.ra_deg, 150.0)
        self.assertLess(first.ra_deg, 180.0)
        self.assertGreater(first.dec_deg, 20.0)
        self.assertLess(first.dec_deg, 40.0)
        self.assertGreater(first.snr, 5.0)

        # IRAFStarFinder extraction
        sources_iraf, diag_iraf = extract_point_sources(
            cleaned, epoch_idx=1, sigma_threshold=5.0, method="IRAFStarFinder"
        )
        self.assertGreater(len(sources_iraf), 50)

    # -----------------------------------------------------------------------
    # 4. Cross-Matching & Blinking Tests
    # -----------------------------------------------------------------------
    def test_cross_match_and_blink_real_scans(self):
        cleaned1 = prepare_and_mask_fits(self.scan1_path)
        cleaned2 = prepare_and_mask_fits(self.scan2_path)

        det1, _ = extract_point_sources(cleaned1, epoch_idx=1)
        det2, _ = extract_point_sources(cleaned2, epoch_idx=2)

        candidates, stationary, diag = cross_match_and_blink_epochs(
            detections_ep1=det1,
            detections_ep2=det2,
            tolerance_arcsec=3.0,
            max_rate_arcsec_per_day=1500.0,
        )

        # The two test scans contain ~137 stationary stars and 1 moving object
        self.assertGreaterEqual(len(stationary), 100)
        self.assertEqual(len(candidates), 1)

        mover = candidates[0]
        self.assertEqual(mover.candidate_id, "CAND-001")
        self.assertAlmostEqual(mover.dt_hours, 4.0, places=1)
        self.assertGreater(mover.separation_arcsec, 50.0)
        self.assertLess(mover.separation_arcsec, 80.0)
        self.assertGreater(mover.angular_rate_arcsec_per_day, 300.0)
        self.assertLess(mover.angular_rate_arcsec_per_day, 500.0)

        # Rule 1 & Rule 2 compliance
        self.assertEqual(mover.model_tag, "Illustrative")
        self.assertEqual(mover.epistemic_labels["angular_rate_arcsec_per_day"], "derived")

    def test_cross_match_velocity_outlier_rejection(self):
        # Create synthetic detections with unphysical velocity (> 1500 arcsec/day)
        det1 = [
            AstrometricPointSource(
                epoch_idx=1,
                obs_time_iso="2026-01-01T00:00:00.000",
                pixel_x=10.0,
                pixel_y=10.0,
                ra_deg=100.0,
                dec_deg=10.0,
                peak_flux=50.0,
                flux=500.0,
                snr=25.0,
            )
        ]
        # In 1 hour (0.04167 days), moves 0.1 deg = 360 arcsec => rate = 8640 arcsec/day
        det2 = [
            AstrometricPointSource(
                epoch_idx=2,
                obs_time_iso="2026-01-01T01:00:00.000",
                pixel_x=200.0,
                pixel_y=200.0,
                ra_deg=100.1,
                dec_deg=10.0,
                peak_flux=50.0,
                flux=500.0,
                snr=25.0,
            )
        ]

        candidates, stationary, diag = cross_match_and_blink_epochs(
            det1, det2, tolerance_arcsec=3.0, max_rate_arcsec_per_day=1500.0
        )
        self.assertEqual(len(candidates), 0)
        self.assertEqual(diag["false_tracks_count"], 1)

    # -----------------------------------------------------------------------
    # 5. Parallax & Distance Estimation Tests
    # -----------------------------------------------------------------------
    def test_estimate_unknown_mover_distance(self):
        d1 = AstrometricPointSource(
            epoch_idx=1,
            obs_time_iso="2025-04-24T18:01:05.843",
            pixel_x=500.0,
            pixel_y=500.0,
            ra_deg=164.212,
            dec_deg=30.314,
            peak_flux=140.0,
            flux=970.0,
            snr=7000.0,
        )
        d2 = AstrometricPointSource(
            epoch_idx=2,
            obs_time_iso="2025-04-24T22:01:05.843",
            pixel_x=506.0,
            pixel_y=508.0,
            ra_deg=164.216,
            dec_deg=30.296,
            peak_flux=130.0,
            flux=1100.0,
            snr=6800.0,
        )
        cand = MoverCandidateTrack(
            candidate_id="TEST-CAND",
            epoch_1=d1,
            epoch_2=d2,
            dt_hours=4.0,
            dt_days=0.16667,
            separation_arcsec=65.45,
            angular_rate_arcsec_per_hour=16.36,
            angular_rate_arcsec_per_day=392.7,
            motion_angle_deg=170.0,
        )

        estimate = estimate_unknown_mover_distance(cand)
        self.assertIsNotNone(estimate)
        self.assertGreater(estimate.earth_baseline_au, 0.001)
        self.assertGreater(estimate.earth_baseline_km, 100000.0)
        self.assertGreaterEqual(estimate.min_au, 5.0)
        self.assertLessEqual(estimate.max_au, 1000.0)
        self.assertGreater(estimate.max_au, estimate.min_au)

        # Rule 1 & Rule 2 checks
        self.assertEqual(estimate.model_tag, "Illustrative")
        self.assertEqual(estimate.epistemic_labels["min_au"], "derived")
        self.assertEqual(estimate.epistemic_labels["max_au"], "derived")
        self.assertEqual(estimate.epistemic_labels["bound_orbit_assumption"], "assumed")
        self.assertIn("Keplerian", estimate.assumption)

    # -----------------------------------------------------------------------
    # End-to-End Orchestrator Pipeline Test
    # -----------------------------------------------------------------------
    def test_pipeline_orchestration_full_run(self):
        output_json = self.temp_path / "candidates_out.json"
        pipeline = MoverDetectionPipeline()
        result = pipeline.analyze_epochs(
            fits_epoch1=self.scan1_path,
            fits_epoch2=self.scan2_path,
            output_json=output_json,
        )

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["summary"]["candidate_movers_count"], 1)
        self.assertTrue(output_json.is_file())

        with open(output_json, "r", encoding="utf-8") as f:
            saved_data = json.load(f)
        self.assertEqual(saved_data["status"], "success")
        self.assertEqual(len(saved_data["candidate_movers"]), 1)
        self.assertEqual(saved_data["candidate_movers"][0]["model_tag"], "Illustrative")
        self.assertIn("parallax", saved_data["candidate_movers"][0])


if __name__ == "__main__":
    unittest.main()
