/**
 * Deterministic pseudo-randomness.
 *
 * The engine needs to break ties — two slots can score identically — without
 * becoming unpredictable. `Math.random()` would make the same input produce
 * different plans, which the brief forbids and which would make the whole
 * suite untestable.
 *
 * mulberry32: small, fast, and good enough for tie-breaking.
 */

export type Random = () => number;

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRandom(seed: string): Random {
  let state = hashSeed(seed);

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
