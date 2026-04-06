import { PowerRanker } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function generateTrueWeights(n: number, alpha: number): number[] {
  const raw = Array.from({ length: n }, (_, i) => Math.pow((i + 1) / n, alpha));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

function gaussianVariate(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function drawScore(wA: number, wB: number, sigma: number, continuous: boolean, rng: () => number): number {
  const logOdds = Math.log(wA / wB) + gaussianVariate(rng) * sigma;
  const score = 1 / (1 + Math.exp(-logOdds));
  if (continuous) return score;
  return Math.round(score * 4) / 4;
}

const N = 20;
const alpha = 1.0;
const sigma = 0.15;
const rng = mulberry32(42);
const trueWeights = generateTrueWeights(N, alpha);
const itemIds = Array.from({ length: N }, (_, i) => `item-${i}`);
const l2 = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

console.log('Complete pair coverage: every pair compared K times');
console.log('K   vpi    L2_spec(k)  L2_spec(0)  L2_mle    spec/mle_ratio');

for (const K of [1, 2, 4, 8, 16, 32]) {
  const allPrefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      for (let rep = 0; rep < K; rep++) {
        const score = drawScore(trueWeights[i], trueWeights[j], sigma, true, rng);
        allPrefs.push({ target: itemIds[i], source: itemIds[j], value: score });
      }
    }
  }
  // vpi = total_votes / N. Total pairs = N*(N-1)/2, each compared K times
  const totalVotes = N * (N - 1) / 2 * K;
  const vpi = totalVotes / N;

  // Spectral with k
  const rankerK = new PowerRanker({ items: new Set(itemIds), options: { k: 1/N, flow: 'bidirectional' } });
  for (const p of allPrefs) rankerK.addPreference(p);
  const specK = itemIds.map(id => rankerK.run().get(id)!);

  // Spectral without k
  const ranker0 = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
  for (const p of allPrefs) ranker0.addPreference(p);
  const spec0 = itemIds.map(id => ranker0.run().get(id)!);

  // MLE
  const mle = itemIds.map(id => bradleyTerryMLE(itemIds, allPrefs).get(id)!);

  const l2sk = l2(trueWeights, specK);
  const l2s0 = l2(trueWeights, spec0);
  const l2m = l2(trueWeights, mle);

  console.log(
    `${String(K).padStart(2)}  ${vpi.toFixed(0).padStart(5)}    ${l2sk.toFixed(5)}     ${l2s0.toFixed(5)}     ${l2m.toFixed(5)}     ${(l2s0/l2m).toFixed(1)}x`
  );
}
