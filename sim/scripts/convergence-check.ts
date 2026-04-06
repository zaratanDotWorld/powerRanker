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

function drawScore(wA: number, wB: number, sigma: number, rng: () => number): number {
  const u1 = rng(); const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const logOdds = Math.log(wA / wB) + z * sigma;
  return 1 / (1 + Math.exp(-logOdds));
}

const N = 10;
const trueWeights = generateTrueWeights(N, 1.0);
const itemIds = Array.from({ length: N }, (_, i) => `item-${i}`);
const l2 = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

// Noiseless BT: with sigma=0, score = wA/(wA+wB) exactly
console.log('Noiseless BT (σ=0), complete coverage:');
for (const K of [1, 10, 100]) {
  const rng = mulberry32(42);
  const allPrefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      for (let rep = 0; rep < K; rep++) {
        allPrefs.push({ target: itemIds[i], source: itemIds[j], value: drawScore(trueWeights[i], trueWeights[j], 0, rng) });
      }
    }
  }
  const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
  for (const p of allPrefs) ranker.addPreference(p);
  const spec = itemIds.map(id => ranker.run().get(id)!);
  const mle = itemIds.map(id => bradleyTerryMLE(itemIds, allPrefs).get(id)!);
  console.log(`K=${K}  L2_spec=${l2(trueWeights, spec).toFixed(6)}  L2_mle=${l2(trueWeights, mle).toFixed(6)}`);
}

// Noisy: sigma=0.15
console.log('\nNoisy (σ=0.15), complete coverage, 30 trials averaged:');
for (const K of [1, 4, 16, 64]) {
  let sumS = 0, sumM = 0;
  for (let trial = 0; trial < 30; trial++) {
    const rng = mulberry32(42 + trial);
    const allPrefs: { target: string; source: string; value: number }[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        for (let rep = 0; rep < K; rep++) {
          allPrefs.push({ target: itemIds[i], source: itemIds[j], value: drawScore(trueWeights[i], trueWeights[j], 0.15, rng) });
        }
      }
    }
    const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
    for (const p of allPrefs) ranker.addPreference(p);
    const spec = itemIds.map(id => ranker.run().get(id)!);
    const mle = itemIds.map(id => bradleyTerryMLE(itemIds, allPrefs).get(id)!);
    sumS += l2(trueWeights, spec);
    sumM += l2(trueWeights, mle);
  }
  console.log(`K=${K.toString().padStart(2)}  L2_spec=${(sumS/30).toFixed(6)}  L2_mle=${(sumM/30).toFixed(6)}  ratio=${(sumS/sumM).toFixed(2)}x`);
}
