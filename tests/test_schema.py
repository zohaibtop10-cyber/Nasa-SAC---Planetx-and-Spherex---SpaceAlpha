"""
Unit tests for JSON data contracts and domain validation rules using standard unittest.
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

from pipeline.schema import (
    ContractValidationError,
    validate_candidate_domain_rules,
    validate_candidates_data,
    validate_file,
    validate_json_schema,
)


class TestSchemaContracts(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="schema_test_")
        self.temp_path = Path(self.temp_dir)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def get_valid_unknown_candidate(self) -> dict:
        return {
            "id": "cand_2026_001",
            "field_id": "field_wise0855",
            "release_batch": "2026-W42",
            "positions": [
                {"time": "2026-03-01T12:00:00Z", "ra": 133.795, "dec": -7.245, "err": 0.08},
                {"time": "2026-09-01T12:00:00Z", "ra": 133.805, "dec": -7.248, "err": 0.09},
            ],
            "verdict": "unknown",
            "reason_chain": [
                "Source detected at 6.2 sigma in SPHEREx QR2 Band 3",
                "Cross-matched against JPL Small-Body Ident (5 arcsec radius): no known asteroid match",
                "Cross-matched against Gaia DR3 (3 arcsec radius): no star catalog match",
                "Classified as unknown mover pending multi-epoch baseline extension",
            ],
            "confidence": 0.88,
            "match": None,
            "distance_range": {
                "min_au": 45.0,
                "max_au": 180.0,
                "assumption": "Calculated from 6-month Earth-SPHEREx 2.0 AU orbital baseline parallax",
            },
            "colour_index": 1.42,
            "labels": {
                "confidence": "derived",
                "colour_index": "measured",
                "distance_min_au": "derived",
                "distance_max_au": "derived",
                "positions.ra": "measured",
                "positions.dec": "measured",
                "positions.err": "derived",
            },
        }

    def get_valid_known_candidate(self) -> dict:
        return {
            "id": "cand_2026_002",
            "field_id": "field_asteroid_ceres",
            "release_batch": "2026-W42",
            "positions": [
                {"time": "2026-04-10T00:00:00Z", "ra": 180.12, "dec": 12.34, "err": 0.05},
                {"time": "2026-04-11T00:00:00Z", "ra": 180.18, "dec": 12.39, "err": 0.05},
            ],
            "verdict": "known_object",
            "reason_chain": [
                "Source detected at 14.5 sigma in SPHEREx QR2",
                "Matched JPL Small-Body Ident: 1 Ceres with separation 0.32 arcsec",
            ],
            "confidence": 0.99,
            "match": {
                "catalog": "JPL Small-Body Ident",
                "designation": "1 Ceres",
                "separation_arcsec": 0.32,
            },
            "distance_range": None,
            "colour_index": 0.78,
            "labels": {
                "confidence": "derived",
                "colour_index": "measured",
                "positions.ra": "measured",
                "positions.dec": "measured",
                "positions.err": "derived",
                "separation_arcsec": "derived",
            },
        }

    def test_valid_candidates_pass(self):
        cand1 = self.get_valid_unknown_candidate()
        cand2 = self.get_valid_known_candidate()
        payload = {"candidates": [cand1, cand2]}
        validate_candidates_data(payload)

    def test_empty_reason_chain_fails(self):
        cand = self.get_valid_unknown_candidate()
        cand["reason_chain"] = []
        payload = {"candidates": [cand]}
        with self.assertRaises(ContractValidationError) as ctx:
            validate_candidates_data(payload)
        self.assertIn("reason_chain", str(ctx.exception))

    def test_single_position_fails(self):
        cand = self.get_valid_unknown_candidate()
        cand["positions"] = [cand["positions"][0]]
        payload = {"candidates": [cand]}
        with self.assertRaises(ContractValidationError) as ctx:
            validate_candidates_data(payload)
        self.assertIn("positions", str(ctx.exception))

    def test_unknown_verdict_without_distance_range_fails(self):
        cand = self.get_valid_unknown_candidate()
        cand["distance_range"] = None
        payload = {"candidates": [cand]}
        with self.assertRaises(ContractValidationError) as ctx:
            validate_candidates_data(payload)
        self.assertIn("distance_range", str(ctx.exception))

    def test_known_verdict_with_distance_range_fails(self):
        cand = self.get_valid_known_candidate()
        cand["distance_range"] = {
            "min_au": 2.5,
            "max_au": 3.0,
            "assumption": "Invalid assumption",
        }
        payload = {"candidates": [cand]}
        with self.assertRaises(ContractValidationError) as ctx:
            validate_candidates_data(payload)
        self.assertIn("exists only for 'unknown' verdicts", str(ctx.exception))

    def test_missing_confidence_label_fails(self):
        cand = self.get_valid_unknown_candidate()
        del cand["labels"]["confidence"]
        payload = {"candidates": [cand]}
        with self.assertRaises(ContractValidationError) as ctx:
            validate_candidates_data(payload)
        self.assertIn("confidence", str(ctx.exception))

    def test_missing_distance_range_label_fails(self):
        cand = self.get_valid_unknown_candidate()
        del cand["labels"]["distance_min_au"]
        payload = {"candidates": [cand]}
        with self.assertRaises(ContractValidationError) as ctx:
            validate_candidates_data(payload)
        self.assertIn("distance_range", str(ctx.exception))

    def test_invalid_label_name_fails(self):
        cand = self.get_valid_unknown_candidate()
        cand["labels"]["confidence"] = "estimated"
        payload = {"candidates": [cand]}
        with self.assertRaises(ContractValidationError) as ctx:
            validate_candidates_data(payload)
        self.assertTrue("not one of" in str(ctx.exception) or "must be one of" in str(ctx.exception))

    def test_validate_config_file_against_schema(self):
        config_path = ROOT / "config.json"
        self.assertTrue(config_path.is_file())
        data = validate_file(config_path, "config")
        self.assertEqual(data["detect"]["sigma"], 5.0)
        self.assertIn("measured", data["labels"])

    def test_validate_fields_schema(self):
        fields_data = {
            "fields": [
                {
                    "id": "field_wise0855",
                    "name": "WISE 0855-0714 Field",
                    "ra_deg": 133.795,
                    "dec_deg": -7.245,
                    "fov_deg": 0.5,
                    "description": "High proper motion sub-brown dwarf test benchmark",
                    "target_type": "benchmark_brown_dwarf",
                    "scans": [
                        {"scan_id": "SPHEREx_S1_001", "epoch_utc": "2026-03-01T12:00:00Z"},
                        {"scan_id": "SPHEREx_S2_002", "epoch_utc": "2026-09-01T12:00:00Z"},
                    ],
                    "labels": {
                        "ra_deg": "measured",
                        "dec_deg": "measured",
                        "fov_deg": "assumed",
                    },
                }
            ]
        }
        field_file = self.temp_path / "test_fields.json"
        field_file.write_text(json.dumps(fields_data), encoding="utf-8")
        data = validate_file(field_file, "fields")
        self.assertEqual(len(data["fields"]), 1)


if __name__ == "__main__":
    unittest.main()
