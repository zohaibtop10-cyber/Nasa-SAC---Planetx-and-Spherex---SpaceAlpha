/**
 * ProceduralGenerator.test.ts - Unit Tests for Procedural 3D Celestial Body Generator
 *
 * NASA Space Apps Challenge 2026 · Planet X and SPHEREx · Live Sky
 *
 * Validates:
 * 1. Data-Driven Instancing: Dispatches correct procedural geometries from dynamic JSON metadata
 *    without static .obj/.gltf assets.
 * 2. Geometry & Shader Generation:
 *    - Asteroid: THREE.IcosahedronGeometry with Simplex noise vertex displacement shader.
 *    - Comet: Smooth icy core + trailing THREE.Points particle system oriented along velocity vector.
 *    - Star / Brown Dwarf: Glowing THREE.SphereGeometry with emissive shader + radial halo sprite.
 *    - Unknown: Translucent glowing cylinder along line of sight capped by min/max ghost spheres.
 * 3. Material & Taxonomy Mapping:
 *    - Carbon-rich (#333336), Silicate (#8B5A2B), Icy (#7DD3FC), Brown Dwarf (#6B21A8), Star (#EF4444).
 * 4. Rule 2 Scientific Honesty Compliance:
 *    - Every generated group attaches a CSS2DObject declaring "Illustrative Model".
 */

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  colorIndexToProceduralColor,
  createIllustrativeTag,
  createProceduralAsteroid,
  createProceduralComet,
  createProceduralStar,
  createProceduralUnknownSegment,
  generateProceduralCelestialBody,
  ProceduralDataInput,
} from './ProceduralGenerator';

// Minimal mock for DOM document in Node environment
if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      const style: Record<string, string> = {};
      const attrs: Record<string, string> = {};
      return {
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        style,
        setAttribute: (k: string, v: string) => { attrs[k] = v; },
        getAttribute: (k: string) => attrs[k] || null,
        removeAttribute: (k: string) => { delete attrs[k]; },
        addEventListener: () => {},
        removeEventListener: () => {},
        width: 64,
        height: 64,
        getContext: () => ({
          createRadialGradient: () => ({
            addColorStop: () => {},
          }),
          fillRect: () => {},
          fillStyle: '',
        }),
      };
    },
  };
}

