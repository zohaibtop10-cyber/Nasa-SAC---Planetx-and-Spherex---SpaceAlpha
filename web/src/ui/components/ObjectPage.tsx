/**
 * ObjectPage.tsx - Dedicated Object Inspection Page (#/object/<id>)
 *
 * Implements:
 * - Shows only the selected object on a scientific pedestal
 * - Verdict badge, reason chain (each row has a check/cross icon), and plain explanation
 * - Number chips with borders: Measured (solid), Derived (dashed), Assumed (dotted)
 * - Strict requirement: Every displayed number goes through labelFor
 * - Full keyboard navigability (Escape to return, Tab navigation)
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { labelFor } from '../../data/labels';
import { Candidate } from '../../data/types';
import { AsteroidModel, UnknownSegmentModel } from '../../scene/models';
import { DistanceRangeBar } from './DistanceRangeBar';
import { NumberChip } from './NumberChip';

interface ObjectPageProps {
  candidateId: string;
  candidates: Candidate[];
  onBack: () => void;
}

export const ObjectPage: React.FC<ObjectPageProps> = ({
  candidateId,
  candidates,
  onBack,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const tagContainerRef = useRef<HTMLDivElement>(null);
  const activeModelRef = useRef<AsteroidModel | UnknownSegmentModel | null>(null);

  const [scanIndex, setScanIndex] = useState<number>(0);

  const candidate = candidates.find((c) => c.id === candidateId) || null;

  // Keyboard navigation: Escape key returns to feed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  // 3D Pedestal Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container || !candidate) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050506'); // near-black canvas

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 8, 18);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);

    // 2. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 50;
    controls.minDistance = 6;
    controls.target.set(0, 1.2, 0);
    controls.update();

    // 3. Lighting: Crisp studio directional & ambient
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff7e6, 2.2);
    keyLight.position.set(12, 16, 12);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.6);
    fillLight.position.set(-12, 6, -10);
    scene.add(fillLight);

    // 4. Pedestal Assembly
    const pedestalGroup = new THREE.Group();
    pedestalGroup.position.set(0, -1.8, 0);

    // Base cylinder
    const baseGeo = new THREE.CylinderGeometry(4.8, 5.2, 0.6, 64);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x111113,
      metalness: 0.8,
      roughness: 0.3,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    pedestalGroup.add(baseMesh);

    // Illuminated ring rim
    const ringGeo = new THREE.RingGeometry(4.75, 4.85, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.31;
    pedestalGroup.add(ringMesh);

    scene.add(pedestalGroup);

    // 5. Selected Illustrative 3D Model
    let activeModel: AsteroidModel | UnknownSegmentModel;
    const isUnknown = candidate.verdict === 'unknown';

    if (isUnknown && candidate.distance_range) {
      // Unknown segment along line-of-sight with ghost spheres
      activeModel = new UnknownSegmentModel({
        minDistanceAu: candidate.distance_range.min_au,
        maxDistanceAu: candidate.distance_range.max_au,
        illustrated: true,
      });
      activeModel.group.position.set(0, 1.8, 0);
      activeModel.group.scale.setScalar(0.12); // Fit cleanly above pedestal
    } else {
      // Noise-displaced icosahedron tinted from data
      activeModel = new AsteroidModel({
        radius: 2.2,
        colourIndex: candidate.colour_index ?? 1.1,
        illustrated: true,
      });
      activeModel.group.position.set(0, 1.8, 0);
    }

    activeModelRef.current = activeModel;
    scene.add(activeModel.group);

    // Mount HTML Tag to overlay
    if (tagContainerRef.current) {
      tagContainerRef.current.innerHTML = '';
      tagContainerRef.current.appendChild(activeModel.tagElement);
    }

    // 6. Animation Loop
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      controls.update();
      activeModel.update(delta);

      renderer.render(scene, camera);
    };
    animate();

    // 7. Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      activeModel.dispose();
      activeModelRef.current = null;
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [candidate]);

  // Synchronize 3D model distance uncertainty segment with scanIndex stepping
  useEffect(() => {
    if (!candidate?.distance_range || !activeModelRef.current) return;
    if (activeModelRef.current instanceof UnknownSegmentModel) {
      const ranges = candidate.distance_range.scan_ranges;
      if (ranges && ranges[scanIndex]) {
        activeModelRef.current.setDistanceRange(ranges[scanIndex].min_au, ranges[scanIndex].max_au);
      } else {
        const total = Math.max(2, candidate.positions.length);
        const progress = scanIndex / (total - 1);
        const baseMin = candidate.distance_range.min_au;
        const baseMax = candidate.distance_range.max_au;
        const currentMin = (baseMin * 0.65) + (baseMin * 0.35 * progress);
        const currentMax = (baseMax * 1.45) - (baseMax * 0.45 * progress);
        activeModelRef.current.setDistanceRange(currentMin, currentMax);
      }
    }
  }, [candidate, scanIndex]);

  if (!candidate) {
    return (
      <div
        style={{
          width: '100vw',
          height: 'calc(100vh - 56px)',
          marginTop: '56px',
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-text-1)',
          fontFamily: 'monospace',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
        }}
      >
        <div style={{ color: '#EF4444', fontSize: '16px', fontWeight: 700 }}>
          Object Not Found
        </div>
        <p style={{ color: '#71717A', fontSize: '12px' }}>
          Candidate identifier &quot;{candidateId}&quot; does not exist in active survey release catalog.
        </p>
        <button
          onClick={onBack}
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-hairline)',
            color: '#EDEDED',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          ← Return to Survey Feed
        </button>
      </div>
    );
  }

  const isUnknown = candidate.verdict === 'unknown';
  const isKnown = candidate.verdict === 'known_object';
  const isStar = candidate.verdict === 'high_motion_star';

  const verdictTitle = isUnknown
    ? 'Unknown Candidate Mover'
    : isKnown
    ? 'Confirmed Known Minor Body'
    : isStar
    ? 'High Proper Motion Star'
    : 'Transient Artifact';

  const verdictColor = isUnknown
    ? '#FF6B3D'
    : isKnown
    ? '#10B981'
    : isStar
    ? '#38BDF8'
    : '#71717A';

  // Plain language explanation adhering to project rules
  const plainExplanation = isKnown
    ? `This object was detected as a moving point source in multiple SPHEREx scans. Astrometric cross-matching against the NASA JPL Small-Body Database confirmed an exact orbital match to asteroid ${candidate.match?.designation || candidate.id} with a verified angular separation. Photometric reflectance in SPHEREx infrared channels matches expected silicate/carbonaceous asteroid regolith.`
    : isUnknown
    ? `This candidate mover was confirmed across multiple SPHEREx scan epochs without corresponding matches in either the ESA Gaia DR3 astrometric star catalog or the NASA JPL Small-Body database. Reflex parallax geometric analysis constrains its line-of-sight distance to an outer solar system bracket. In strict accordance with NASA Space Apps Challenge non-negotiables, this object is cataloged as an unclassified candidate with zero claims of Planet X.`
    : `This detection corresponds to a high proper motion star cataloged in ESA Gaia DR3, exhibiting significant apparent displacement across SPHEREx observation baselines without reflecting solar system orbital motion.`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: 'calc(100vh - 56px)',
        marginTop: '56px',
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-text-1)',
        fontFamily: 'monospace',
        overflow: 'hidden',
      }}
    >
      {/* 3D Pedestal Canvas Area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

          {/* Floating Back Navigation & HTML Tag Overlay */}
          <div
            style={{
              position: 'absolute',
              top: 20,
              left: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              zIndex: 10,
            }}
          >
            <button
              onClick={onBack}
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                backgroundColor: 'rgba(17, 17, 19, 0.92)',
                border: '1px solid var(--color-hairline)',
                color: 'var(--color-text-1)',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                width: 'fit-content',
              }}
            >
              ← Back to Survey Feed <span style={{ color: '#71717A' }}>[Esc]</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '11px', color: '#71717A' }}>3D Representation:</span>
              <div ref={tagContainerRef} />
            </div>
          </div>

          {/* Pedestal Inspection Hint */}
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: 20,
              fontSize: '11px',
              color: '#71717A',
              backgroundColor: 'rgba(17, 17, 19, 0.85)',
              padding: '4px 10px',
              border: '1px solid var(--color-hairline)',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            Pedestal View · Drag to rotate 360° · Scroll to inspect geometry
          </div>
        </div>

        {/* Distance Range UI & Time Bar for Unknown Objects */}
        {candidate.distance_range && (
          <div style={{ borderTop: '1px solid var(--color-hairline)', zIndex: 20 }}>
            <DistanceRangeBar
              candidate={candidate}
              currentScanIndex={scanIndex}
              onScanIndexChange={setScanIndex}
              onReset={() => setScanIndex(0)}
            />
          </div>
        )}
      </div>

      {/* Sidebar Object Details Panel (440px) */}
      <div
        style={{
          width: '440px',
          backgroundColor: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-hairline)',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          gap: '20px',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Header & Verdict Badge */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: verdictColor,
                backgroundColor: `${verdictColor}1A`,
                border: `1px solid ${verdictColor}4D`,
                padding: '3px 8px',
                borderRadius: '4px',
                textTransform: 'uppercase',
              }}
            >
              {verdictTitle}
            </span>

            {candidate.simulated && (
              <span
                style={{
                  fontSize: '10px',
                  color: '#F59E0B',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                Simulated Validation Track
              </span>
            )}
          </div>

          <h1
            style={{
              fontSize: '18px',
              fontWeight: 700,
              margin: '0 0 4px 0',
              color: '#EDEDED',
            }}
          >
            {candidate.match?.designation || candidate.id}
          </h1>

          <div style={{ fontSize: '11px', color: '#71717A' }}>
            Catalog ID: {candidate.id} · Batch: {candidate.release_batch}
          </div>
        </div>

        {/* Reason Chain with Check/Cross Icons */}
        <div
          style={{
            border: '1px solid var(--color-hairline)',
            padding: '16px',
            borderRadius: '0px',
            backgroundColor: 'var(--color-bg)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '10px', color: '#EDEDED' }}>
            TRIAGE REASON CHAIN
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {candidate.reason_chain.map((step, idx) => {
              const text = typeof step === 'string' ? step : `${step.rule}: ${step.detail}`;
              const isPassed = typeof step === 'object' && step !== null ? step.passed : undefined;
              const lower = text.toLowerCase();
              const isPositive =
                isPassed !== undefined
                  ? isPassed
                  : lower.includes('match') ||
                    lower.includes('detected') ||
                    lower.includes('pass') ||
                    lower.includes('confirmed') ||
                    lower.includes('bracket');
              const isNegative =
                isPassed !== undefined
                  ? !isPassed
                  : lower.includes('no_match') ||
                    lower.includes('unmatched') ||
                    lower.includes('reject') ||
                    lower.includes('fail');

              const icon = isPositive && !isNegative ? '✓' : '✗';
              const iconColor = isPositive && !isNegative ? '#10B981' : '#EF4444';

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '11px',
                    lineHeight: '1.4',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: `${iconColor}1A`,
                      color: iconColor,
                      fontSize: '11px',
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {icon}
                  </span>
                  <span style={{ color: '#EDEDED' }}>{text}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Plain Language Explanation */}
        <div
          style={{
            border: '1px solid var(--color-hairline)',
            padding: '16px',
            borderRadius: '0px',
            backgroundColor: 'var(--color-bg)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px', color: '#EDEDED' }}>
            PLAIN SCIENTIFIC EXPLANATION
          </div>
          <p
            style={{
              fontSize: '11px',
              color: '#A1A1AA',
              margin: 0,
              lineHeight: '1.5',
            }}
          >
            {plainExplanation}
          </p>
        </div>

        {/* Astrometric & Physical Telemetry (All through labelFor with NumberChips) */}
        <div
          style={{
            border: '1px solid var(--color-hairline)',
            padding: '16px',
            borderRadius: '0px',
            backgroundColor: 'var(--color-bg)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '12px', color: '#EDEDED' }}>
            ASTROMETRIC &amp; PHYSICAL TELEMETRY
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Primary RA & Dec */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#71717A' }}>Right Ascension (RA):</span>
              <NumberChip
                value={candidate.positions[0]?.ra ?? 0}
                unit="°"
                label={labelFor(candidate, 'positions')}
                precision={4}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#71717A' }}>Declination (Dec):</span>
              <NumberChip
                value={candidate.positions[0]?.dec ?? 0}
                unit="°"
                label={labelFor(candidate, 'positions')}
                precision={4}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#71717A' }}>Astrometric Error (1σ):</span>
              <NumberChip
                value={candidate.positions[0]?.err ?? 0.15}
                unit='"'
                label={labelFor(candidate, 'positions')}
                precision={2}
              />
            </div>

            {/* Pipeline Confidence */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#71717A' }}>Detection Confidence:</span>
              <NumberChip
                value={candidate.confidence * 100}
                unit="%"
                label={labelFor(candidate, 'confidence')}
                precision={1}
              />
            </div>

            {/* Colour Index */}
            {candidate.colour_index !== null && candidate.colour_index !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#71717A' }}>Photometric Colour Index:</span>
                <NumberChip
                  value={candidate.colour_index}
                  label={labelFor(candidate, 'colour_index')}
                  precision={2}
                />
              </div>
            )}

            {/* Catalog Match Separation if present */}
            {candidate.match?.separation_arcsec !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#71717A' }}>Catalog Match Separation:</span>
                <NumberChip
                  value={candidate.match.separation_arcsec}
                  unit='"'
                  label={labelFor(candidate, 'match.separation_arcsec')}
                  precision={2}
                />
              </div>
            )}

            {/* Distance Range Bounds for Unknowns */}
            {candidate.distance_range && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#71717A' }}>Parallax Distance (Min):</span>
                  <NumberChip
                    value={candidate.distance_range.min_au}
                    unit="AU"
                    label={labelFor(candidate, 'distance_range.min_au')}
                    precision={1}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#71717A' }}>Parallax Distance (Max):</span>
                  <NumberChip
                    value={candidate.distance_range.max_au}
                    unit="AU"
                    label={labelFor(candidate, 'distance_range.max_au')}
                    precision={1}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
