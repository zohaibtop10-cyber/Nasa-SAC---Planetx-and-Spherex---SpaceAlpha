/**
 * SolarSystemMap.test.ts - Unit Tests for Core Spatial 3D Map
 *
 * NASA Space Apps Challenge 2026 · Planet X and SPHEREx · Live Sky
 *
 * Validates:
 * 1. Coordinate Transformation:
 *    - auToScaleDistance: linear scaling in inner system (<= 5.2 AU), log compression beyond.
 *    - sphericalToCartesian: conversion of RA, Dec, Distance (AU) to Three.js Cartesian space.
 *    - cartesianToSpherical: round-trip consistency.
 * 2. Dual-Scale Challenge:
 *    - Compares dual vs linear mode.
 *    - Ensures distant objects (Kuiper Belt, Planet X zone) remain within visible bounds without camera clipping.
 * 3. Reference Structures:
 *    - 8 major planetary orbit rings (semi-transparent, tagged "Illustrative").
 *    - Hypothetical Planet X zone grid (faint dashed lines, labeled [assumed], Rule 1 & Rule 3 compliance).
 * 4. Interactive Camera:
 *    - Camera tween mathematics with GSAP, computing smooth trajectory from overview to target.
 */

import assert from 'node:assert/strict';
import * as THREE from 'three';
import gsap from 'gsap';
import {
  auToScaleDistance,
  scaleDistanceToAu,
  sphericalToCartesian,
  cartesianToSpherical,
  createPlanetaryOrbitRings,
  createHypotheticalPlanetXZoneGrid,
  MAJOR_PLANETS,
  HYPOTHETICAL_PLANET_X_AU,
  INNER_BOUNDARY_AU,
  LINEAR_SCALE_FACTOR,
} from './SolarSystemMap';

