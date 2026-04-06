import { PowerRanker } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';
import { mulberry32, generateGroundTruth, drawBinary } from '../utils.js';
import { l2Error } from '../metrics.js';

const N = 10;
const trueWeights = generateGroundTruth(N, 1.0);
const itemIds = Array.from({ length: N }, (_, i) => `item-${i}`);

// Average over many trials to separate signal from noise
const nTrials = 200;

function avgTest(
  label: string,
  genPrefs: (rng: () => number) => { target: string; source: string; value: number }[],
) {
  let sumS = 0, sumM = 0, sumDiff = 0;
  for (let trial = 0; trial < nTrials; trial++) {
    const rng = mulberry32(trial);
    const prefs = genPrefs(rng);

    const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
    for (const p of prefs) ranker.addPreference(p);
    const spec = itemIds.map(id => ranker.run().get(id)!);
    const mle = itemIds.map(id => bradleyTerryMLE(itemIds, prefs, 2000, 1e-12).get(id)!);

    sumS += l2Error(trueWeights, spec);
    sumM += l2Error(trueWeights, mle);
    sumDiff += Math.max(...spec.map((s, i) => Math.abs(s - mle[i])));
  }
  console.log(`${label}`);
  console.log(`  avg L2_spec=${(sumS/nTrials).toFixed(5)}  L2_mle=${(sumM/nTrials).toFixed(5)}  max|diff|=${(sumDiff/nTrials).toExponential(2)}  ratio=${(sumS/sumM).toFixed(2)}x`);
}

console.log('=== Averaged over 200 trials (binary, N=10, α=1.0) ===\n');

// A: Complete + equal K
avgTest('A. Complete, equal K=20 per pair', (rng) => {
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++)
      for (let rep = 0; rep < 20; rep++)
        prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
  return prefs;
});

// B: Complete + unequal K per PAIR (but symmetric: all items get same total)
avgTest('B. Complete, unequal K per pair (5-40), symmetric item totals', (rng) => {
  const prefs: { target: string; source: string; value: number }[] = [];
  // Pre-generate K for each pair
  const Ks: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      Ks[i][j] = 5 + Math.floor(rng() * 36);
      Ks[j][i] = Ks[i][j];
    }
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++)
      for (let rep = 0; rep < Ks[i][j]; rep++)
        prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
  return prefs;
});

// C: Complete + unequal item-level observations (one item oversampled)
avgTest('C. Complete, item-0 gets 50/pair, others get 5/pair', (rng) => {
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const K = (i === 0 || j === 0) ? 50 : 5;
      for (let rep = 0; rep < K; rep++)
        prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
    }
  return prefs;
});

// D: Random selection (naturally unequal everything)
avgTest('D. Random selection, 200 comparisons', (rng) => {
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let v = 0; v < 200; v++) {
    const i = Math.floor(rng() * N);
    let j = Math.floor(rng() * (N - 1));
    if (j >= i) j++;
    prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
  }
  return prefs;
});

// E: Complete + equal K but with FRACTIONAL (continuous) scores
avgTest('E. Complete, equal K=20 per pair, FRACTIONAL scores', (rng) => {
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++)
      for (let rep = 0; rep < 20; rep++) {
        const u1 = rng(); const u2 = rng();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const score = 1 / (1 + Math.exp(-(Math.log(trueWeights[i] / trueWeights[j]) + z * 0.15)));
        prefs.push({ target: itemIds[i], source: itemIds[j], value: score });
      }
  return prefs;
});
