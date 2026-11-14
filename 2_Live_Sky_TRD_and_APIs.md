# Live Sky: Technical Requirements & Architecture
NASA Space Apps Challenge 2026 · Planet X and SPHEREx

## 1. System Architecture
1. **Offline Pipeline (Python):** Fetches NASA data, detects movers, triages them, and outputs static JSON files.
2. **Web Frontend (Vite + React/Three.js):** Reads the JSON files and renders the 3D map and UI. NO live API calls from the browser.

## 2. NASA APIs & Data Sources
* **SPHEREx Quick Release (QR2) Images (NASA/IPAC IRSA):** Fetched via `astroquery` or AWS S3 (`s3://nasa-irsa-spherex/qr2/level2/`). Used for raw FITS images to detect dots.
* **SB Identification API (NASA/JPL):** `ssd-api.jpl.nasa.gov/sb_ident.api`. Used to identify if a moving dot is a known asteroid/comet.
* **Horizons API (NASA/JPL):** Provides Earth/planetary positions for parallax calculations.
* **SBDB API (NASA/JPL):** `ssd-api.jpl.nasa.gov/sbdb.api`. Pulls physical data/orbits for confirmed objects.
* **Gaia Archive (ESA):** Used via `astroquery` cone search to rule out fast-moving background stars.

## 3. Data Flow
`fetch.py` -> `detect.py` (photutils) -> `link.py` -> `triage.py` (JPL/Gaia checks) -> `parallax.py` -> `export.py` (JSON)
