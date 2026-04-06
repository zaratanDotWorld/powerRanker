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
  return 1 / (1 + Math.exp(-(Math.log(wA / wB) + z * sigma)));
}

const N = 20;
const trueWeights = generateTrueWeights(N, 1.0);
const itemIds = Array.from({ length: N }, (_, i) => `item-${i}`);
const l2 = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
const nTrials = 50;

console.log('Crossover: spectral(k) vs MLE, random selection, continuous, α=1.0, N=20');
console.log('votes  vpi    L2_spec    L2_mle     winner');

for (const totalVotes of [5, 10, 15, 20, 30, 40, 60, 80, 120, 200, 400]) {
  let sumS = 0, sumM = 0;
  for (let trial = 0; trial < nTrials; trial++) {
    const rng = mulberry32(42 + trial);
    const allPrefs: { target: string; source: string; value: number }[] = [];
    for (let v = 0; v < totalVotes; v++) {
      const i = Math.floor(rng() * N);
      let j = Math.floor(rng() * (N - 1));
      if (j >= i) j++;
      allPrefs.push({ target: itemIds[i], source: itemIds[j], value: drawScore(trueWeights[i], trueWeights[j], 0.15, rng) });
    }
    const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 1/N, flow: 'bidirectional' } });
    for (const p of allPrefs) ranker.addPreference(p);
    const spec = itemIds.map(id => ranker.run().get(id)!);
    const mle = itemIds.map(id => bradleyTerryMLE(itemIds, allPrefs).get(id)!);
    sumS += l2(trueWeights, spec);
    sumM += l2(trueWeights, mle);
  }
  const avgS = sumS / nTrials;
  const avgM = sumM / nTrials;
  const vpi = totalVotes / N;
  console.log(
    `${String(totalVotes).padStart(5)}  ${vpi.toFixed(1).padStart(5)}  ${avgS.toFixed(5).padStart(9)}  ${avgM.toFixed(5).padStart(9)}     ${avgS < avgM ? 'SPECTRAL' : 'MLE'}`
  );
}
