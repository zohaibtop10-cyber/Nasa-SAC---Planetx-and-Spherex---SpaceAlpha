"""
Unit tests for pipeline.ingestion.nasa_fetcher using Python's standard unittest.
Validates:
1. Sexagesimal coordinate conversions (RA and Dec)
2. Targets configuration loading and validation
3. CacheManager (SQLite and JSON) storage, retrieval, and stale fallback
4. SPHEREx synthetic Level 2 FITS fallback generation
5. JPL Small Body Identification parsing and epistemic labeling
6. JPL Horizons Cartesian vector parsing ($$SOE...$$EOE), AU conversion, and Rule 2 compliance
7. NasaDataFetcher orchestrator dry-run and manifest output
"""

import json
import os
import shutil
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure project root is in sys.path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.ingestion.nasa_fetcher import (
    CacheManager,
    JPLHorizonsService,
    JPLIdentificationService,
    NasaDataFetcher,
    SPHERExImageIngestor,
    StateVectors,
)


class TestNasaFetcher(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="nasa_fetcher_test_")
        self.temp_path = Path(self.temp_dir)
        self.cache_dir = self.temp_path / "cache"
        self.fits_dir = self.temp_path / "fits"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.fits_dir.mkdir(parents=True, exist_ok=True)

        self.mock_config_path = self.temp_path / "targets.json"
        self.mock_config = {
            "spherex_collection": "spherex_qr3",
            "fallback_collection": "spherex_dr1",
            "cutout_size_deg": 0.1,
            "max_retries": 2,
            "backoff_factor": 1.0,
            "rate_limit_pause_seconds": 0.01,
            "targets": [
                {
                    "id": "TEST_TARGET",
                    "name": "Test Celestial Body",
                    "ra": 180.0,
                    "dec": 10.0,
                    "notes": "Test target note",
                }
            ],
            "discovery_zones": [
                {
                    "id": "TEST_ZONE",
                    "name": "Test Discovery Zone",
                    "ra_min": 179.0,
                    "ra_max": 181.0,
                    "dec_min": 9.0,
                    "dec_max": 11.0,
                }
            ],
        }
        with open(self.mock_config_path, "w", encoding="utf-8") as f:
            json.dump(self.mock_config, f)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    # -----------------------------------------------------------------------
    # 1. Coordinate Conversion Tests
    # -----------------------------------------------------------------------
    def test_deg_to_sexagesimal(self):
        ra_sex, dec_sex = JPLIdentificationService.decimal_to_sexagesimal(180.0, 30.31)
        self.assertTrue(ra_sex.startswith("12-00-00"))
        self.assertTrue(dec_sex.startswith("+30-18-"))

        ra_0, dec_neg = JPLIdentificationService.decimal_to_sexagesimal(0.0, -15.5)
        self.assertTrue(ra_0.startswith("00-00-00"))
        self.assertTrue(dec_neg.startswith("-15-30-"))

    # -----------------------------------------------------------------------
    # 2. Config Loader Tests
    # -----------------------------------------------------------------------
    def test_load_configuration_success(self):
        fetcher = NasaDataFetcher(
            config_path=self.mock_config_path,
            fits_dir=self.fits_dir,
            cache_dir=self.cache_dir,
        )
        targets, zones = fetcher.load_configuration()
        self.assertEqual(len(targets), 1)
        self.assertEqual(targets[0].id, "TEST_TARGET")
        self.assertEqual(len(zones), 1)
        self.assertEqual(zones[0].id, "TEST_ZONE")
        # Ensure center coordinates were automatically calculated
        self.assertAlmostEqual(zones[0].center_ra, 180.0)
        self.assertAlmostEqual(zones[0].center_dec, 10.0)

    def test_load_configuration_missing_file(self):
        fetcher = NasaDataFetcher(
            config_path=Path("non_existent_config_file_xyz.json"),
            fits_dir=self.fits_dir,
            cache_dir=self.cache_dir,
        )
        with self.assertRaises(FileNotFoundError):
            fetcher.load_configuration()

    # -----------------------------------------------------------------------
    # 3. Cache Manager Tests (SQLite & JSON)
    # -----------------------------------------------------------------------
    def test_cache_manager_sqlite_and_json(self):
        cache = CacheManager(cache_dir=self.cache_dir)
        service = "test_service"
        params = {"query": "sample_query", "ra": 180.0}
        payload = {"status": "ok", "count": 42}

        # Initial miss
        cached_val, freshness = cache.get(service, params)
        self.assertIsNone(cached_val)
        self.assertEqual(freshness, "miss")

        # Store in cache
        cache.set(service, params, payload, freshness="fresh")

        # Verify hit
        cached_val, freshness = cache.get(service, params)
        self.assertEqual(cached_val, payload)
        self.assertEqual(freshness, "cached")

        # Verify stale handling with max_age_hours=-1.0
        cached_val, freshness = cache.get(service, params, max_age_hours=-1.0)
        self.assertEqual(cached_val, payload)
        self.assertEqual(freshness, "stale")

        # Verify SQLite table directly
        db_path = self.cache_dir / "pipeline_cache.sqlite"
        self.assertTrue(db_path.exists())
        with sqlite3.connect(db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT response_json, service FROM api_cache")
            row = cur.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(json.loads(row[0]), payload)
            self.assertEqual(row[1], service)

    # -----------------------------------------------------------------------
    # 4. SPHEREx Synthetic FITS Generation
    # -----------------------------------------------------------------------
    def test_spherex_synthetic_fits_generation(self):
        cache = CacheManager(cache_dir=self.cache_dir)
        ingestor = SPHERExImageIngestor(fits_dir=self.fits_dir, cache_manager=cache)

        out_path = self.fits_dir / "synthetic_test.fits"
        result = ingestor._generate_fallback_fits_slice(
            target_id="TEST_BODY",
            ra=123.45,
            dec=-12.34,
            dest_path=out_path,
        )

        self.assertTrue(out_path.exists())
        self.assertGreater(out_path.stat().st_size, 0)
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["freshness"], "offline_fallback")

    # -----------------------------------------------------------------------
    # 5. JPL Small Body Identification Parsing Tests
    # -----------------------------------------------------------------------
    def test_jpl_identification_parsing(self):
        cache = CacheManager(cache_dir=self.cache_dir)
        service = JPLIdentificationService(cache_manager=cache)

        mock_sb_response = {
            "count": 2,
            "fields": ["pdes", "name", "mag", "ra", "dec"],
            "data": [
                ["1", "Ceres", 8.4, "10 56 50.40", "+30 18 36.0"],
                ["4", "Vesta", 7.1, "10 56 48.00", "+30 19 00.0"],
            ],
        }

        results = service._parse_sb_ident_response(
            raw_data=mock_sb_response,
            center_ra=164.21,
            center_dec=30.31,
        )

        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["name"], "Ceres")
        self.assertEqual(results[0]["designation"], "1")
        self.assertEqual(results[0]["label"], "derived")
        self.assertEqual(results[1]["name"], "Vesta")

    # -----------------------------------------------------------------------
    # 6. JPL Horizons Service Parsing & Epistemic Rules Tests
    # -----------------------------------------------------------------------
    def test_jpl_horizons_parsing_and_epistemic_labels(self):
        cache = CacheManager(cache_dir=self.cache_dir)
        horizons = JPLHorizonsService(cache_manager=cache)

        horizons_text = (
            "*******************************************************************************\n"
            "$$SOE\n"
            "2460629.000000000 = A.D. 2026-Nov-14 00:00:00.0000 TDB\n"
            " X =-3.854095818968772E+08 Y = 1.353342045952864E+08 Z = 1.401140939527926E+08\n"
            " VX=-5.975791223961205E+00 VY=-1.355157147321580E+01 VZ=-2.126462744886918E+00\n"
            " LT= 1.448554287893114E+03 RG= 4.342656910996841E+08 RR= 7.009314486576856E+00\n"
            "$$EOE\n"
            "*******************************************************************************\n"
        )

        vectors = horizons._parse_horizons_vector_text("1 Ceres", "2026-11-14T00:00:00Z", horizons_text)

        self.assertIsNotNone(vectors)
        self.assertEqual(vectors.target_name, "1 Ceres")
        self.assertEqual(vectors.frame, "Heliocentric ICRS")

        # Validate conversion from km to AU (approx -3.85e8 / 1.496e8 ~= -2.57 AU)
        self.assertTrue(-3.0 < vectors.x_au < -2.0)

        # Rule 1 & Rule 2 checks
        self.assertEqual(vectors.tag, "Illustrative")
        self.assertEqual(vectors.label, "derived")

        # Test dictionary export
        vec_dict = vectors.to_dict()
        self.assertEqual(vec_dict["tag"], "Illustrative")
        self.assertEqual(vec_dict["label"], "derived")

    def test_jpl_horizons_keplerian_fallback(self):
        cache = CacheManager(cache_dir=self.cache_dir)
        horizons = JPLHorizonsService(cache_manager=cache)

        fallback_vecs = horizons._fallback_keplerian_vectors("1 Ceres", "2026-11-14T00:00:00Z")
        self.assertIsNotNone(fallback_vecs)
        self.assertEqual(fallback_vecs.target_name, "1 Ceres")
        self.assertEqual(fallback_vecs.tag, "Illustrative")
        self.assertEqual(fallback_vecs.label, "derived")
        self.assertEqual(fallback_vecs.freshness, "offline_fallback")

    # -----------------------------------------------------------------------
    # 7. Orchestration Dry-Run Test
    # -----------------------------------------------------------------------
    def test_nasa_data_fetcher_orchestration_dry_run(self):
        manifest_path = self.temp_path / "manifest.json"
        log_path = self.temp_path / "ingestion.log"

        fetcher = NasaDataFetcher(
            config_path=self.mock_config_path,
            fits_dir=self.fits_dir,
            cache_dir=self.cache_dir,
            log_path=log_path,
            manifest_path=manifest_path,
        )

        result = fetcher.run(dry_run=True)
        self.assertEqual(result["status"], "dry_run")
        self.assertEqual(result["targets_count"], 1)
        self.assertEqual(result["zones_count"], 1)


if __name__ == "__main__":
    unittest.main()
