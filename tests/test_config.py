"""Tests for pipeline configuration loading and validation."""

import json
from pathlib import Path

import pytest
from pipeline.config import (
    DetectConfig,
    KnownConfig,
    LinkConfig,
    ParallaxConfig,
    PipelineConfig,
    StarsConfig,
    load_config,
)


def test_load_default_config():
    """Verify that the repository default config.json loads cleanly with all required keys."""
    cfg = load_config()

    assert isinstance(cfg, PipelineConfig)
    assert cfg.detect.sigma == 5.0
    assert cfg.link.max_rate_arcsec_per_day == 1500.0
    assert cfg.link.min_detections == 2
    assert cfg.known.tolerance_arcsec == 5.0
    assert cfg.stars.tolerance_arcsec == 3.0
    assert cfg.parallax.d_min_au == 5.0
    assert cfg.parallax.d_max_au == 1000.0
    assert cfg.parallax.d_step == 1.0

    # Non-negotiable mandatory labels
    assert "measured" in cfg.labels
    assert "derived" in cfg.labels
    assert "assumed" in cfg.labels
    assert cfg.validate_label("measured") is True
    assert cfg.validate_label("invalid_label") is False


def test_config_missing_key_raises(tmp_path: Path):
    """Verify that omitting a required key raises KeyError with an informative message."""
    bad_data = {
        "detect": {"sigma": 5.0},
        "link": {"max_rate_arcsec_per_day": 1500.0},  # missing min_detections
        "known": {"tolerance_arcsec": 5.0},
        "stars": {"tolerance_arcsec": 3.0},
        "parallax": {"d_min_au": 5.0, "d_max_au": 1000.0, "d_step": 1.0},
        "labels": ["measured", "derived", "assumed"],
    }
    cfg_file = tmp_path / "bad_config.json"
    cfg_file.write_text(json.dumps(bad_data), encoding="utf-8")

    with pytest.raises(KeyError) as exc_info:
        load_config(cfg_file)
    assert "min_detections" in str(exc_info.value)


def test_config_invalid_values_raises(tmp_path: Path):
    """Verify that negative or inverted parameters raise ValueError."""
    bad_data = {
        "detect": {"sigma": -1.0},
        "link": {"max_rate_arcsec_per_day": 1500.0, "min_detections": 2},
        "known": {"tolerance_arcsec": 5.0},
        "stars": {"tolerance_arcsec": 3.0},
        "parallax": {"d_min_au": 5.0, "d_max_au": 1000.0, "d_step": 1.0},
        "labels": ["measured", "derived", "assumed"],
    }
    cfg_file = tmp_path / "bad_config.json"
    cfg_file.write_text(json.dumps(bad_data), encoding="utf-8")

    with pytest.raises(ValueError) as exc_info:
        load_config(cfg_file)
    assert "sigma" in str(exc_info.value)


def test_config_missing_mandatory_labels_raises(tmp_path: Path):
    """Verify that omitting 'measured', 'derived', or 'assumed' violates non-negotiables."""
    bad_data = {
        "detect": {"sigma": 5.0},
        "link": {"max_rate_arcsec_per_day": 1500.0, "min_detections": 2},
        "known": {"tolerance_arcsec": 5.0},
        "stars": {"tolerance_arcsec": 3.0},
        "parallax": {"d_min_au": 5.0, "d_max_au": 1000.0, "d_step": 1.0},
        "labels": ["measured", "derived"],  # missing 'assumed'
    }
    cfg_file = tmp_path / "bad_config.json"
    cfg_file.write_text(json.dumps(bad_data), encoding="utf-8")

    with pytest.raises(ValueError) as exc_info:
        load_config(cfg_file)
    assert "mandatory non-negotiables" in str(exc_info.value)
