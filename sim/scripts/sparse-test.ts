import { PowerRanker } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';
import { mulberry32, generateGroundTruth, drawScore } from '../utils.js';
import { l2Error } from '../metrics.js';

const N = 20;
const trueWeights = generateGroundTruth(N, 1.0);
const itemIds = Array.from({ length: N }, (_, i) => `item-${i}`);

// Very sparse: only 10 random comparisons total (vpi=0.5)
console.log('Extreme sparsity: 10 comparisons for 20 items (vpi=0.5)');
console.log('30 trials averaged:');
let sumS = 0, sumM = 0, mleNaN = 0;
for (let trial = 0; trial < 30; trial++) {
  const rng = mulberry32(42 + trial);
  const allPrefs: { target: string; source: string; value: number }[] = [];
  for (let v = 0; v < 10; v++) {
    const i = Math.floor(rng() * N);
    let j = Math.floor(rng() * (N - 1));
    if (j >= i) j++;
    allPrefs.push({ target: itemIds[i], source: itemIds[j], value: drawScore(trueWeights[i], trueWeights[j], 0.15, rng) });
  }

  const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 1/N, flow: 'bidirectional' } });
  for (const p of allPrefs) ranker.addPreference(p);
  const spec = itemIds.map(id => ranker.run().get(id)!);

  const mle = itemIds.map(id => bradleyTerryMLE(itemIds, allPrefs).get(id)!);
  const specL2 = l2Error(trueWeights, spec);
  const mleL2 = l2Error(trueWeights, mle);

  if (isNaN(mleL2)) { mleNaN++; continue; }
  sumS += specL2;
  sumM += mleL2;
}
const valid = 30 - mleNaN;
console.log(`  L2_spectral=${(sumS/valid).toFixed(5)}  L2_mle=${(sumM/valid).toFixed(5)}  mle_failures=${mleNaN}/30`);

// Check: are unobserved items assigned 1/N by both?
const rng = mulberry32(42);
const allPrefs: { target: string; source: string; value: number }[] = [];
for (let v = 0; v < 10; v++) {
  const i = Math.floor(rng() * N);
  let j = Math.floor(rng() * (N - 1));
  if (j >= i) j++;
  allPrefs.push({ target: itemIds[i], source: itemIds[j], value: drawScore(trueWeights[i], trueWeights[j], 0.15, rng) });
}

const observed = new Set<string>();
for (const p of allPrefs) { observed.add(p.target); observed.add(p.source); }
console.log(`\nItems observed: ${observed.size}/${N}`);