async function runProceduralGeneratorTests() {
  console.log('🧪 Testing Procedural 3D Celestial Body Generator (ProceduralGenerator.tsx)...');

  // -------------------------------------------------------------------------
  // 1. Taxonomic & Photometric Color Mapping
  // -------------------------------------------------------------------------
  console.log('  1. Testing taxonomic & photometric colour_index mapping...');

  const carbonCol = colorIndexToProceduralColor(null, 'carbon_rich');
  assert.strictEqual(carbonCol.getHexString(), '333336', 'Carbon-rich classification must map to dark grey #333336');

  const silicateCol = colorIndexToProceduralColor(null, 'silicate');
  assert.strictEqual(silicateCol.getHexString(), '8b5a2b', 'Silicate classification must map to reddish-brown #8B5A2B');

  const icyCol = colorIndexToProceduralColor(null, 'comet');
  assert.strictEqual(icyCol.getHexString(), '7dd3fc', 'Comet/Icy classification must map to pale cyan #7DD3FC');

  const brownDwarfCol = colorIndexToProceduralColor(null, 'brown_dwarf');
  assert.strictEqual(brownDwarfCol.getHexString(), '6b21a8', 'Brown dwarf must map to deep infrared magenta #6B21A8');

  const starCol = colorIndexToProceduralColor(null, 'star');
  assert.strictEqual(starCol.getHexString(), 'ef4444', 'Star classification must map to orange-red #EF4444');

  // Photometric B-V Fallbacks
  const blueObj = colorIndexToProceduralColor(0.5, undefined);
  assert.strictEqual(blueObj.getHexString(), '7dd3fc', 'colour_index <= 0.65 must map to icy blue #7DD3FC');

  const midC = colorIndexToProceduralColor(0.75, undefined);
  assert.strictEqual(midC.getHexString(), '333336', 'colour_index 0.75 must map to carbon-rich #333336');

  const stonyS = colorIndexToProceduralColor(1.1, undefined);
  assert.strictEqual(stonyS.getHexString(), '9c6644', 'colour_index 1.1 must map to silicate #9C6644');

  const ultraRed = colorIndexToProceduralColor(1.8, undefined);
  assert.strictEqual(ultraRed.getHexString(), 'ef4444', 'colour_index >= 1.6 must map to stellar #EF4444');

  // -------------------------------------------------------------------------
  // 2. Rule 2 'Illustrative Model' CSS2D Tag Builder
  // -------------------------------------------------------------------------
  console.log('  2. Testing Rule 2 "Illustrative Model" CSS2D tag builder...');

  const tag = createIllustrativeTag(2.5, 'Illustrative Model');
  assert.ok(tag instanceof CSS2DObject, 'Tag must be an instance of CSS2DObject');
  assert.strictEqual(tag.position.y, 2.5, 'Tag Y-offset must match requested offset');
  assert.strictEqual(tag.userData.tag, 'Illustrative', 'Tag userData.tag must be "Illustrative" (Rule 2)');
  assert.strictEqual(tag.element.textContent, 'Illustrative Model', 'Tag text content must declare "Illustrative Model"');

  // -------------------------------------------------------------------------
  // 3. Asteroid Procedural Generation (Icosahedron + Simplex Noise)
  // -------------------------------------------------------------------------
  console.log('  3. Testing procedural asteroid generation (Icosahedron + Simplex noise shader)...');

  const asteroidGroup = createProceduralAsteroid(1.5, 1.1, 'asteroid');
  assert.ok(asteroidGroup instanceof THREE.Group, 'Must return a THREE.Group');
  assert.strictEqual(asteroidGroup.name, 'Procedural Asteroid');

  const asteroidMesh = asteroidGroup.children[0] as THREE.Mesh;
  assert.ok(asteroidMesh instanceof THREE.Mesh, 'Child 0 must be a THREE.Mesh');
  assert.ok(asteroidMesh.geometry instanceof THREE.IcosahedronGeometry, 'Asteroid geometry must be IcosahedronGeometry');
  assert.ok(asteroidMesh.material instanceof THREE.ShaderMaterial, 'Asteroid material must be ShaderMaterial');

  const shaderMat = asteroidMesh.material as THREE.ShaderMaterial;
  assert.ok(shaderMat.vertexShader.includes('snoise'), 'Vertex shader must contain Simplex noise function');
  assert.ok(shaderMat.vertexShader.includes('uNoiseAmplitude'), 'Vertex shader must expose uNoiseAmplitude uniform');
  assert.ok(shaderMat.uniforms.uNoiseScale.value > 0, 'uNoiseScale uniform must be positive');

  // Tag verification
  const asteroidTag = asteroidGroup.children[1] as CSS2DObject;
  assert.ok(asteroidTag instanceof CSS2DObject, 'Child 1 must be CSS2DObject tag');
  assert.strictEqual(asteroidTag.userData.tag, 'Illustrative', 'Asteroid tag must be "Illustrative"');

  // -------------------------------------------------------------------------
  // 4. Comet Procedural Generation (Core + Trailing Particle System)
  // -------------------------------------------------------------------------
  console.log('  4. Testing procedural comet generation (Core + THREE.Points tail)...');

  const cometVel = new THREE.Vector3(-2.0, 0.5, -1.0);
  const cometGroup = createProceduralComet(0.9, cometVel, 120);
  assert.ok(cometGroup instanceof THREE.Group, 'Must return a THREE.Group');
  assert.strictEqual(cometGroup.name, 'Procedural Comet');

  const coreMesh = cometGroup.children[0] as THREE.Mesh;
  assert.ok(coreMesh instanceof THREE.Mesh, 'Comet child 0 must be rocky core Mesh');
  assert.strictEqual(coreMesh.userData.type, 'cometCore');

  const tailPoints = cometGroup.children[1] as THREE.Points;
  assert.ok(tailPoints instanceof THREE.Points, 'Comet child 1 must be THREE.Points particle system');
  assert.strictEqual(tailPoints.userData.type, 'cometTail');
  assert.ok(tailPoints.geometry.getAttribute('position').count === 120, 'Particle count must match requested count');

  // Verify tail trailing direction is anti-parallel to velocity
  const tailPosAttr = tailPoints.geometry.getAttribute('position');
  const expectedTrailDir = cometVel.clone().normalize().negate();
  const lastX = tailPosAttr.getX(119);
  const lastY = tailPosAttr.getY(119);
  const lastZ = tailPosAttr.getZ(119);
  const tailVec = new THREE.Vector3(lastX, lastY, lastZ).normalize();
  assert.ok(tailVec.dot(expectedTrailDir) > 0.85, 'Tail particles must stream opposite to comet velocity vector');

  // Tag verification
  const cometTag = cometGroup.children[2] as CSS2DObject;
  assert.ok(cometTag instanceof CSS2DObject, 'Child 2 must be CSS2DObject tag');
  assert.strictEqual(cometTag.userData.tag, 'Illustrative', 'Comet tag must be "Illustrative"');

  // -------------------------------------------------------------------------
  // 5. Star & Brown Dwarf Generation (Emissive Sphere + Halo Sprite)
  // -------------------------------------------------------------------------
  console.log('  5. Testing procedural star and brown dwarf generation...');

  const starGroup = createProceduralStar(1.8, false, 1.8);
  assert.strictEqual(starGroup.name, 'Procedural Star');
  const starMesh = starGroup.children[0] as THREE.Mesh;
  assert.ok(starMesh.geometry instanceof THREE.SphereGeometry, 'Star geometry must be SphereGeometry');
  assert.ok(starMesh.material instanceof THREE.ShaderMaterial, 'Star material must be custom emissive ShaderMaterial');

  const haloSprite = starGroup.children[1] as THREE.Sprite;
  assert.ok(haloSprite instanceof THREE.Sprite, 'Star child 1 must be THREE.Sprite radial halo');
  assert.ok(haloSprite.scale.x > 1.8 * 2.5, 'Halo sprite must be wider than the star core');

  const brownDwarfGroup = createProceduralStar(1.2, true, null);
  assert.strictEqual(brownDwarfGroup.name, 'Procedural Brown Dwarf');
  assert.strictEqual(brownDwarfGroup.children[0].userData.type, 'brown_dwarf');

  // -------------------------------------------------------------------------
  // 6. Unknown Distance Uncertainty Segment Generation (Cylinder + Ghost Spheres)
  // -------------------------------------------------------------------------
  console.log('  6. Testing procedural unknown distance uncertainty bounds segment...');

  const minPt = new THREE.Vector3(10, 0, 0);
  const maxPt = new THREE.Vector3(50, 0, 0);
  const unknownSegment = createProceduralUnknownSegment(minPt, maxPt, 0xff6b3d);
  assert.strictEqual(unknownSegment.name, 'Procedural Unknown Distance Bounds');

  const cylinderMesh = unknownSegment.children[0] as THREE.Mesh;
  assert.ok(cylinderMesh.geometry instanceof THREE.CylinderGeometry, 'Uncertainty segment must use CylinderGeometry');
  assert.strictEqual(cylinderMesh.position.x, 30, 'Cylinder midpoint must be at X=30');

  const minGhost = unknownSegment.children[1] as THREE.Mesh;
  assert.strictEqual(minGhost.position.x, 10, 'Min ghost sphere must cap at minPoint (10)');
  assert.strictEqual(minGhost.userData.bound, 'min');

  const maxGhost = unknownSegment.children[2] as THREE.Mesh;
  assert.strictEqual(maxGhost.position.x, 50, 'Max ghost sphere must cap at maxPoint (50)');
  assert.strictEqual(maxGhost.userData.bound, 'max');

  // Tag verification
  const segmentTag = unknownSegment.children[3] as CSS2DObject;
  assert.ok(segmentTag instanceof CSS2DObject, 'Child 3 must be CSS2DObject');
  assert.strictEqual(segmentTag.userData.tag, 'Illustrative');

  // -------------------------------------------------------------------------
  // 7. Full Dynamic Data-Driven Instancing Dispatcher
  // -------------------------------------------------------------------------
  console.log('  7. Testing dynamic data-driven instancing dispatcher (generateProceduralCelestialBody)...');

  // Unknown Body with uncertainty bounds
  const unknownInput: ProceduralDataInput = {
    id: 'PX-UNK-001',
    verdict: 'unknown',
    distance_range: { min_au: 45.0, max_au: 110.0 },
  };
  const dispatchedUnknown = generateProceduralCelestialBody(
    unknownInput,
    new THREE.Vector3(0, 0, 45),
    new THREE.Vector3(0, 0, 110)
  );
  assert.strictEqual(dispatchedUnknown.name, 'Procedural Unknown Distance Bounds');

  // Comet Input
  const cometInput: ProceduralDataInput = {
    id: '3I/ATLAS',
    classification: 'comet',
    velocity_arcsec_day: 420.0,
  };
  const dispatchedComet = generateProceduralCelestialBody(cometInput);
  assert.strictEqual(dispatchedComet.name, 'Procedural Comet');

  // Brown Dwarf Input
  const brownDwarfInput: ProceduralDataInput = {
    id: 'WISE 0855-0714',
    classification: 'brown_dwarf',
  };
  const dispatchedBD = generateProceduralCelestialBody(brownDwarfInput);
  assert.strictEqual(dispatchedBD.name, 'Procedural Brown Dwarf');

  // Star Input
  const starInput: ProceduralDataInput = {
    id: "Barnard's Star",
    verdict: 'fast_moving_star',
    classification: 'star',
  };
  const dispatchedStar = generateProceduralCelestialBody(starInput);
  assert.strictEqual(dispatchedStar.name, 'Procedural Star');

  // Asteroid Input (Default)
  const asteroidInput: ProceduralDataInput = {
    id: '1999 RQ36',
    verdict: 'known_asteroid',
    colour_index: 0.82,
    procedural3D: {
      relativeSize: 1.4,
      surfaceTexture: 'rocky',
      baseColorHex: '#333336',
    },
  };
  const dispatchedAsteroid = generateProceduralCelestialBody(asteroidInput);
  assert.strictEqual(dispatchedAsteroid.name, 'Procedural Asteroid');

  // Verify Rule 2: Every single dispatched celestial group contains an "Illustrative" tagged child
  const allDispatched = [dispatchedUnknown, dispatchedComet, dispatchedBD, dispatchedStar, dispatchedAsteroid];
  for (const group of allDispatched) {
    const hasIllustrativeTag = group.children.some(
      (child) => child.userData?.tag === 'Illustrative'
    );
    assert.ok(
      hasIllustrativeTag,
      `Group ${group.name} MUST contain an Illustrative tagged child (Rule 2 non-negotiable)`
    );
  }

  console.log('✅ All Procedural 3D Generator tests passed successfully!\n');
}

runProceduralGeneratorTests().catch((err) => {
  console.error('ProceduralGenerator test failed:', err);
  process.exit(1);
});
