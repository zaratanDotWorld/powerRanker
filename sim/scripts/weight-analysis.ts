/**
 * Diagnostic: compare true vs spectral vs MLE weight vectors
 * to understand where spectral loses cardinal information.
 */
import { PowerRanker, pairKey } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';
import { mulberry32, generateGroundTruth, drawScore } from '../utils.js';
import { l2Error } from '../metrics.js';

// --- Main analysis ---
const alpha = parseFloat(process.argv[2] ?? '1.0');
const items = parseInt(process.argv[3] ?? '10');
const vpi = parseInt(process.argv[4] ?? '12');
const scoring = process.argv[5] ?? 'likert';
const seed = 42;
const rng = mulberry32(seed);
const continuous = scoring === 'continuous';

const trueWeights = generateGroundTruth(items, alpha);
const itemIds = Array.from({ length: items }, (_, i) => `item-${i}`);

// Collect votes via random selection
const allPrefs: { target: string; source: string; value: number }[] = [];
const totalVotes = items * vpi;
for (let v = 0; v < totalVotes; v++) {
  const i = Math.floor(rng() * items);
  let j = Math.floor(rng() * (items - 1));
  if (j >= i) j++;
  const score = drawScore(trueWeights[i], trueWeights[j], 0.15, rng, continuous ? undefined : 5);
  allPrefs.push({ target: itemIds[i], source: itemIds[j], value: score });
}

// Spectral with k=C/N
const k = 1 / items;
const ranker = new PowerRanker({ items: new Set(itemIds), options: { k, flow: 'bidirectional' } });
for (const p of allPrefs) ranker.addPreference(p);
const spectralWeights = ranker.run();

// Spectral with k=0
const ranker0 = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
for (const p of allPrefs) ranker0.addPreference(p);
const spectral0Weights = ranker0.run();

// MLE
const mleWeights = bradleyTerryMLE(itemIds, allPrefs);

// Print comparison sorted by true weight (descending)
const indices = Array.from({ length: items }, (_, i) => i).sort((a, b) => trueWeights[b] - trueWeights[a]);

console.log(`\nα=${alpha}, N=${items}, vpi=${vpi}, scoring=${scoring}, random selection`);
console.log(`${'item'.padEnd(10)} ${'true'.padStart(8)}  ${'spec(k)'.padStart(8)}  ${'spec(0)'.padStart(8)}  ${'MLE'.padStart(8)}  ${'s(k)/t'.padStart(8)}  ${'s(0)/t'.padStart(8)}  ${'mle/t'.padStart(8)}`);
for (const i of indices) {
  const t = trueWeights[i];
  const sk = spectralWeights.get(itemIds[i])!;
  const s0 = spectral0Weights.get(itemIds[i])!;
  const m = mleWeights.get(itemIds[i])!;
  console.log(
    `${itemIds[i].padEnd(10)} ${t.toFixed(5).padStart(8)}  ${sk.toFixed(5).padStart(8)}  ${s0.toFixed(5).padStart(8)}  ${m.toFixed(5).padStart(8)}  ${(sk/t).toFixed(3).padStart(8)}  ${(s0/t).toFixed(3).padStart(8)}  ${(m/t).toFixed(3).padStart(8)}`
  );
}

// Spread
const specKArr = itemIds.map(id => spectralWeights.get(id)!);
const spec0Arr = itemIds.map(id => spectral0Weights.get(id)!);
const mleArr = itemIds.map(id => mleWeights.get(id)!);
const spread = (a: number[]) => Math.max(...a) / Math.min(...a);
console.log(`\nSpread — true: ${spread(trueWeights).toFixed(1)}x  spec(k): ${spread(specKArr).toFixed(1)}x  spec(0): ${spread(spec0Arr).toFixed(1)}x  MLE: ${spread(mleArr).toFixed(1)}x`);

// L2
console.log(`L2 — spec(k): ${l2Error(trueWeights, specKArr).toFixed(5)}  spec(0): ${l2Error(trueWeights, spec0Arr).toFixed(5)}  MLE: ${l2Error(trueWeights, mleArr).toFixed(5)}`);

// Pearson (linear correlation of weights)
const pearson = (a: number[], b: number[]) => {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
};
console.log(`Pearson — spec(k): ${pearson(trueWeights, specKArr).toFixed(4)}  spec(0): ${pearson(trueWeights, spec0Arr).toFixed(4)}  MLE: ${pearson(trueWeights, mleArr).toFixed(4)}`);

// Log-space analysis: are the ratios between items preserved?
console.log(`\nLog-space ratios (log(w_i/w_0) for each item, relative to smallest):`);
const minIdx = indices[indices.length - 1];
console.log(`${'item'.padEnd(10)} ${'true'.padStart(8)}  ${'spec(k)'.padStart(8)}  ${'spec(0)'.padStart(8)}  ${'MLE'.padStart(8)}`);
for (const i of indices) {
  const t = Math.log(trueWeights[i] / trueWeights[minIdx]);
  const sk = Math.log(specKArr[i] / specKArr[minIdx]);
  const s0 = Math.log(spec0Arr[i] / spec0Arr[minIdx]);
  const m = Math.log(mleArr[i] / mleArr[minIdx]);
  console.log(
    `${itemIds[i].padEnd(10)} ${t.toFixed(3).padStart(8)}  ${sk.toFixed(3).padStart(8)}  ${s0.toFixed(3).padStart(8)}  ${m.toFixed(3).padStart(8)}`
  );
}

// Observation counts per item
const obsCounts: Record<string, number> = {};
for (const id of itemIds) obsCounts[id] = 0;
for (const p of allPrefs) {
  obsCounts[p.target]++;
  obsCounts[p.source]++;
}
console.log(`\nObservation counts and spectral error:`);
console.log(`${'item'.padEnd(10)} ${'obs'.padStart(5)}  ${'|spec_err|'.padStart(10)}  ${'|mle_err|'.padStart(10)}`);
for (const i of indices) {
  const specErr = Math.abs(specKArr[i] - trueWeights[i]);
  const mleErr = Math.abs(mleArr[i] - trueWeights[i]);
  console.log(
    `${itemIds[i].padEnd(10)} ${String(obsCounts[itemIds[i]]).padStart(5)}  ${specErr.toFixed(5).padStart(10)}  ${mleErr.toFixed(5).padStart(10)}`
  );
}
