import type { Painter } from './TextureAtlas';

const TILE = 16;

function jitter(rng: () => number, base: number, amount: number): number {
  return Math.max(0, Math.min(255, Math.round(base + (rng() * 2 - 1) * amount)));
}

const noisy =
  (r: number, g: number, b: number, amount: number): Painter =>
  (px, rng) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        px(x, y, jitter(rng, r, amount), jitter(rng, g, amount), jitter(rng, b, amount));
      }
    }
  };

const logSide =
  (light: [number, number, number], dark: [number, number, number]): Painter =>
  (px, rng) => {
    for (let x = 0; x < TILE; x++) {
      const stripe = x % 5 === 0 || x % 7 === 0;
      for (let y = 0; y < TILE; y++) {
        const base = stripe || rng() < 0.06 ? dark : light;
        px(x, y, jitter(rng, base[0], 7), jitter(rng, base[1], 7), jitter(rng, base[2], 7));
      }
    }
  };

const logTop =
  (inner: [number, number, number], bark: [number, number, number]): Painter =>
  (px, rng) => {
    const center = 7.5;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const distance = Math.hypot(x - center, y - center);
        const base = distance > 7 ? bark : inner;
        const ring = distance <= 7 && Math.floor(distance) % 2 === 0 ? -13 : 0;
        px(
          x,
          y,
          jitter(rng, base[0] + ring, 6),
          jitter(rng, base[1] + ring, 6),
          jitter(rng, base[2] + ring, 6),
        );
      }
    }
  };

const leaves =
  (base: [number, number, number]): Painter =>
  (px, rng) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        if (rng() < 0.2) {
          px(x, y, 0, 0, 0, 0);
        } else {
          const shade = rng() < 0.3 ? -18 : 0;
          px(x, y, jitter(rng, base[0] + shade, 9), jitter(rng, base[1] + shade, 9), jitter(rng, base[2] + shade, 8));
        }
      }
    }
  };

const paintIce: Painter = (px, rng) => {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const seam = x === 0 || y === 0 || x === 15 || y === 15 || (x + y === 11 && x > 3);
      px(
        x,
        y,
        jitter(rng, seam ? 174 : 196, 5),
        jitter(rng, seam ? 213 : 229, 5),
        jitter(rng, seam ? 235 : 247, 4),
        seam ? 220 : 180,
      );
    }
  }
};

const paintCactusSide: Painter = (px, rng) => {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const rib = x % 4 === 0;
      const thorn = (x * 5 + y * 3) % 29 === 0;
      px(x, y, thorn ? 197 : jitter(rng, rib ? 48 : 67, 5), thorn ? 216 : jitter(rng, rib ? 118 : 143, 6), thorn ? 164 : jitter(rng, 54, 4));
    }
  }
};

const paintCactusTop: Painter = (px, rng) => {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const edge = x < 2 || y < 2 || x > 13 || y > 13;
      px(x, y, jitter(rng, edge ? 45 : 76, 5), jitter(rng, edge ? 113 : 151, 6), jitter(rng, edge ? 48 : 62, 4));
    }
  }
};

const paintDryGrass: Painter = (px, rng) => {
  for (const x of [2, 5, 8, 11, 14]) {
    const height = 7 + Math.floor(rng() * 7);
    for (let i = 0; i < height; i++) {
      const bend = i > height * 0.65 ? (x < 8 ? -1 : 1) : 0;
      px(x + bend, 15 - i, jitter(rng, 155, 9), jitter(rng, 139, 8), jitter(rng, 73, 6));
    }
  }
};

const paintDeadBush: Painter = (px, rng) => {
  for (let y = 6; y < 16; y++) px(8, y, jitter(rng, 126, 7), jitter(rng, 88, 6), jitter(rng, 48, 5));
  for (const [sx, sy, dx] of [[8, 8, -1], [8, 10, 1], [8, 12, -1]]) {
    for (let i = 1; i < 6; i++) {
      px(sx + dx * i, sy - i, jitter(rng, 132, 7), jitter(rng, 92, 6), jitter(rng, 49, 5));
    }
  }
};

export const BIOME_PAINTERS: Record<string, Painter> = {
  snow: noisy(238, 244, 246, 5),
  ice: paintIce,
  cactus_side: paintCactusSide,
  cactus_top: paintCactusTop,
  birch_log_side: logSide([204, 200, 174], [73, 67, 55]),
  birch_log_top: logTop([192, 170, 122], [93, 83, 65]),
  birch_leaves: leaves([82, 144, 67]),
  spruce_log_side: logSide([91, 69, 43], [61, 47, 33]),
  spruce_log_top: logTop([142, 108, 64], [69, 52, 35]),
  spruce_leaves: leaves([50, 101, 72]),
  acacia_log_side: logSide([99, 91, 79], [72, 65, 57]),
  acacia_log_top: logTop([181, 98, 58], [91, 75, 62]),
  acacia_leaves: leaves([92, 126, 52]),
  dry_grass: paintDryGrass,
  dead_bush: paintDeadBush,
};
