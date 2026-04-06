/**
 * Shared utilities for simulation scripts.
 *
 * - mulberry32: seeded PRNG
 * - generateGroundTruth: power-law weight vector
 * - gaussianVariate: Box-Muller normal draw
 * - drawScore: logit-normal noisy BT score with optional Likert quantization
 * - drawBinary: noiseless BT coin flip
 */

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateGroundTruth(n: number, alpha: number): number[] {
  if (n <= 0) throw new Error('Cannot generate weights for 0 items');
  const raw = Array.from({ length: n }, (_, i) => Math.pow((i + 1) / n, alpha));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

export function gaussianVariate(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Logit-normal vote model: perturbs true log-odds with Gaussian noise,
 * then applies sigmoid. If likertPoints is provided, quantizes to that
 * many levels (e.g., 5 → scores in {0, 0.25, 0.5, 0.75, 1}).
 */
export function drawScore(
  wA: number, wB: number, sigma: number, rng: () => number, likertPoints?: number,
): number {
  const logOdds = Math.log(wA / wB) + gaussianVariate(rng) * sigma;
  const score = 1 / (1 + Math.exp(-logOdds));
  if (likertPoints === undefined) return score;
  const bins = likertPoints - 1;
  return Math.round(score * bins) / bins;
}

/** Noiseless BT coin flip: returns 1.0 if A wins, 0.0 if B wins. */
export function drawBinary(wA: number, wB: number, rng: () => number): number {
  return rng() < wA / (wA + wB) ? 1.0 : 0.0;
}
