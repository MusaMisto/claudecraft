import * as THREE from 'three';
import type { Player } from '../player/Player';

// Minecraft Java 1.21.11 ClientAvatarState/GameRenderer values.
const WALK_DISTANCE_SCALE = 0.6;
const MAX_BOB_AMPLITUDE = 0.1;
const BOB_EASING = 0.4;

export interface ViewBobSample {
  phase: number;
  amplitude: number;
  translateX: number;
  translateY: number;
  roll: number;
  pitch: number;
}

/**
 * Minecraft Java's distance, amplitude, smoothing, and camera transforms,
 * driven by Claudecraft's equivalent per-tick player motion.
 */
export class ViewBobbing {
  private walkDistance = 0;
  private previousWalkDistance = 0;
  private amplitude = 0;
  private previousAmplitude = 0;
  private viewTransform = new THREE.Matrix4();
  private inverseViewTransform = new THREE.Matrix4();
  private baseTransform = new THREE.Matrix4();
  private finalTransform = new THREE.Matrix4();
  private rotationZ = new THREE.Matrix4();
  private rotationX = new THREE.Matrix4();
  readonly sample: ViewBobSample = {
    phase: 0,
    amplitude: 0,
    translateX: 0,
    translateY: 0,
    roll: 0,
    pitch: 0,
  };

  tick(player: Player): void {
    this.previousWalkDistance = this.walkDistance;
    this.previousAmplitude = this.amplitude;

    const moved = Math.hypot(
      player.position.x - player.prevPosition.x,
      player.position.z - player.prevPosition.z,
    );
    this.walkDistance += moved * WALK_DISTANCE_SCALE;
    const horizontalVelocity = Math.hypot(player.velocity.x, player.velocity.z);
    const targetAmplitude =
      player.onGround && !player.flying && !player.inWater
        ? Math.min(MAX_BOB_AMPLITUDE, horizontalVelocity)
        : 0;
    this.amplitude += (targetAmplitude - this.amplitude) * BOB_EASING;
  }

  apply(camera: THREE.PerspectiveCamera, alpha: number): ViewBobSample {
    const distanceDelta = this.walkDistance - this.previousWalkDistance;
    const phase = -(this.walkDistance + distanceDelta * alpha);
    const amplitude = THREE.MathUtils.lerp(this.previousAmplitude, this.amplitude, alpha);
    const wave = Math.sin(phase * Math.PI);
    const translateX = wave * amplitude * 0.5;
    const translateY = -Math.abs(Math.cos(phase * Math.PI) * amplitude);
    const roll = THREE.MathUtils.degToRad(wave * amplitude * 3);
    const pitch = THREE.MathUtils.degToRad(
      Math.abs(Math.cos(phase * Math.PI - 0.2) * amplitude) * 5,
    );

    this.sample.phase = phase;
    this.sample.amplitude = amplitude;
    this.sample.translateX = translateX;
    this.sample.translateY = translateY;
    this.sample.roll = roll;
    this.sample.pitch = pitch;

    camera.updateMatrix();
    this.baseTransform.copy(camera.matrix);
    this.viewTransform
      .makeTranslation(translateX, translateY, 0)
      .multiply(this.rotationZ.makeRotationZ(roll))
      .multiply(this.rotationX.makeRotationX(pitch));
    this.inverseViewTransform.copy(this.viewTransform).invert();
    this.finalTransform.multiplyMatrices(this.baseTransform, this.inverseViewTransform);
    this.finalTransform.decompose(camera.position, camera.quaternion, camera.scale);
    camera.updateMatrix();
    camera.updateMatrixWorld(true);
    return this.sample;
  }
}
