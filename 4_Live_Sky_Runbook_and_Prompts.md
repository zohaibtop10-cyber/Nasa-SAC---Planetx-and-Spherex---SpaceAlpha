# Live Sky: 1-Day Hackathon Runbook & Prompts
Start exactly at 9:00 AM. Use Antigravity (or Cursor/Claude) for all code generation. 
Keep agents separated: one for Pipeline (Python), one for Web (Vite/Three.js).

## 09:00 AM - Initialization
1. Create folders: `pipeline/`, `data/`, `web/`, `docs/`, `tests/`.
2. Place `AGENTS.md` in the root folder.
3. **Prompt (Agent P):** "Create data contracts (types.ts and JSON schemas) for fields, candidates, releases, and config based on the Live Sky TRD."
4. **Prompt (Agent W):** "Scaffold a Vite + TypeScript + Three.js app in web/. Use Clean Studio design tokens (dark mode, hairline borders). Load mock JSON data from web/public/data."

## 10:00 AM - Data Spikes
1. **Prompt (Agent P):** "Write pipeline/spikes/s1_fetch.py. Use astroquery or AWS S3 to download exactly one SPHEREx QR2 FITS image for comet 3I/ATLAS coordinates. Display the image with flagged pixels masked using the variance map."
2. **Prompt (Agent P):** "Write pipeline/spikes/s2_known.py to hit the NASA JPL SB Identification API and identify one known object in a given field."
3. **Prompt (Agent P):** "Write pipeline/spikes/s3_gaia.py to query the ESA Gaia archive and flag a fast-moving star."

## 11:30 AM - The Core Logic
1. **Prompt (Agent P):** "Write pipeline/spikes/s4_movers.py. Use photutils on two SPHEREx scans of the same field. Convert to sky coordinates, remove fixed sources, and link the moving dots into tracks."
2. **DECISION (1:00 PM):** If a mover is linked, proceed to full pipeline. If it fails, PIVOT to 'Sky Blink Explorer' (just show the two 2D images blinking with JPL data overlaid).

## 01:30 PM - 3D & UI
1. **Prompt (Agent W):** "Build the 3D Solar System scene in Three.js. Inner system linear, outer system log scale. Use instanced procedural noise-displaced icosahedrons for asteroids."
2. **Prompt (Agent W):** "Build the Object side panel and the Time Bar slider. The slider should step through the scan dates in the JSON and update the 3D distances/segments."

## 04:30 PM - Integration & Validation
1. **Prompt (Agent P):** "Combine the spikes into production modules (fetch.py, detect.py, link.py, triage.py). Run against our 5-8 fields and output candidates.json."
2. **Prompt (Agent W):** "Replace mock data with real candidates.json. Ensure the Time Bar shrinks the distance segment for unknowns as scans increase."

## 07:30 PM - Polish & Submit
1. Build the Validation page.
2. Deploy to Vercel/Netlify.
3. Record 90-second demo video.
4. Sleep!
