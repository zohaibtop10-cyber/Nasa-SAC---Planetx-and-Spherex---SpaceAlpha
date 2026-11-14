"""
Unit tests for pipeline.export.data_structuring using Python's standard unittest.
Validates all 5 steps of the data structuring and export workflow:
1. Triage Logic (known_asteroid, fast_moving_star, artifact, unknown)
2. Reason Chain (structured reason steps with rule, passed, detail)
3. Honesty Labels (Rule 1: measured, derived, assumed)
4. Schema Validation (candidate.schema.json validation and error aborts)
5. Export (compilation to web/public/data/candidates.json)
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

from pipeline.export.data_structuring import (
    DEFAULT_SCHEMA_PATH,
    ExportValidationError,
    ReasonStep,
    assign_triage_verdict,
    build_candidate_labels,
    build_reason_chain,
    compile_and_export_candidates,
    estimate_asteroid_size_km,
    structure_mover_candidate,
    validate_against_candidate_schema,
)


class TestDataStructuring(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="data_structuring_test_")
        self.temp_path = Path(self.temp_dir)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    # -----------------------------------------------------------------------
    # 1. Triage Logic Tests
    # -----------------------------------------------------------------------
    def test_triage_artifact_on_single_epoch(self):
        positions = [{"time": "2026-04-12T00:00:00Z", "ra": 180.0, "dec": 10.0, "err": 0.05}]
        verdict, conf, match = assign_triage_verdict(positions=positions)
        self.assertEqual(verdict, "artifact")
        self.assertGreaterEqual(conf, 0.95)
        self.assertIsNone(match)

    def test_triage_artifact_on_unphysical_velocity(self):
        positions = [
            {"time": "2026-04-12T00:00:00Z", "ra": 180.0, "dec": 10.0, "err": 0.05},
            {"time": "2026-04-12T04:00:00Z", "ra": 182.0, "dec": 10.0, "err": 0.05},
        ]
        verdict, conf, _ = assign_triage_verdict(positions=positions, angular_rate_arcsec_day=5000.0)
        self.assertEqual(verdict, "artifact")

    def test_triage_known_asteroid(self):
        positions = [
            {"time": "2026-04-12T00:00:00Z", "ra": 180.0, "dec": 10.0, "err": 0.05},
            {"time": "2026-04-12T04:00:00Z", "ra": 180.01, "dec": 10.0, "err": 0.05},
        ]
        jpl_match = {
            "catalog": "NASA/JPL Small-Body Database (SSD)",
            "designation": "1 Ceres",
            "body_type": "asteroid",
            "separation_arcsec": 1.15,
        }
        verdict, conf, match = assign_triage_verdict(positions=positions, jpl_match=jpl_match)
        self.assertIn(verdict, ("known_asteroid", "known_object"))
        self.assertGreaterEqual(conf, 0.95)
        self.assertIsNotNone(match)
        self.assertEqual(match["designation"], "1 Ceres")

    def test_triage_fast_moving_star(self):
        positions = [
            {"time": "2026-04-12T00:00:00Z", "ra": 180.0, "dec": 10.0, "err": 0.05},
            {"time": "2026-04-12T04:00:00Z", "ra": 180.005, "dec": 10.0, "err": 0.05},
        ]
        gaia_match = {
            "catalog": "ESA Gaia DR3",
            "source_id": "GAIA-DR3-4472832130942575872",
            "separation_arcsec": 0.42,
        }
        verdict, conf, match = assign_triage_verdict(positions=positions, gaia_match=gaia_match)
        self.assertIn(verdict, ("fast_moving_star", "high_motion_star"))
        self.assertIsNotNone(match)

    def test_triage_unknown_mover(self):
        positions = [
            {"time": "2026-04-12T00:00:00Z", "ra": 180.0, "dec": 10.0, "err": 0.05},
            {"time": "2026-04-12T04:00:00Z", "ra": 180.02, "dec": 10.0, "err": 0.05},
        ]
        verdict, conf, match = assign_triage_verdict(positions=positions)
        self.assertEqual(verdict, "unknown")
        self.assertIsNone(match)

    # -----------------------------------------------------------------------
    # 2. Reason Chain Tests
    # -----------------------------------------------------------------------
    def test_build_reason_chain_structured_objects(self):
        positions = [
            {"time": "2026-04-12T00:00:00Z", "ra": 180.0, "dec": 10.0, "err": 0.05},
            {"time": "2026-04-12T04:00:00Z", "ra": 180.02, "dec": 10.0, "err": 0.05},
        ]
        dist_range = {"min_au": 15.0, "max_au": 25.0, "assumption": "Keplerian bound prior"}

        chain = build_reason_chain(
            verdict="unknown",
            positions=positions,
            angular_rate_arcsec_day=350.0,
            distance_range=dist_range,
            as_structured_objects=True,
        )

        self.assertGreaterEqual(len(chain), 3)
        self.assertIsInstance(chain[0], dict)
        self.assertIn("rule", chain[0])
        self.assertIn("passed", chain[0])
        self.assertIn("detail", chain[0])
        self.assertTrue(chain[0]["passed"])

    # -----------------------------------------------------------------------
    # 3. Honesty Labels Tests (Rule 1 Compliance)
    # -----------------------------------------------------------------------
    def test_build_candidate_labels_provenance(self):
        labels = build_candidate_labels(
            has_match=True,
            has_distance_range=True,
            has_velocity=True,
            has_size=True,
        )

        # Every label must be strictly one of the 3 honesty tags
        allowed = {"measured", "derived", "assumed"}
        for k, v in labels.items():
            self.assertIn(v, allowed, f"Label {k}={v} is not a valid honesty tag")

        self.assertEqual(labels["positions.ra"], "measured")
        self.assertEqual(labels["positions.dec"], "measured")
        self.assertEqual(labels["velocity_arcsec_day"], "derived")
        self.assertEqual(labels["distance_min_au"], "derived")
        self.assertEqual(labels["estimated_size_km"], "assumed")

    def test_estimate_asteroid_size_km_assumed(self):
        size = estimate_asteroid_size_km(flux_snr=100.0, distance_au=2.7, albedo=0.154)
        self.assertGreater(size, 0.1)
        self.assertLess(size, 1000.0)

    # -----------------------------------------------------------------------
    # 4. Schema Validation Tests
    # -----------------------------------------------------------------------
    def test_validate_against_candidate_schema_success(self):
        pos = [
            {"time": "2026-04-12T00:00:00Z", "ra": 180.0, "dec": 10.0, "err": 0.05},
            {"time": "2026-04-12T04:00:00Z", "ra": 180.02, "dec": 10.0, "err": 0.05},
        ]
        cand = structure_mover_candidate(
            candidate_id="CAND-TEST-001",
            field_id="field_test",
            positions=pos,
            verdict="unknown",
            distance_range={"min_au": 12.0, "max_au": 22.0, "assumption": "Keplerian bound prior"},
            velocity_arcsec_day=320.5,
        )

        payload = {"candidates": [cand]}
        # Should not raise ExportValidationError
        validate_against_candidate_schema(payload)

    def test_validate_against_candidate_schema_aborts_on_invalid_data(self):
        # Corrupted candidate missing required fields and invalid label
        invalid_payload = {
            "candidates": [
                {
                    "id": "CORRUPTED",
                    "verdict": "not_a_valid_verdict",
                    "labels": {"bogus": "unsupported_label"},
                }
            ]
        }
        with self.assertRaises(ExportValidationError):
            validate_against_candidate_schema(invalid_payload)

    # -----------------------------------------------------------------------
    # 5. Export Tests
    # -----------------------------------------------------------------------
    def test_compile_and_export_candidates(self):
        pos = [
            {"time": "2026-04-12T00:00:00Z", "ra": 180.0, "dec": 10.0, "err": 0.05},
            {"time": "2026-04-12T04:00:00Z", "ra": 180.02, "dec": 10.0, "err": 0.05},
        ]
        cand1 = structure_mover_candidate(
            candidate_id="CAND-EXP-001",
            field_id="field_test",
            positions=pos,
            verdict="unknown",
            distance_range={"min_au": 15.0, "max_au": 25.0, "assumption": "Keplerian reflex motion"},
            velocity_arcsec_day=410.0,
        )
        cand2 = structure_mover_candidate(
            candidate_id="CAND-EXP-002",
            field_id="field_test",
            positions=pos,
            verdict="known_asteroid",
            jpl_match={"catalog": "NASA/JPL SBDB", "designation": "4 Vesta", "separation_arcsec": 0.8},
            velocity_arcsec_day=350.0,
        )

        out_file = self.temp_path / "candidates_exported.json"
        res = compile_and_export_candidates(
            candidates_list=[cand1, cand2],
            output_path=out_file,
            validate=True,
        )

        self.assertEqual(res["status"], "success")
        self.assertEqual(res["candidate_count"], 2)
        self.assertTrue(out_file.is_file())

        with open(out_file, "r", encoding="utf-8") as f:
            saved = json.load(f)
        self.assertEqual(len(saved["candidates"]), 2)
        self.assertEqual(saved["candidates"][0]["id"], "CAND-EXP-001")
        self.assertEqual(saved["candidates"][1]["id"], "CAND-EXP-002")


if __name__ == "__main__":
    unittest.main()
