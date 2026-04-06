import { PowerRanker } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';
import { mulberry32, generateGroundTruth, drawBinary } from '../utils.js';
import { l2Error } from '../metrics.js';

const N = 10;
const trueWeights = generateGroundTruth(N, 1.0);
const itemIds = Array.from({ length: N }, (_, i) => `item-${i}`);
const nTrials = 300;

function avgTest(
  label: string,
  genPrefs: (rng: () => number) => { target: string; source: string; value: number }[],
) {
  let sumS = 0, sumM = 0;
  for (let trial = 0; trial < nTrials; trial++) {
    const rng = mulberry32(trial);
    const prefs = genPrefs(rng);
    const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
    for (const p of prefs) ranker.addPreference(p);
    const spec = itemIds.map(id => ranker.run().get(id)!);
    const mle = itemIds.map(id => bradleyTerryMLE(itemIds, prefs, 2000, 1e-12).get(id)!);
    const specL2 = l2Error(trueWeights, spec);
    const mleL2 = l2Error(trueWeights, mle);
    if (!isNaN(specL2) && !isNaN(mleL2) && isFinite(specL2) && isFinite(mleL2)) {
      sumS += specL2;
      sumM += mleL2;
    }
  }
  console.log(`${label}`);
  console.log(`  L2_spec=${(sumS/nTrials).toFixed(5)}  L2_mle=${(sumM/nTrials).toFixed(5)}  ratio=${(sumS/sumM).toFixed(2)}x`);
}

console.log('=== Transitivity test: graphs that REQUIRE transitive inference ===\n');

// CHAIN graph: only adjacent items compared (0-1, 1-2, 2-3, ..., 8-9)
// Maximum transitivity needed: to compare items 0 and 9, must chain through all intermediates
avgTest('1. CHAIN graph (adjacent only), K=20 per edge', (rng) => {
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N - 1; i++) {
    for (let rep = 0; rep < 20; rep++) {
      prefs.push({ target: itemIds[i], source: itemIds[i+1], value: drawBinary(trueWeights[i], trueWeights[i+1], rng) });
    }
  }
  return prefs;
});

// CHAIN graph with more data per edge
avgTest('2. CHAIN graph, K=100 per edge', (rng) => {
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N - 1; i++) {
    for (let rep = 0; rep < 100; rep++) {
      prefs.push({ target: itemIds[i], source: itemIds[i+1], value: drawBinary(trueWeights[i], trueWeights[i+1], rng) });
    }
  }
  return prefs;
});

// STAR graph: item 0 compared to everyone, no other comparisons
// Item 0 acts as a "bridge" — all other items inferred through item 0
avgTest('3. STAR graph (item-0 vs all), K=20 per edge', (rng) => {
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let j = 1; j < N; j++) {
    for (let rep = 0; rep < 20; rep++) {
      prefs.push({ target: itemIds[0], source: itemIds[j], value: drawBinary(trueWeights[0], trueWeights[j], rng) });
    }
  }
  return prefs;
});

// SPARSE RANDOM: 50% of pairs observed, K=10 each
avgTest('4. Sparse random (50% pairs), K=10 each', (rng) => {
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (rng() < 0.5) continue; // skip 50% of pairs
      for (let rep = 0; rep < 10; rep++) {
        prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
      }
    }
  }
  return prefs;
});

// COMPLETE graph for reference
avgTest('5. Complete graph, K=20 per pair (reference)', (rng) => {
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      for (let rep = 0; rep < 20; rep++) {
        prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
      }
    }
  }
  return prefs;
});

// TWO CLIQUES connected by a single bridge edge
// Items 0-4 fully connected, items 5-9 fully connected, only edge: 4-5
avgTest('6. Two cliques + bridge (4-5), K=20 per edge', (rng) => {
  const prefs: { target: string; source: string; value: number }[] = [];
  // Clique 1: items 0-4
  for (let i = 0; i < 5; i++)
    for (let j = i + 1; j < 5; j++)
      for (let rep = 0; rep < 20; rep++)
        prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
  // Clique 2: items 5-9
  for (let i = 5; i < 10; i++)
    for (let j = i + 1; j < 10; j++)
      for (let rep = 0; rep < 20; rep++)
        prefs.push({ target: itemIds[i], source: itemIds[j], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
  // Bridge: 4-5
  for (let rep = 0; rep < 20; rep++)
    prefs.push({ target: itemIds[4], source: itemIds[5], value: drawBinary(trueWeights[4], trueWeights[5], rng) });
  return prefs;
});

console.log('\n=== Star graph scaling ===');
for (const K of [5, 10, 20, 50, 100, 200]) {
  let sumS = 0, sumM = 0;
  for (let trial = 0; trial < nTrials; trial++) {
    const rng = mulberry32(trial);
    const prefs: { target: string; source: string; value: number }[] = [];
    for (let j = 1; j < N; j++) {
      for (let rep = 0; rep < K; rep++) {
        prefs.push({ target: itemIds[0], source: itemIds[j], value: drawBinary(trueWeights[0], trueWeights[j], rng) });
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

console.log('\n=== Chain graph scaling ===');
for (const K of [5, 10, 20, 50, 100, 200]) {
  let sumS = 0, sumM = 0;
  for (let trial = 0; trial < nTrials; trial++) {
    const rng = mulberry32(trial);
    const prefs: { target: string; source: string; value: number }[] = [];
    for (let i = 0; i < N - 1; i++) {
      for (let rep = 0; rep < K; rep++) {
        prefs.push({ target: itemIds[i], source: itemIds[i+1], value: drawBinary(trueWeights[i], trueWeights[j], rng) });
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
