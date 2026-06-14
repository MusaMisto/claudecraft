import * as THREE from 'three';

/** Reusable snapshot of the world lights for render passes outside the scene. */
export interface EnvironmentLighting {
  readonly skyColor: THREE.Color;
  readonly groundColor: THREE.Color;
  readonly directionalColor: THREE.Color;
  readonly direction: THREE.Vector3;
  skyIntensity: number;
  ambientIntensity: number;
  directionalIntensity: number;
}

export function createEnvironmentLighting(): EnvironmentLighting {
  return {
    skyColor: new THREE.Color(),
    groundColor: new THREE.Color(),
    directionalColor: new THREE.Color(),
    direction: new THREE.Vector3(),
    skyIntensity: 0,
    ambientIntensity: 0,
    directionalIntensity: 0,
  };
}
