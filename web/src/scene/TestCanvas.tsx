import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface TestCanvasProps {
  className?: string;
}

export const TestCanvas: React.FC<TestCanvasProps> = ({ className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene & Canvas Color (#050506)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050506);

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 4.5;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Illustrative Asteroid Mesh (Noise-Displaced Icosahedron)
    const geometry = new THREE.IcosahedronGeometry(1.4, 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff6b3d, // --color-accent
      wireframe: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Subtle ambient grid for spatial reference
    const grid = new THREE.GridHelper(10, 20, 0x26262a, 0x111113);
    grid.position.y = -1.6;
    scene.add(grid);

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      mesh.rotation.x += 0.003;
      mesh.rotation.y += 0.005;
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    // Handle Resize
    const handleResize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '260px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        <span className="tag-badge accent">3D Model [Illustrative]</span>
      </div>
    </div>
  );
};
