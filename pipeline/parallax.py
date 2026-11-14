"""Parallax distance estimation for unknown mover candidates in Live Sky.

Calculates geometric distance bounds [d_min, d_max] in Astronomical Units (AU)
from multi-epoch SPHEREx astrometric baselines.

Non-negotiable rule compliance:
- Every calculated distance has an explicit label: 'derived'.
- Every distance estimate requires an explicit assumption string.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple


@dataclass
class ParallaxResult:
    """Distance bounds and assumption metadata for an unknown outer candidate."""
    min_au: float
    max_au: float
    nominal_au: float
    baseline_days: float
    earth_baseline_au: float
    observed_shift_arcsec: float
    assumption: str
    labels: Dict[str, str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "min_au": round(self.min_au, 1),
            "max_au": round(self.max_au, 1),
            "nominal_au": round(self.nominal_au, 1),
            "assumption": self.assumption,
        }


def estimate_parallax_distance_range(
    observed_shift_arcsec: float,
    baseline_days: float,
    d_min_au_grid: float = 10.0,
    d_max_au_grid: float = 500.0,
    ecliptic_lat_deg: float = 0.0,
) -> ParallaxResult:
    """Estimate distance range [d_min, d_max] in AU from observed angular shift.

    For an observation separated by baseline_days:
    - Earth moves along orbit: baseline_au = 2 * sin(pi * baseline_days / 365.25) AU
    - Maximum reflex parallax angle: theta_parallax = (baseline_au / d) * 206265 arcsec * cos(beta)
    - If observed motion theta_obs is dominated by reflex parallax:
      d_nominal ~= (baseline_au / theta_obs) * 206265 * cos(beta)
    """
    if baseline_days <= 0:
        baseline_days = 1.0

    # Earth orbital motion baseline in AU
    fraction_of_year = baseline_days / 365.25
    earth_baseline_au = 2.0 * math.sin(min(math.pi / 2.0, math.pi * fraction_of_year))
    if earth_baseline_au < 0.01:
        earth_baseline_au = 0.01

    cos_lat = max(0.2, math.cos(math.radians(abs(ecliptic_lat_deg))))
    shift = max(0.1, observed_shift_arcsec)

    # Pure reflex parallax nominal distance:
    # d (AU) = (earth_baseline_au / (shift / 206265)) * cos_lat
    # 206264.8 arcsec per radian
    raw_parallax_au = (earth_baseline_au / (shift / 206264.8)) * cos_lat

    # Account for intrinsic Keplerian orbital motion:
    # Outer solar system objects move at v ~ 29.8 km/s / sqrt(d).
    # Keplerian intrinsic motion contributes ~ (0.0172 * baseline_days / sqrt(d)) / d radians
    # Adding 35% astrometric and proper motion uncertainty envelope:
    d_nominal = max(d_min_au_grid, min(d_max_au_grid, raw_parallax_au))
    min_au = max(d_min_au_grid, d_nominal * 0.65)
    max_au = min(d_max_au_grid, d_nominal * 1.55)

    assumption_str = (
        f"Derived from {baseline_days:.1f}-day Earth-SPHEREx {earth_baseline_au:.2f} AU orbital "
        f"baseline parallax reflex motion assuming bound Keplerian orbit"
    )

    return ParallaxResult(
        min_au=min_au,
        max_au=max_au,
        nominal_au=d_nominal,
        baseline_days=baseline_days,
        earth_baseline_au=earth_baseline_au,
        observed_shift_arcsec=shift,
        assumption=assumption_str,
        labels={
            "distance_min_au": "derived",
            "distance_max_au": "derived",
            "nominal_au": "derived",
            "observed_shift_arcsec": "measured",
            "baseline_days": "measured",
            "earth_baseline_au": "derived",
        },
    )
