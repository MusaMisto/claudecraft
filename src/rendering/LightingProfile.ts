// Tunable lighting constants for the day cycle and the Vibrant Visuals layer.
// Centralised here (per the visual-overhaul spec) so the readability floor and
// shadow softness are easy to find and adjust. The governing rule: during the
// day, fully shadowed or sun-averted outdoor surfaces must stay READABLE — they
// must never crush to black. See DECISIONS.md (2026-06-13 lighting rebalance).
//
// Lighting model per fragment (clean-room, not Mojang code):
//   final = bakedVertexColor (face shade × AO)
//         × ( ambientFloor                       // uniform, normal-independent
//           + skyFill · hemisphereFactor(normal) // sky above / ground bounce
//           + sunDiffuse · max(N·L,0)            // directional
//             · (1 − SHADOW_INTENSITY · inShadow) ) // soft, never fully dark
//
// Base intensities are tuned for the CLASSIC path (no tone mapping, so lit
// faces must stay ≲ 1.0). Vibrant multiplies them by the *_GAIN factors and
// applies a gentle filmic curve, which rolls the highlights back into range.

import * as THREE from 'three';

/** Fraction of the sun's contribution removed inside a cast shadow (0..1).
 *  0.55 keeps 45% of direct light in shadow → soft, readable, never black. */
export const SHADOW_INTENSITY = 0.55;

/** Uniform ambient that ignores surface normal — the hard readability floor.
 *  Guarantees even down-facing / fully sun-averted faces keep some light. */
export const DAY_AMBIENT_MIN = 0.22;
export const SUNSET_AMBIENT_MIN = 0.18;
export const NIGHT_AMBIENT_MIN = 0.08;

/** Hemisphere (sky-above / ground-bounce) fill intensities by phase. */
export const DAY_SKY_INTENSITY = 0.5;
export const SUNSET_SKY_INTENSITY = 0.42;
export const NIGHT_SKY_INTENSITY = 0.16;

/** Directional sun/moon intensities by phase (classic-path tuned). */
export const DAY_SUN_INTENSITY = 0.62;
export const SUNSET_SUN_INTENSITY = 0.5;
export const NIGHT_SUN_INTENSITY = 0.16;

/** Vibrant multiplies the base lights, then a filmic curve tames highlights. */
export const VIBRANT_SUN_GAIN = 1.45;
export const VIBRANT_AMBIENT_GAIN = 1.5;
export const VIBRANT_EXPOSURE = 1.02;

/** Hemisphere ground-bounce tint (warm earth) — kept fairly bright so averted
 *  faces read; the sky half-color tracks the live sky color in Sky.update. */
export const HEMISPHERE_GROUND = 0x9a8b6e;

/** Vibrant tone-mapping curve: Khronos PBR Neutral preserves saturation and
 *  does not crush darks the way ACES Filmic does — the pastel target look. */
export const VIBRANT_TONE_MAPPING = THREE.NeutralToneMapping;