async function runSolarSystemMapTests() {
  console.log('🧪 Testing SolarSystemMap (web/src/scene/SolarSystemMap.tsx)...');

  // -------------------------------------------------------------------------
  // 1. Coordinate Transformation & Dual-Scale Mathematics
  // -------------------------------------------------------------------------
  console.log('  1. Testing auToScaleDistance and dual-scale behavior...');

  // Inner system (linear: 1 AU = 10 units)
  const distEarth = auToScaleDistance(1.0, 'dual');
  assert.strictEqual(distEarth, 10.0, '1.0 AU must scale to 10.0 units in dual mode');

  const distMars = auToScaleDistance(1.52, 'dual');
  assert.ok(Math.abs(distMars - 15.2) < 1e-4, '1.52 AU (Mars) must scale to 15.2 units');

  const distJupiter = auToScaleDistance(5.2, 'dual');
  assert.strictEqual(distJupiter, 52.0, '5.2 AU (Jupiter boundary) must scale to 52.0 units');

  // Outer system (logarithmic compression)
  const distNeptune = auToScaleDistance(30.06, 'dual');
  // Formula: 52 + 45 * log10(30.06 / 5.2) = 52 + 45 * log10(5.7807) ≈ 86.29 units
  assert.ok(distNeptune > 80.0 && distNeptune < 92.0, 'Neptune (30.06 AU) must scale to ~86 units in dual mode');

  const distPlanetXZone = auToScaleDistance(HYPOTHETICAL_PLANET_X_AU, 'dual');
  // 350 AU: 52 + 45 * log10(350 / 5.2) ≈ 52 + 45 * 1.828 ≈ 134.26 units
  assert.ok(distPlanetXZone > 130.0 && distPlanetXZone < 140.0, 'Planet X Zone (350 AU) must scale to ~134 units in dual mode');

  // Linear mode comparison
  const distPlanetXLinear = auToScaleDistance(HYPOTHETICAL_PLANET_X_AU, 'linear');
  assert.strictEqual(distPlanetXLinear, 3000.0, 'In linear mode, 350 AU reaches linear clamp of 3000 units');
  assert.ok(distPlanetXZone < distPlanetXLinear / 15.0, 'Dual scale must compress outer distances by >15x relative to linear mode');

  // Reverse mapping consistency
  const revEarth = scaleDistanceToAu(distEarth, 'dual');
  assert.ok(Math.abs(revEarth - 1.0) < 1e-4, 'Reverse mapping of 1.0 AU must return 1.0 AU');

  const revNeptune = scaleDistanceToAu(distNeptune, 'dual');
  assert.ok(Math.abs(revNeptune - 30.06) < 1e-3, 'Reverse mapping of Neptune must return 30.06 AU');

  // -------------------------------------------------------------------------
  // 2. Spherical (RA, Dec, Distance AU) to Three.js Cartesian (X, Y, Z)
  // -------------------------------------------------------------------------
  console.log('  2. Testing sphericalToCartesian and cartesianToSpherical...');

  // Vernal Equinox: RA = 0°, Dec = 0°, 1 AU -> +X = 10, Y = 0, Z = 0
  const vEquinox = sphericalToCartesian(0.0, 0.0, 1.0, 'dual');
  assert.ok(Math.abs(vEquinox.x - 10.0) < 1e-4, 'RA 0, Dec 0 should point along +X');
  assert.ok(Math.abs(vEquinox.y) < 1e-4, 'Dec 0 should have Y=0');
  assert.ok(Math.abs(vEquinox.z) < 1e-4, 'RA 0 should have Z=0');

  // RA = 90°, Dec = 0°, 1 AU -> X = 0, Y = 0, +Z = 10
  const v90RA = sphericalToCartesian(90.0, 0.0, 1.0, 'dual');
  assert.ok(Math.abs(v90RA.x) < 1e-4, 'RA 90 should have X=0');
  assert.ok(Math.abs(v90RA.y) < 1e-4, 'Dec 0 should have Y=0');
  assert.ok(Math.abs(v90RA.z - 10.0) < 1e-4, 'RA 90 should point along +Z');

  // North Celestial Pole: RA = 0°, Dec = 90°, 1 AU -> X = 0, +Y = 10, Z = 0
  const vNorthPole = sphericalToCartesian(0.0, 90.0, 1.0, 'dual');
  assert.ok(Math.abs(vNorthPole.x) < 1e-4, 'Dec 90 should have X=0');
  assert.ok(Math.abs(vNorthPole.y - 10.0) < 1e-4, 'Dec +90 should point along +Y');
  assert.ok(Math.abs(vNorthPole.z) < 1e-4, 'Dec 90 should have Z=0');

  // Round-trip test
  const testRA = 142.5;
  const testDec = -28.4;
  const testDist = 48.0; // AU
  const cartPos = sphericalToCartesian(testRA, testDec, testDist, 'dual');
  const sphericalResult = cartesianToSpherical(cartPos, 'dual');

  assert.ok(Math.abs(sphericalResult.ra - testRA) < 1e-3, 'Round-trip RA must match within 0.001 deg');
  assert.ok(Math.abs(sphericalResult.dec - testDec) < 1e-3, 'Round-trip Dec must match within 0.001 deg');
  assert.ok(Math.abs(sphericalResult.distance_au - testDist) < 1e-3, 'Round-trip Distance must match within 0.001 AU');

  // -------------------------------------------------------------------------
  // 3. Reference Structures: Planetary Orbit Rings
  // -------------------------------------------------------------------------
  console.log('  3. Testing planetary orbit rings...');

  const orbitGroup = createPlanetaryOrbitRings('dual');
  assert.ok(orbitGroup instanceof THREE.Group, 'Orbit rings must be a THREE.Group');
  assert.strictEqual(orbitGroup.children.length, 8, 'Must generate exactly 8 major planetary orbit rings');

  orbitGroup.children.forEach((child, idx) => {
    assert.ok(child instanceof THREE.LineLoop, `Child ${idx} must be a THREE.LineLoop`);
    assert.strictEqual(child.userData.tag, 'Illustrative', 'Every orbit ring must carry Rule 2 "Illustrative" tag');
    const mat = (child as THREE.LineLoop).material as THREE.LineBasicMaterial;
    assert.strictEqual(mat.transparent, true, 'Orbit ring material must be semi-transparent');
    assert.ok(mat.opacity <= 0.5, 'Orbit ring opacity must be subtle (<= 0.5)');
  });

  // Verify major planet distances
  const mercuryRing = orbitGroup.children[0] as THREE.LineLoop;
  assert.strictEqual(mercuryRing.userData.planet, 'Mercury');
  assert.strictEqual(mercuryRing.userData.distanceAu, 0.39);

  const neptuneRing = orbitGroup.children[7] as THREE.LineLoop;
  assert.strictEqual(neptuneRing.userData.planet, 'Neptune');
  assert.strictEqual(neptuneRing.userData.distanceAu, 30.06);

  // -------------------------------------------------------------------------
  // 4. Reference Structures: Hypothetical Planet X Zone Grid
  // -------------------------------------------------------------------------
  console.log('  4. Testing Hypothetical Planet X Zone grid (Rules 1, 2, 3)...');

  const planetXGroup = createHypotheticalPlanetXZoneGrid('dual');
  assert.ok(planetXGroup instanceof THREE.Group, 'Planet X Zone must be a THREE.Group');
  assert.ok(planetXGroup.children.length > 5, 'Planet X Zone must contain latitude and longitude grid lines');

  // Rule 1 & Rule 3 Compliance Check
  assert.ok(
    planetXGroup.name.includes('[assumed]'),
    'Planet X Zone name must include Rule 1 epistemic label "[assumed]"'
  );
  assert.ok(
    planetXGroup.userData.label.includes('[assumed]'),
    'Planet X Zone userData.label must include "[assumed]"'
  );
  assert.strictEqual(
    planetXGroup.userData.tag,
    'Illustrative',
    'Planet X Zone must be tagged "Illustrative" (Rule 2)'
  );

  // Verify Dashed Lines
  const firstGridLine = planetXGroup.children[0] as THREE.Line;
  assert.ok(firstGridLine.material instanceof THREE.LineDashedMaterial, 'Grid lines must use THREE.LineDashedMaterial');
  const dashedMat = firstGridLine.material as THREE.LineDashedMaterial;
  assert.strictEqual(dashedMat.transparent, true, 'Dashed material must be transparent');
  assert.ok(dashedMat.dashSize > 0, 'dashSize must be positive');
  assert.ok(dashedMat.gapSize > 0, 'gapSize must be positive');

  // -------------------------------------------------------------------------
  // 5. Interactive Camera: GSAP Smooth Tween to Target Coordinates
  // -------------------------------------------------------------------------
  console.log('  5. Testing GSAP camera tween interpolation...');

  const startCamPos = new THREE.Vector3(0, 110, 140);
  const startTarget = new THREE.Vector3(0, 0, 0);

  // Target object at (50, 10, 30)
  const targetObjPos = new THREE.Vector3(50, 10, 30);
  const offsetDist = 20.0;
  const offsetDir = new THREE.Vector3(0.5, 0.4, 0.7).normalize();
  const destCamPos = targetObjPos.clone().add(offsetDir.clone().multiplyScalar(offsetDist));

  const anim = {
    camX: startCamPos.x,
    camY: startCamPos.y,
    camZ: startCamPos.z,
    targetX: startTarget.x,
    targetY: startTarget.y,
    targetZ: startTarget.z,
  };

  // Perform GSAP tween step synchronously for verification
  const tween = gsap.to(anim, {
    camX: destCamPos.x,
    camY: destCamPos.y,
    camZ: destCamPos.z,
    targetX: targetObjPos.x,
    targetY: targetObjPos.y,
    targetZ: targetObjPos.z,
    duration: 1.0,
    ease: 'power2.inOut',
  });

  // Check initial state
  assert.strictEqual(anim.camX, startCamPos.x);
  assert.strictEqual(anim.targetX, 0);

  // Progress to 50%
  tween.progress(0.5);
  assert.ok(anim.camX !== startCamPos.x, 'At 50% progress, camX must have moved from start');
  assert.ok(anim.targetX > 0 && anim.targetX < 50, 'At 50% progress, targetX must be interpolating towards 50');

  // Progress to 100%
  tween.progress(1.0);
  assert.ok(Math.abs(anim.camX - destCamPos.x) < 1e-4, 'At 100% progress, camX must reach destination');
  assert.ok(Math.abs(anim.camY - destCamPos.y) < 1e-4, 'At 100% progress, camY must reach destination');
  assert.ok(Math.abs(anim.camZ - destCamPos.z) < 1e-4, 'At 100% progress, camZ must reach destination');
  assert.ok(Math.abs(anim.targetX - targetObjPos.x) < 1e-4, 'At 100% progress, targetX must reach object X');
  assert.ok(Math.abs(anim.targetY - targetObjPos.y) < 1e-4, 'At 100% progress, targetY must reach object Y');
  assert.ok(Math.abs(anim.targetZ - targetObjPos.z) < 1e-4, 'At 100% progress, targetZ must reach object Z');

  tween.kill();

  console.log('✅ All SolarSystemMap tests passed successfully!\n');
}

runSolarSystemMapTests().catch((err) => {
  console.error('SolarSystemMap test failed:', err);
  process.exit(1);
});
