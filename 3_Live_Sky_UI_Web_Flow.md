# Live Sky: UI & Web Flow

## 1. Design System: Clean Studio
* **Vibe:** Ultra-minimal, quiet observatory, high-end. 
* **Colors:** Dark background (`#0A0A0B`), hairline borders (`#26262A`), one accent color for unknowns (`#FF6B3D`).
* **Honesty:** Every number must be labeled "Measured", "Derived", or "Assumed". All 3D models must be tagged "Illustrative".

## 2. Web Flow
* **Home (`#/`)**: 3D solar system fades in. Shows "New this week" feed on the side. 
* **Object Focus (`#/object/<id>`)**: Camera zooms to the 3D object on a pedestal. Side panel opens with verdict, reason chain, and distance range.
* **Time Scrubbing (`#/time`)**: Bottom time bar appears. Dragging the slider steps through SPHEREx scans, updating 3D positions and shrinking distance segments for unknowns.
