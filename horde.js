// Combat-only configuration: render quality may never remove or weaken live enemies.
export const HORDE_LIMIT = 320;
const KEYS = [
  [0, 2.0, 18, 1.0, 1.0],
  [30, 4.1, 35, 1.15, 1.05],
  [60, 7.8, 80, 1.4, 1.1],
  [90, 10.0, 95, 1.65, 1.14],
  [150, 13.0, 145, 2.0, 1.23],
  [210, 16.0, 180, 2.4, 1.3],
  [270, 19.0, 240, 2.8, 1.37],
  [300, 21.0, 260, 3.0, 1.42],
];
export function hordeStage(seconds) {
  const t = Math.max(0, seconds);
  let a = KEYS[0],
    b = KEYS.at(-1);
  for (let i = 1; i < KEYS.length; i++)
    if (t <= KEYS[i][0]) {
      a = KEYS[i - 1];
      b = KEYS[i];
      break;
    }
  if (t > 300) {
    const extra = Math.log1p((t - 300) / 120);
    return {
      rate: 21 + extra * 4,
      target: Math.min(306, 260 + extra * 15),
      hp: 3 + extra * 0.7,
      speed: Math.min(1.9, 1.42 + extra * 0.11),
      batch: 12,
      relief: t % 38 > 33,
    };
  }
  const f = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1))),
    mix = (i) => a[i] + (b[i] - a[i]) * f;
  return {
    rate: mix(1),
    target: Math.round(mix(2)),
    hp: mix(3),
    speed: mix(4),
    batch: t < 30 ? 5 : t < 90 ? 8 : 12,
    relief: t % 38 > 33,
  };
}
export function enemyKind(t, column, pattern, random = Math.random) {
  if (pattern === "armor" && column % 3 === 0 && t > 32) return "heavy";
  if (pattern === "flank" && t > 15) return column % 3 ? "runner" : "charger";
  const r = random();
  if (t < 15) return r < 0.12 ? "runner" : "grunt";
  if (t < 40) return r < 0.2 ? "runner" : r < 0.27 ? "ranged" : "grunt";
  return r < 0.53
    ? "grunt"
    : r < 0.7
      ? "runner"
      : r < 0.81
        ? "heavy"
        : r < 0.9
          ? "charger"
          : r < 0.97
            ? "ranged"
            : t > 65
              ? "elite"
              : "heavy";
}
// Rebuilt once per movement step. Swept queries cover every intersected cell.
export class SpatialGrid {
  constructor(size = 2.5) {
    this.size = size;
    this.cells = new Map();
    this.pool = [];
    this.checks = 0;
  }
  rebuild(enemies) {
    for (const bucket of this.cells.values()) {
      bucket.length = 0;
      this.pool.push(bucket);
    }
    this.cells.clear();
    for (const e of enemies) if (!e.dead) this.insert(e);
  }
  insert(e) {
    const key = Math.floor(e.x / this.size) + "," + Math.floor(e.z / this.size);
    let b = this.cells.get(key);
    if (!b) {
      b = this.pool.pop() || [];
      this.cells.set(key, b);
    }
    b.push(e);
  }
  query(x0, z0, x1, z1, pad = 1.6, out = []) {
    out.length = 0;
    const s = this.size;
    for (
      let x = Math.floor((Math.min(x0, x1) - pad) / s);
      x <= Math.floor((Math.max(x0, x1) + pad) / s);
      x++
    )
      for (
        let z = Math.floor((Math.min(z0, z1) - pad) / s);
        z <= Math.floor((Math.max(z0, z1) + pad) / s);
        z++
      ) {
        const b = this.cells.get(x + "," + z);
        if (b) for (const e of b) out.push(e);
      }
    this.checks += out.length;
    return out;
  }
}
export function qualityProfile(level) {
  return [
    { dpr: 1.15, particles: 64, healthBars: 24, animationHz: 30, shadows: true },
    { dpr: 0.85, particles: 48, healthBars: 18, animationHz: 20, shadows: false },
    { dpr: 0.65, particles: 28, healthBars: 12, animationHz: 12, shadows: false },
  ][Math.min(2, Math.max(0, level))];
}

// Hysteresis prevents visible detail flicker around the boundary. Boss never simplifies.
export function enemyDetail(z, quality = 0, previous = null, boss = false) {
  if (boss) return "near";
  const boundary = [-23, -17, -12][Math.max(0, Math.min(2, quality))];
  return z < boundary + (previous === "far" ? 1.5 : -1.5) ? "far" : "near";
}
