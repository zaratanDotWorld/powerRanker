import { PowerRanker } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';
import { mulberry32, generateGroundTruth, drawBinary, drawScore } from '../utils.js';
import { l2Error } from '../metrics.js';

const N = 10;
const trueWeights = generateGroundTruth(N, 1.0);
const itemIds = Array.from({ length: N }, (_, i) => `item-${i}`);

function runTest(
  label: string,
  prefs: { target: string; source: string; value: number }[],
) {
  // Spectral k=0 (pure Rank Centrality)
  const ranker = new PowerRanker({
    items: new Set(itemIds),
    options: { k: 0, flow: 'bidirectional', verbose: false },
  });
  for (const p of prefs) ranker.addPreference(p);
  const specWeights = ranker.run();
  const spec = itemIds.map(id => specWeights.get(id)!);

  // MLE
  const mleWeights = bradleyTerryMLE(itemIds, prefs, 2000, 1e-12);
  const mle = itemIds.map(id => mleWeights.get(id)!);

  // Compare
  let maxDiff = 0;
  for (let i = 0; i < N; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(spec[i] - mle[i]));
  }

  console.log(`${label}`);
  console.log(`  max|spec-mle| = ${maxDiff.toExponential(3)}  L2_spec=${l2Error(trueWeights, spec).toFixed(5)}  L2_mle=${l2Error(trueWeights, mle).toFixed(5)}`);
}

const rng = mulberry32(42);

// Test 1: Binary outcomes, complete graph, equal comparisons per pair
console.log('=== Condition testing: when are spectral and MLE equivalent? ===\n');
{
  const K = 20;
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      for (let rep = 0; rep < K; rep++) {
        prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
      }
    }
  }
  runTest('1. Binary + complete + equal K per pair', prefs);
}

// Test 2: Fractional scores, complete graph, equal K
{
  const K = 20;
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      for (let rep = 0; rep < K; rep++) {
        prefs.push({ target: itemIds[i], source: itemIds[j], value: drawScore(trueWeights[i], trueWeights[j], 0.15, rng) });
      }
    }
  }
  runTest('2. Fractional + complete + equal K per pair', prefs);
}

// Test 3: Binary, complete graph, UNEQUAL K per pair
{
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const K = 5 + Math.floor(rng() * 40); // 5-44 per pair
      for (let rep = 0; rep < K; rep++) {
        prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
      }
    }
  }
  runTest('3. Binary + complete + UNEQUAL K per pair', prefs);
}

// Test 4: Binary, INCOMPLETE graph (random selection)
{
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let v = 0; v < 200; v++) {
    const i = Math.floor(rng() * N);
    let j = Math.floor(rng() * (N - 1));
    if (j >= i) j++;
    prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
  }
  runTest('4. Binary + INCOMPLETE (random selection)', prefs);
}

// Test 5: Binary, complete, equal K, but items have UNEQUAL total observations
// (This happens naturally with unequal K per pair, but let's make it extreme)
{
  const prefs: { target: string; source: string; value: number }[] = [];
  // Item 0 compared 50 times to each neighbor, others compared 5 times each
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const K = (i === 0 || j === 0) ? 50 : 5;
      for (let rep = 0; rep < K; rep++) {
        prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
      }
    }
  }
  runTest('5. Binary + complete + UNEQUAL item obs (item-0 oversampled)', prefs);
}

// Test 6: Likert (5-point quantized), complete, equal K
{
  const K = 20;
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      for (let rep = 0; rep < K; rep++) {
        const raw = drawScore(trueWeights[i], trueWeights[j], 0.15, rng);
        const likert = Math.round(raw * 4) / 4;
        prefs.push({ target: itemIds[i], source: itemIds[j], value: likert });
      }
    }
  }
  runTest('6. Likert 5pt + complete + equal K per pair', prefs);
}

// Test 7: Noiseless BT probabilities (score = exact p_ij), equal K
{
  const K = 1;
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      for (let rep = 0; rep < K; rep++) {
        const p = trueWeights[i] / (trueWeights[i] + trueWeights[j]);
        prefs.push({ target: itemIds[i], source: itemIds[j], value: p });
      }
    }
  }
  runTest('7. Exact BT probabilities (noiseless fractional), K=1', prefs);
}
