/**
 * BackgroundStars.tsx - React Three Fiber / Declarative Component for Background Stars
 *
 * Wraps BackgroundStars.ts:
 * - 50,000 background stars via THREE.Points
 * - Single draw call, 60fps performance
 * - Procedural point shader (no heavy textures)
 * - Randomized spherical coordinates far beyond Kuiper Belt
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BackgroundStars, BackgroundStarsOptions } from './BackgroundStars';

export interface BackgroundStarsProps extends BackgroundStarsOptions {
  scene?: THREE.Scene;
}

export const BackgroundStarsComponent: React.FC<BackgroundStarsProps> = ({ scene, ...options }) => {
  const instanceRef = useRef<BackgroundStars | null>(null);

  useEffect(() => {
    if (!scene) return;

    const stars = new BackgroundStars(options);
    scene.add(stars.points);
    instanceRef.current = stars;

    return () => {
      scene.remove(stars.points);
      stars.dispose();
      instanceRef.current = null;
    };
  }, [scene]);

  return null;
};

export default BackgroundStarsComponent;
