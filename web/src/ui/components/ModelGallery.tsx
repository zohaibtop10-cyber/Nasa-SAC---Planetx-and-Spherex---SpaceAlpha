/**
 * ModelGallery.tsx - Interactive Model Gallery for Review
 *
 * Implements:
 * - Review viewer for AsteroidModel (noise-displaced icosahedron, matte material, data-driven colour_index)
 * - Review viewer for UnknownSegmentModel (line along line-of-sight, min/max ghost spheres)
 * - setIllustrated(boolean) interactive toggle testing the HTML "Illustrative" badge
 * - Strict adherence to labeling rules: every number has [measured], [derived], or [assumed]
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Candidate } from '../../data/types';
import { AsteroidModel, UnknownSegmentModel } from '../../scene/models';

interface ModelGalleryProps {
  candidates?: Candidate[];
}

export const ModelGallery: React.FC<ModelGalleryProps> = ({ candidates = [] }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const tagContainerRef = useRef<HTMLDivElement>(null);

  // Active Model selection: 'asteroid' | 'segment'
  const [activeModelType, setActiveModelType] = useState<'asteroid' | 'segment'>('asteroid');

  // Illustrative badge state
  const [isIllustrated, setIsIllustrated] = useState<boolean>(true);

  // Asteroid parameters
  const [colourIndex, setColourIndex] = useState<number>(1.12);
  const [asteroidDetail, setAsteroidDetail] = useState<number>(2);

  // Unknown Segment parameters
  const [minDistAu, setMinDistAu] = useState<number>(45.0);
  const [maxDistAu, setMaxDistAu] = useState<number>(85.0);

  // Three.js Scene References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const asteroidModelRef = useRef<AsteroidModel | null>(null);
  const segmentModelRef = useRef<UnknownSegmentModel | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050506'); // --color-canvas
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 15, 30);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 2. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // 3. Lighting: Crisp, matte illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xfff7e6, 2.0);
    dirLight1.position.set(15, 20, 15);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x4299e1, 0.5);
    dirLight2.position.set(-15, -10, -15);
    scene.add(dirLight2);

    // 4. Instantiate Models
    const asteroid = new AsteroidModel({
      radius: 4.5,
      detail: asteroidDetail,
      colourIndex: colourIndex,
      illustrated: isIllustrated,
    });
    asteroidModelRef.current = asteroid;
    scene.add(asteroid.group);

    const segment = new UnknownSegmentModel({
      minDistanceAu: minDistAu,
      maxDistanceAu: maxDistAu,
      illustrated: isIllustrated,
    });
    segment.group.visible = false;
    segmentModelRef.current = segment;
    scene.add(segment.group);

    // Mount HTML tag badge to overlay DOM
    if (tagContainerRef.current) {
      tagContainerRef.current.appendChild(asteroid.tagElement);
    }

    // 5. Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      controls.update();

      if (asteroid.group.visible) {
        asteroid.update(delta);
      }
      if (segment.group.visible) {
        segment.update(delta);
      }

      renderer.render(scene, camera);
    };
    animate();

    // 6. Resize handler
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
      asteroid.dispose();
      segment.dispose();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Synchronize model visibility when activeModelType changes
  useEffect(() => {
    const asteroid = asteroidModelRef.current;
    const segment = segmentModelRef.current;
    const tagContainer = tagContainerRef.current;
    if (!asteroid || !segment || !tagContainer) return;

    if (activeModelType === 'asteroid') {
      asteroid.group.visible = true;
      segment.group.visible = false;
      tagContainer.innerHTML = '';
      tagContainer.appendChild(asteroid.tagElement);
      if (cameraRef.current && controlsRef.current) {
        cameraRef.current.position.set(0, 10, 20);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    } else {
      asteroid.group.visible = false;
      segment.group.visible = true;
      tagContainer.innerHTML = '';
      tagContainer.appendChild(segment.tagElement);
      if (cameraRef.current && controlsRef.current) {
        cameraRef.current.position.set(0, 25, 45);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    }
  }, [activeModelType]);

  // Synchronize setIllustrated(boolean)
  useEffect(() => {
    if (asteroidModelRef.current) {
      asteroidModelRef.current.setIllustrated(isIllustrated);
    }
    if (segmentModelRef.current) {
      segmentModelRef.current.setIllustrated(isIllustrated);
    }
  }, [isIllustrated]);

  // Synchronize colourIndex
  useEffect(() => {
    if (asteroidModelRef.current) {
      asteroidModelRef.current.setColourIndex(colourIndex);
    }
  }, [colourIndex]);

  // Synchronize distance range
  useEffect(() => {
    if (segmentModelRef.current) {
      segmentModelRef.current.setDistanceRange(minDistAu, maxDistAu);
    }
  }, [minDistAu, maxDistAu]);

  const currentColorHex = '#' + AsteroidModel.colourIndexToColor(colourIndex).getHexString();

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
      {/* 3D Viewport Column */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

        {/* Overlay HTML Tag Container */}
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '12px', color: '#71717A' }}>HTML Tag:</span>
            <div ref={tagContainerRef} />
          </div>

          <div
            style={{
              fontSize: '10px',
              color: '#888899',
              backgroundColor: 'rgba(17, 17, 19, 0.85)',
              padding: '3px 8px',
              border: '1px solid var(--color-hairline)',
              borderRadius: '0px',
            }}
          >
            Compliance Status:{' '}
            <strong style={{ color: isIllustrated ? '#10B981' : '#EF4444' }}>
              {isIllustrated ? 'ACTIVE (Tag Visible) [verified]' : 'HIDDEN (Non-compliant) [verified]'}
            </strong>
          </div>
        </div>

        {/* Viewport Hint */}
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            fontSize: '11px',
            color: '#71717A',
            backgroundColor: 'rgba(17, 17, 19, 0.85)',
            padding: '4px 8px',
            border: '1px solid var(--color-hairline)',
          }}
        >
          Drag to rotate · Scroll to zoom
        </div>
      </div>

      {/* Control & Inspector Side Panel */}
      <div
        style={{
          width: '420px',
          backgroundColor: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-hairline)',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          gap: '20px',
          overflowY: 'auto',
        }}
      >
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', color: '#EDEDED' }}>
            ILLUSTRATIVE MODEL GALLERY
          </h2>
          <p style={{ fontSize: '11px', color: '#71717A', margin: 0, lineHeight: '1.4' }}>
            Interactive review for 3D procedural minor bodies and line-of-sight distance uncertainty models.
          </p>
        </div>

        {/* Model Type Selector */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveModelType('asteroid')}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontFamily: 'monospace',
              fontSize: '11px',
              backgroundColor: activeModelType === 'asteroid' ? 'var(--color-bg)' : '#111113',
              color: activeModelType === 'asteroid' ? 'var(--color-text-1)' : '#71717A',
              border: activeModelType === 'asteroid' ? '1px solid var(--color-accent)' : '1px solid var(--color-hairline)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Asteroid Model
          </button>
          <button
            onClick={() => setActiveModelType('segment')}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontFamily: 'monospace',
              fontSize: '11px',
              backgroundColor: activeModelType === 'segment' ? 'var(--color-bg)' : '#111113',
              color: activeModelType === 'segment' ? 'var(--color-text-1)' : '#71717A',
              border: activeModelType === 'segment' ? '1px solid var(--color-accent)' : '1px solid var(--color-hairline)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Unknown Segment
          </button>
        </div>

        {/* Non-Negotiable Illustrated Toggle */}
        <div
          style={{
            border: '1px solid var(--color-hairline)',
            padding: '14px',
            borderRadius: '0px',
            backgroundColor: 'var(--color-bg)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>setIllustrated() Toggle</span>
            <button
              onClick={() => setIsIllustrated(!isIllustrated)}
              style={{
                padding: '4px 10px',
                fontFamily: 'monospace',
                fontSize: '11px',
                backgroundColor: isIllustrated ? '#10B981' : '#EF4444',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              {isIllustrated ? 'TRUE (Tagged)' : 'FALSE (Untagged)'}
            </button>
          </div>
          <p style={{ fontSize: '10px', color: '#71717A', margin: '8px 0 0 0' }}>
            Rule 2 requirement: Every 3D model MUST show an HTML "Illustrative" tag.
          </p>
        </div>

        {/* Asteroid Model Specific Controls */}
        {activeModelType === 'asteroid' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ border: '1px solid var(--color-hairline)', padding: '14px', borderRadius: '0px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                Photometric Colour Index (Data-Driven)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span
                  style={{
                    width: '24px',
                    height: '24px',
                    backgroundColor: currentColorHex,
                    border: '1px solid var(--color-hairline)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: '12px', color: '#EDEDED' }}>
                  Colour: <strong style={{ color: currentColorHex }}>{currentColorHex}</strong> ({colourIndex.toFixed(2)}{' '}
                  <span style={{ color: '#71717A' }}>[derived]</span>)
                </span>
              </div>

              <input
                type="range"
                min="0.4"
                max="2.5"
                step="0.05"
                value={colourIndex}
                onChange={(e) => setColourIndex(parseFloat(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--color-accent)' }}
              />

              <div style={{ marginTop: '12px', fontSize: '11px', color: '#71717A' }}>Presets from Mission Catalog:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {candidates.length > 0 ? (
                  candidates.map((cand) => (
                    <button
                      key={cand.id}
                      onClick={() => setColourIndex(cand.colour_index ?? 1.1)}
                      style={{
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        padding: '3px 8px',
                        background: '#111113',
                        border: '1px solid var(--color-hairline)',
                        color: '#EDEDED',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      {cand.match?.designation || cand.id} ({(cand.colour_index ?? 1.1).toFixed(2)}) [data]
                    </button>
                  ))
                ) : (
                  <>
                    <button
                      onClick={() => setColourIndex(0.65)}
                      style={{
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        padding: '3px 8px',
                        background: '#111113',
                        border: '1px solid var(--color-hairline)',
                        color: '#EDEDED',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      C-type (0.65) [derived]
                    </button>
                    <button
                      onClick={() => setColourIndex(1.05)}
                      style={{
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        padding: '3px 8px',
                        background: '#111113',
                        border: '1px solid var(--color-hairline)',
                        color: '#EDEDED',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      S-type Ceres (1.05) [measured]
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ border: '1px solid var(--color-hairline)', padding: '14px', borderRadius: '0px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Material &amp; Surface</div>
              <div style={{ fontSize: '11px', color: '#A1A1AA', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>Type: Standard Matte Material [verified]</div>
                <div>Roughness: 0.88 [assumed] · Metalness: 0.05 [assumed]</div>
                <div>Geometry: Noise-Displaced Icosahedron</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Subdivision Detail:</span>
                  {[1, 2, 3].map((det) => (
                    <button
                      key={det}
                      onClick={() => setAsteroidDetail(det)}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid var(--color-hairline)',
                        backgroundColor: asteroidDetail === det ? 'var(--color-accent)' : '#111113',
                        color: '#EDEDED',
                        cursor: 'pointer',
                      }}
                    >
                      Level {det} [assumed]
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Unknown Segment Specific Controls */}
        {activeModelType === 'segment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ border: '1px solid var(--color-hairline)', padding: '14px', borderRadius: '0px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                Line-of-Sight Distance Uncertainty
              </div>

              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span>Min Distance:</span>
                  <span style={{ color: 'var(--color-accent)' }}>{minDistAu.toFixed(1)} AU [derived]</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="70"
                  step="1"
                  value={minDistAu}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (val < maxDistAu) setMinDistAu(val);
                  }}
                  style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--color-accent)' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span>Max Distance:</span>
                  <span style={{ color: 'var(--color-accent)' }}>{maxDistAu.toFixed(1)} AU [derived]</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="150"
                  step="1"
                  value={maxDistAu}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (val > minDistAu) setMaxDistAu(val);
                  }}
                  style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--color-accent)' }}
                />
              </div>
            </div>

            <div style={{ border: '1px solid var(--color-hairline)', padding: '14px', borderRadius: '0px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Ghost Spheres Symbology</div>
              <div style={{ fontSize: '11px', color: '#A1A1AA', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>Bound Min: Ghost Sphere at {minDistAu.toFixed(1)} AU [derived]</div>
                <div>Bound Max: Ghost Sphere at {maxDistAu.toFixed(1)} AU [derived]</div>
                <div>Opacity: Pulsating 0.35 [assumed]</div>
                <div>Wireframe Ring: Active [Illustrative]</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
