"""
pipeline.analysis - Analysis engines for SPHEREx imagery and multi-epoch mover detection.
"""

from pipeline.analysis.mover_detection import (
    AstrometricPointSource,
    CleanedImageData,
    MoverCandidateTrack,
    MoverDetectionPipeline,
    ParallaxDistanceEstimate,
    analyze_fits_epochs,
    cross_match_and_blink_epochs,
    estimate_unknown_mover_distance,
    extract_point_sources,
    prepare_and_mask_fits,
)

__all__ = [
    "AstrometricPointSource",
    "CleanedImageData",
    "MoverCandidateTrack",
    "MoverDetectionPipeline",
    "ParallaxDistanceEstimate",
    "analyze_fits_epochs",
    "cross_match_and_blink_epochs",
    "estimate_unknown_mover_distance",
    "extract_point_sources",
    "prepare_and_mask_fits",
]
