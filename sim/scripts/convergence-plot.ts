/**
 * Generate RMSE and Spearman data for spectral (activeSelect) vs MLE (random)
 * across VPI levels. Outputs CSV to stdout.
 */
import { PowerRanker, pairKey } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';
import { mulberry32, generateGroundTruth, drawScore } from '../utils.js';
import { rankArray, spearman, rmse } from '../metrics.js';

// --- Config ---
const N = 100;
const alpha = 1.0;
const sigma = 0.15;
const nTrials = 5;
const sessionSize = 50; // larger sessions = fewer ranker rebuilds
const seed = 42;

const trueWeights = generateGroundTruth(N, alpha);
const itemIds = Array.from({ length: N }, (_, i) => `item-${String(i).padStart(3, '0')}`);

// --- Run ---
console.log('vpi,method,rmse,spearman');

for (let vpiTarget = 1; vpiTarget <= 20; vpiTarget += 1) {
  const totalVotes = vpiTarget * N;

  let sumRmseSpec = 0, sumSpearSpec = 0;
  let sumRmseMle = 0, sumSpearMle = 0;

  for (let trial = 0; trial < nTrials; trial++) {
    const trialSeed = seed + trial * 1000;

    // --- Spectral with activeSelect ---
    {
      const rng = mulberry32(trialSeed);
      const allPrefs: { target: string; source: string; value: number }[] = [];
      const exclude = new Set<string>();
      let votesCollected = 0;

      while (votesCollected < totalVotes) {
        // Build ranker with current data
        const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
        for (const p of allPrefs) ranker.addPreference(p);

        // Active select pairs
        const batchSize = Math.min(sessionSize, totalVotes - votesCollected);
        const pairs = ranker.activeSelect({ num: batchSize, exclude, terms: ['coverage', 'proximity'], r: 0.9, rng });

        for (const pair of pairs) {
          const iA = parseInt(pair.alpha.split('-')[1]);
          const iB = parseInt(pair.beta.split('-')[1]);
          const score = drawScore(trueWeights[iA], trueWeights[iB], sigma, rng, 5);
          allPrefs.push({ target: pair.alpha, source: pair.beta, value: score });
          exclude.add(pairKey(pair.alpha, pair.beta));
        }
        votesCollected += batchSize;
      }

      // Measure spectral
      const finalRanker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
      for (const p of allPrefs) finalRanker.addPreference(p);
      const weights = finalRanker.run();
      const recovered = itemIds.map(id => weights.get(id)!);
      sumRmseSpec += rmse(trueWeights, recovered);
      sumSpearSpec += spearman(trueWeights, recovered);
    }

    // --- MLE with random selection ---
    {
      const rng = mulberry32(trialSeed + 500);
      const allPrefs: { target: string; source: string; value: number }[] = [];

      for (let v = 0; v < totalVotes; v++) {
        const i = Math.floor(rng() * N);
        let j = Math.floor(rng() * (N - 1));
        if (j >= i) j++;
        const score = drawScore(trueWeights[i], trueWeights[j], sigma, rng, 5);
        allPrefs.push({ target: itemIds[i], source: itemIds[j], value: score });
      }

      const mleWeights = bradleyTerryMLE(itemIds, allPrefs);
      const recovered = itemIds.map(id => mleWeights.get(id)!);
      sumRmseMle += rmse(trueWeights, recovered);
      sumSpearMle += spearman(trueWeights, recovered);
    }
  }

  const avgRmseSpec = sumRmseSpec / nTrials;
  const avgSpearSpec = sumSpearSpec / nTrials;
  const avgRmseMle = sumRmseMle / nTrials;
  const avgSpearMle = sumSpearMle / nTrials;

  console.log(`${vpiTarget},spectral,${avgRmseSpec.toFixed(6)},${avgSpearSpec.toFixed(4)}`);
  console.log(`${vpiTarget},mle,${avgRmseMle.toFixed(6)},${avgSpearMle.toFixed(4)}`);

  // Progress to stderr
  if (vpiTarget % 100 === 0) {
    process.stderr.write(`vpi=${vpiTarget} done\n`);
  }
}
