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

function drawBinary(wA: number, wB: number, rng: () => number): number {
  return rng() < wA / (wA + wB) ? 1.0 : 0.0;
}

const N = 10;
const trueWeights = generateTrueWeights(N, 1.0);
const itemIds = Array.from({ length: N }, (_, i) => `item-${i}`);
const l2 = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
const nTrials = 300;

console.log('=== Chain graph scaling ===');
for (const K of [5, 10, 20, 50, 100, 200]) {
  let sumS = 0, sumM = 0;
  for (let trial = 0; trial < nTrials; trial++) {
    const rng = mulberry32(trial);
    const prefs: { target: string; source: string; value: number }[] = [];
    for (let i = 0; i < N - 1; i++) {
      for (let rep = 0; rep < K; rep++) {
        prefs.push({ target: itemIds[i], source: itemIds[i+1], value: drawBinary(trueWeights[i], trueWeights[i+1], rng) });
      }
    }
    const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
    for (const p of prefs) ranker.addPreference(p);
    const spec = itemIds.map(id => ranker.run().get(id)!);
    const mle = itemIds.map(id => bradleyTerryMLE(itemIds, prefs, 2000, 1e-12).get(id)!);
    sumS += l2(trueWeights, spec);
    sumM += l2(trueWeights, mle);
  }
  console.log(`K=${String(K).padStart(3)}  L2_spec=${(sumS/nTrials).toFixed(5)}  L2_mle=${(sumM/nTrials).toFixed(5)}  ratio=${(sumS/sumM).toFixed(2)}x`);
}

// Also: two cliques + bridge, scaling K on the bridge
console.log('\n=== Two cliques + bridge scaling (K_clique=20, K_bridge varies) ===');
for (const Kb of [1, 5, 10, 20, 50, 100]) {
  let sumS = 0, sumM = 0;
  for (let trial = 0; trial < nTrials; trial++) {
    const rng = mulberry32(trial);
    const prefs: { target: string; source: string; value: number }[] = [];
    for (let i = 0; i < 5; i++)
      for (let j = i + 1; j < 5; j++)
        for (let rep = 0; rep < 20; rep++)
          prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
    for (let i = 5; i < 10; i++)
      for (let j = i + 1; j < 10; j++)
        for (let rep = 0; rep < 20; rep++)
          prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
    for (let rep = 0; rep < Kb; rep++)
      prefs.push({ target: itemIds[4], source: itemIds[5], value: drawBinary(trueWeights[4], trueWeights[5], rng) });
    const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
    for (const p of prefs) ranker.addPreference(p);
    const spec = itemIds.map(id => ranker.run().get(id)!);
    const mle = itemIds.map(id => bradleyTerryMLE(itemIds, prefs, 2000, 1e-12).get(id)!);
    sumS += l2(trueWeights, spec);
    sumM += l2(trueWeights, mle);
  }
  console.log(`Kb=${String(Kb).padStart(3)}  L2_spec=${(sumS/nTrials).toFixed(5)}  L2_mle=${(sumM/nTrials).toFixed(5)}  ratio=${(sumS/sumM).toFixed(2)}x`);
}
