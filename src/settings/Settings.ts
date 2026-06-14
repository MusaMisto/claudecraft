// In-memory options state. The options UI (Phase 9) edits this live.

export interface Settings {
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  mouseSensitivity: number; // 0..1, 0.5 = default
  fov: number; // degrees, 30–110
  renderDistance: number; // chunks, 2–16
  vibrantVisuals: boolean; // HDR/bloom/water/atmosphere enhancements (Phases 13–14)
  useTexturePack: boolean; // Faithful block/foliage/entity textures; procedural by default
}

export const settings: Settings = {
  musicVolume: 0.7,
  sfxVolume: 1.0,
  mouseSensitivity: 0.5,
  fov: 70,
  renderDistance: 12,
  vibrantVisuals: false,
  useTexturePack: false,
};
