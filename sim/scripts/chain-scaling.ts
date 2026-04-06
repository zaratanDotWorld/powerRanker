import { PowerRanker } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';
import { mulberry32, generateGroundTruth, drawBinary } from '../utils.js';
import { l2Error } from '../metrics.js';

const N = 10;
const trueWeights = generateGroundTruth(N, 1.0);
const itemIds = Array.from({ length: N }, (_, i) => `item-${i}`);
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
    sumS += l2Error(trueWeights, spec);
    sumM += l2Error(trueWeights, mle);
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
    sumS += l2Error(trueWeights, spec);
    sumM += l2Error(trueWeights, mle);
  }
  console.log(`Kb=${String(Kb).padStart(3)}  L2_spec=${(sumS/nTrials).toFixed(5)}  L2_mle=${(sumM/nTrials).toFixed(5)}  ratio=${(sumS/sumM).toFixed(2)}x`);
}
