import { PowerRanker } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';
import { mulberry32, generateGroundTruth, drawScore } from '../utils.js';
import { l2Error } from '../metrics.js';

const N = 20;
const alpha = 1.0;
const sigma = 0.15;
const trueWeights = generateGroundTruth(N, alpha);
const itemIds = Array.from({ length: N }, (_, i) => `item-${i}`);
const nTrials = 30;

console.log('Spectral vs MLE: complete coverage vs random selection (continuous, α=1.0, N=20)');
console.log('30 trials averaged\n');
console.log('mode         vpi    L2_spec(0)  L2_mle    ratio');

for (const vpiTarget of [10, 19, 38, 76]) {
  // Complete coverage
  const K = Math.round(vpiTarget / (N-1) * 2);  // K comparisons per pair
  let sumSpecC = 0, sumMleC = 0;
  for (let trial = 0; trial < nTrials; trial++) {
    const rng = mulberry32(42 + trial);
    const allPrefs: { target: string; source: string; value: number }[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        for (let rep = 0; rep < K; rep++) {
          allPrefs.push({ target: itemIds[i], source: itemIds[j], value: drawScore(trueWeights[i], trueWeights[j], sigma, rng) });
        }
      }
    }
    const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
    for (const p of allPrefs) ranker.addPreference(p);
    const spec = itemIds.map(id => ranker.run().get(id)!);
    const mle = itemIds.map(id => bradleyTerryMLE(itemIds, allPrefs).get(id)!);
    sumSpecC += l2Error(trueWeights, spec);
    sumMleC += l2Error(trueWeights, mle);
  }
  const actualVpi = K * N * (N-1) / 2 / N;
  console.log(`complete     ${actualVpi.toFixed(0).padStart(4)}    ${(sumSpecC/nTrials).toFixed(5)}     ${(sumMleC/nTrials).toFixed(5)}     ${((sumSpecC/nTrials)/(sumMleC/nTrials)).toFixed(1)}x`);

  // Random selection at same vpi
  let sumSpecR = 0, sumMleR = 0;
  for (let trial = 0; trial < nTrials; trial++) {
    const rng = mulberry32(42 + trial);
    const allPrefs: { target: string; source: string; value: number }[] = [];
    const totalVotes = Math.round(vpiTarget * N);
    for (let v = 0; v < totalVotes; v++) {
      const i = Math.floor(rng() * N);
      let j = Math.floor(rng() * (N - 1));
      if (j >= i) j++;
      allPrefs.push({ target: itemIds[i], source: itemIds[j], value: drawScore(trueWeights[i], trueWeights[j], sigma, rng) });
    }
    const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
    for (const p of allPrefs) ranker.addPreference(p);
    const spec = itemIds.map(id => ranker.run().get(id)!);
    const mle = itemIds.map(id => bradleyTerryMLE(itemIds, allPrefs).get(id)!);
    sumSpecR += l2Error(trueWeights, spec);
    sumMleR += l2Error(trueWeights, mle);
  }
  console.log(`random       ${vpiTarget.toString().padStart(4)}    ${(sumSpecR/nTrials).toFixed(5)}     ${(sumMleR/nTrials).toFixed(5)}     ${((sumSpecR/nTrials)/(sumMleR/nTrials)).toFixed(1)}x`);
  console.log('');
}
