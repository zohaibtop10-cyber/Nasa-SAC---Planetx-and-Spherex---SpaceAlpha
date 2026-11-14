# Live Sky System Architecture

## Overview
Live Sky is a 3D web application displaying moving objects detected from NASA SPHEREx multi-epoch infrared sky surveys.

```
NASA / IPAC / IRSA (SPHEREx FITS)
JPL Horizons (Observer ephemeris)
JPL Small-Body Ident (Asteroid/Comet catalog)
ESA Gaia Archive (High proper motion stars)
               │
               ▼
┌───────────────────────────────┐
│     Offline Python Pipeline   │
│ (astropy, photutils, scipy)   │
└──────────────┬────────────────┘
               │ Outputs static JSON
               ▼
┌───────────────────────────────┐
│       web/public/data/        │
│   (fields, candidates, etc.)  │
└──────────────┬────────────────┘
               │ Zero network calls to NASA
               ▼
┌───────────────────────────────┐
│      Static Web Frontend      │
│   (Vite + TypeScript + Three) │
└───────────────────────────────┘
```

## Non-Negotiable Label System
Every displayed number must be labeled:
* `measured`: Directly read from detector FITS pixel data or primary catalog.
* `derived`: Computed mathematically from multiple measurements (e.g. proper motion, distance bounds).
* `assumed`: Boundary conditions, orbit assumptions, or observational geometry baselines.
