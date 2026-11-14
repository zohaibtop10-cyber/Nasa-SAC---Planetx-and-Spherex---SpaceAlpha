# Live Sky: Product Requirements Document (1-Day MVP)
NASA Space Apps Challenge 2026 · Planet X and SPHEREx

## 1. Vision & Scope
Live Sky is a 3D interactive map of the cosmos ("Google Earth for space") focused strictly on a curated MVP scope of 5-8 sky fields. It tracks moving objects (asteroids, fast stars, unknowns) using NASA SPHEREx data.

## 2. Core Features (The 1-Day MVP)
* **3D Space Map:** A WebGL canvas showing the Sun, Earth, and procedurally generated "illustrative" 3D objects for detected movers.
* **Side-Panel Data:** Clicking an object opens a sleek glassmorphic panel showing NASA data, images, the triage verdict (e.g., Known Asteroid), and the reason chain.
* **The Time Bar:** A slider that scrubs through distinct SPHEREx scan epochs. As the user scrubs, the UI physically shrinks the 3D distance segment of unknown objects to show how more data narrows the margin of error.
* **Procedural 3D Instancing:** Objects are not photorealistic images (SPHEREx sees dots of infrared light). They are procedurally generated (e.g., noise-displaced icosahedrons) tinted by spectral color data, clearly tagged as "Illustrative".

## 3. What We Are NOT Doing
* Mapping billions of objects (browser will crash).
* Direct image-to-3D mesh generation (data is just pixels of light).
* Claiming to discover Planet X.
