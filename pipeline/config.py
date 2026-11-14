"""Configuration loader and schema validator for Live Sky pipeline."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List


@dataclass(frozen=True)
class DetectConfig:
    """Thresholds for source detection on difference / survey images."""
    sigma: float

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> DetectConfig:
        if "sigma" not in data:
            raise KeyError("Missing required key 'detect.sigma'")
        sigma = float(data["sigma"])
        if sigma <= 0:
            raise ValueError(f"'detect.sigma' must be positive, got {sigma}")
        return cls(sigma=sigma)


@dataclass(frozen=True)
class LinkConfig:
    """Parameters for linking multi-epoch detections into candidate tracks."""
    max_rate_arcsec_per_day: float
    min_detections: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> LinkConfig:
        for key in ("max_rate_arcsec_per_day", "min_detections"):
            if key not in data:
                raise KeyError(f"Missing required key 'link.{key}'")
        max_rate = float(data["max_rate_arcsec_per_day"])
        min_det = int(data["min_detections"])
        if max_rate <= 0:
            raise ValueError(f"'link.max_rate_arcsec_per_day' must be positive, got {max_rate}")
        if min_det < 2:
            raise ValueError(f"'link.min_detections' must be at least 2, got {min_det}")
        return cls(max_rate_arcsec_per_day=max_rate, min_detections=min_det)


@dataclass(frozen=True)
class KnownConfig:
    """Search tolerance for JPL Small-Body identification."""
    tolerance_arcsec: float

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> KnownConfig:
        if "tolerance_arcsec" not in data:
            raise KeyError("Missing required key 'known.tolerance_arcsec'")
        tol = float(data["tolerance_arcsec"])
        if tol <= 0:
            raise ValueError(f"'known.tolerance_arcsec' must be positive, got {tol}")
        return cls(tolerance_arcsec=tol)


@dataclass(frozen=True)
class StarsConfig:
    """Search tolerance for Gaia high proper motion star cross-matching."""
    tolerance_arcsec: float

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StarsConfig:
        if "tolerance_arcsec" not in data:
            raise KeyError("Missing required key 'stars.tolerance_arcsec'")
        tol = float(data["tolerance_arcsec"])
        if tol <= 0:
            raise ValueError(f"'stars.tolerance_arcsec' must be positive, got {tol}")
        return cls(tolerance_arcsec=tol)


@dataclass(frozen=True)
class ParallaxConfig:
    """Grid parameters for geometric parallax distance range estimation."""
    d_min_au: float
    d_max_au: float
    d_step: float

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ParallaxConfig:
        for key in ("d_min_au", "d_max_au", "d_step"):
            if key not in data:
                raise KeyError(f"Missing required key 'parallax.{key}'")
        d_min = float(data["d_min_au"])
        d_max = float(data["d_max_au"])
        d_step = float(data["d_step"])
        if d_min <= 0:
            raise ValueError(f"'parallax.d_min_au' must be positive, got {d_min}")
        if d_max <= d_min:
            raise ValueError(f"'parallax.d_max_au' ({d_max}) must be greater than 'parallax.d_min_au' ({d_min})")
        if d_step <= 0:
            raise ValueError(f"'parallax.d_step' must be positive, got {d_step}")
        return cls(d_min_au=d_min, d_max_au=d_max, d_step=d_step)


@dataclass(frozen=True)
class PipelineConfig:
    """Root configuration holding all pipeline parameters and non-negotiable labels."""
    detect: DetectConfig
    link: LinkConfig
    known: KnownConfig
    stars: StarsConfig
    parallax: ParallaxConfig
    labels: tuple[str, ...]

    def validate_label(self, label: str) -> bool:
        """Verify that a given numerical label is among the permitted non-negotiables."""
        return label in self.labels

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PipelineConfig:
        required_sections = ("detect", "link", "known", "stars", "parallax", "labels")
        for sec in required_sections:
            if sec not in data:
                raise KeyError(f"Missing required top-level configuration key: '{sec}'")

        labels = data["labels"]
        if not isinstance(labels, list) or not labels:
            raise ValueError("'labels' must be a non-empty list of permitted strings")

        # Non-negotiable mandatory labels
        mandatory = {"measured", "derived", "assumed"}
        if not mandatory.issubset(set(labels)):
            missing = mandatory - set(labels)
            raise ValueError(f"'labels' must contain mandatory non-negotiables: {missing}")

        return cls(
            detect=DetectConfig.from_dict(data["detect"]),
            link=LinkConfig.from_dict(data["link"]),
            known=KnownConfig.from_dict(data["known"]),
            stars=StarsConfig.from_dict(data["stars"]),
            parallax=ParallaxConfig.from_dict(data["parallax"]),
            labels=tuple(str(lbl) for lbl in labels),
        )


def find_config_path(explicit_path: Path | str | None = None) -> Path:
    """Find configuration file path using explicit arg, env var, or repo root fallback."""
    if explicit_path is not None:
        p = Path(explicit_path)
        if not p.is_file():
            raise FileNotFoundError(f"Configuration file not found at: {p.resolve()}")
        return p.resolve()

    env_path = os.environ.get("CONFIG_PATH")
    if env_path:
        p = Path(env_path)
        if not p.is_file():
            raise FileNotFoundError(f"CONFIG_PATH points to non-existent file: {p.resolve()}")
        return p.resolve()

    # Search in current directory, parent of pipeline package, or current working dir
    candidates = [
        Path.cwd() / "config.json",
        Path(__file__).resolve().parent.parent / "config.json",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()

    raise FileNotFoundError(
        "Could not locate 'config.json'. Checked working directory and repository root."
    )


def load_config(path: Path | str | None = None) -> PipelineConfig:
    """Load and validate the pipeline configuration from JSON."""
    config_file = find_config_path(path)
    with open(config_file, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON syntax in {config_file}: {exc}") from exc

    if not isinstance(data, dict):
        raise ValueError(f"Root of {config_file} must be a JSON object, got {type(data).__name__}")

    return PipelineConfig.from_dict(data)
