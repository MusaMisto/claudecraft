// In-memory options state. The options UI (Phase 9) edits this live.

export interface Settings {
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  mouseSensitivity: number; // 0..1, 0.5 = default
  fov: number; // degrees, 30–110
  renderDistance: number; // chunks, 2–10
  vibrantVisuals: boolean; // shadows + bloom + ACES + water shader (Phase 13)
}

export const settings: Settings = {
  musicVolume: 0.7,
  sfxVolume: 1.0,
  mouseSensitivity: 0.5,
  fov: 70,
  renderDistance: 6,
  vibrantVisuals: true,
};
