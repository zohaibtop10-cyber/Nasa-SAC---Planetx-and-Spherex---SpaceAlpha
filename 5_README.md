# Live Sky
NASA Space Apps Challenge 2026 - Planet X and SPHEREx

## What it does
Live Sky is a curated 3D map of the cosmos that tracks how the infrared sky changes. It ingests weekly SPHEREx data, detects moving objects, triages them (Asteroid, Fast Star, Unknown), and places them in an interactive 3D space map. It features a Time Bar to scrub through scans and watch data margins shrink, and side panels explaining exactly *why* an object received its verdict using NASA JPL and Gaia data.

## Built With
* Python (astropy, astroquery, photutils)
* Vite, React, Three.js
* NASA JPL SB Identification API, Horizons API, SBDB API, SPHEREx FITS (AWS)

## How to Run
1. `cd pipeline && pip install -r requirements.txt && python -m pipeline.run`
2. `cd web && npm install && npm run dev`
