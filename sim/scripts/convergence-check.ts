import { PowerRanker } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';
import { mulberry32, generateGroundTruth, drawScore } from '../utils.js';
import { l2Error } from '../metrics.js';

const N = 10;
const trueWeights = generateGroundTruth(N, 1.0);
const itemIds = Array.from({ length: N }, (_, i) => `item-${i}`);

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
  console.log(`K=${K}  L2_spec=${l2Error(trueWeights, spec).toFixed(6)}  L2_mle=${l2Error(trueWeights, mle).toFixed(6)}`);
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
    sumS += l2Error(trueWeights, spec);
    sumM += l2Error(trueWeights, mle);
  }
  console.log(`K=${K.toString().padStart(2)}  L2_spec=${(sumS/30).toFixed(6)}  L2_mle=${(sumM/30).toFixed(6)}  ratio=${(sumS/sumM).toFixed(2)}x`);
}
