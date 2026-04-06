/**
 * Generate RMSE and Spearman data for spectral (activeSelect) vs MLE (random)
 * across VPI levels. Outputs CSV to stdout.
 */
import { PowerRanker, pairKey } from '../src/index.js';
import { bradleyTerryMLE } from './mle.js';

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

function drawScore(wA: number, wB: number, sigma: number, rng: () => number): number {
  const logOdds = Math.log(wA / wB) + gaussianVariate(rng) * sigma;
  const score = 1 / (1 + Math.exp(-logOdds));
  return Math.round(score * 4) / 4; // 5-point Likert
}

function rankArray(arr: number[]): number[] {
  const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const ranks = new Array(arr.length);
  sorted.forEach((el, rank) => { ranks[el.i] = rank + 1; });
  return ranks;
}

function spearman(a: number[], b: number[]): number {
  const n = a.length;
  const rA = rankArray(a);
  const rB = rankArray(b);
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (rA[i] - rB[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

function rmse(a: number[], b: number[]): number {
  let sumSq = 0;
  for (let i = 0; i < a.length; i++) sumSq += (a[i] - b[i]) ** 2;
  return Math.sqrt(sumSq / a.length);
}

// --- Config ---
const N = 100;
const alpha = 1.0;
const sigma = 0.15;
const nTrials = 5;
const sessionSize = 50; // larger sessions = fewer ranker rebuilds
const seed = 42;

const trueWeights = generateTrueWeights(N, alpha);
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
          const score = drawScore(trueWeights[iA], trueWeights[iB], sigma, rng);
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
        const score = drawScore(trueWeights[i], trueWeights[j], sigma, rng);
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
