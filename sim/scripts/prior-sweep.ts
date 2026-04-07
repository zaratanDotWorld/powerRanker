/**
 * Sweep the Bayesian prior (priorC) across conditions to find a good default.
 *
 * Varies: priorC, n (items), alpha (weight skew), vpi (votes per item), sigma (noise)
 * Measures: L2 error, Spearman correlation
 *
 * Usage: npx tsx sim/scripts/prior-sweep.ts
 */

import { PowerRanker } from '../../src/index.js';
import type { Normalization } from '../../src/index.js';
import { mulberry32, generateGroundTruth, drawScore } from '../utils.js';
import * as metrics from '../metrics.js';

function runTrial(
  n: number, alpha: number, sigma: number, vpi: number,
  priorC: number, seed: number, normalization: Normalization = 'flow',
): { l2: number; spearman: number } {
  const rng = mulberry32(seed);
  const trueWeights = generateGroundTruth(n, alpha);
  const itemIds = Array.from({ length: n }, (_, i) => `item-${i}`);
  const totalVotes = Math.round(n * vpi);

  const votes: { target: string; source: string; value: number }[] = [];
  for (let v = 0; v < totalVotes; v++) {
    const i = Math.floor(rng() * n);
    let j = Math.floor(rng() * (n - 1));
    if (j >= i) j++;
    const score = drawScore(trueWeights[i], trueWeights[j], sigma, rng, 5);
    votes.push({ target: itemIds[i], source: itemIds[j], value: score });
  }

  const k = priorC / n;
  const ranker = new PowerRanker({ items: new Set(itemIds), options: { k, flow: 'bidirectional', normalization } });
  for (const p of votes) ranker.addPreference(p);
  const resultMap = ranker.run();
  const recovered = itemIds.map((id) => resultMap.get(id)!);

  return {
    l2: metrics.l2Error(trueWeights, recovered),
    spearman: metrics.spearman(trueWeights, recovered),
  };
}

const nTrials = 100;
const baseSeed = 42;
const priorCs = [0, 0.01, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0];

function sweep(label: string, n: number, alpha: number, sigma: number, vpi: number, normalization: Normalization = 'flow') {
  console.log(`\n--- ${label} ---`);
  console.log(`  n=${n}, alpha=${alpha}, sigma=${sigma}, vpi=${vpi}, norm=${normalization}`);
  console.log(`  ${'priorC'.padStart(8)}  ${'k'.padStart(8)}  ${'L2'.padStart(8)}  ${'Spearman'.padStart(8)}`);

  let bestL2 = Infinity;
  let bestC = 0;

  for (const priorC of priorCs) {
    let sumL2 = 0;
    let sumSpearman = 0;
    for (let t = 0; t < nTrials; t++) {
      const result = runTrial(n, alpha, sigma, vpi, priorC, baseSeed + t, normalization);
      sumL2 += result.l2;
      sumSpearman += result.spearman;
    }
    const avgL2 = sumL2 / nTrials;
    const avgSpearman = sumSpearman / nTrials;
    const k = priorC / n;
    const marker = avgL2 < bestL2 ? ' *' : '';
    if (avgL2 < bestL2) { bestL2 = avgL2; bestC = priorC; }
    console.log(`  ${priorC.toFixed(2).padStart(8)}  ${k.toFixed(4).padStart(8)}  ${avgL2.toFixed(4).padStart(8)}  ${avgSpearman.toFixed(4).padStart(8)}${marker}`);
  }
  console.log(`  Best: priorC=${bestC} (k=${(bestC / n).toFixed(4)})`);
}

// ---- Flow normalization ----
console.log(`=== Prior Sweep — Flow Normalization (${nTrials} trials each) ===`);

sweep('Low skew',      30, 0.5, 1.0, 12, 'flow');
sweep('Medium skew',   30, 1.0, 1.0, 12, 'flow');
sweep('High skew',     30, 1.5, 1.0, 12, 'flow');

sweep('Small n',       10, 1.0, 1.0, 12, 'flow');
sweep('Large n',       60, 1.0, 1.0, 12, 'flow');

sweep('Sparse data',   30, 1.0, 1.0, 4, 'flow');
sweep('Dense data',    30, 1.0, 1.0, 30, 'flow');

sweep('Low noise',     30, 1.0, 0.5, 12, 'flow');
sweep('High noise',    30, 1.0, 2.0, 12, 'flow');

// ---- Rank centrality normalization ----
console.log(`\n\n=== Prior Sweep — Rank Centrality (${nTrials} trials each) ===`);

sweep('Low skew',      30, 0.5, 1.0, 12, 'rankCentrality');
sweep('Medium skew',   30, 1.0, 1.0, 12, 'rankCentrality');
sweep('High skew',     30, 1.5, 1.0, 12, 'rankCentrality');

sweep('Small n',       10, 1.0, 1.0, 12, 'rankCentrality');
sweep('Large n',       60, 1.0, 1.0, 12, 'rankCentrality');

sweep('Sparse data',   30, 1.0, 1.0, 4, 'rankCentrality');
sweep('Dense data',    30, 1.0, 1.0, 30, 'rankCentrality');

sweep('Low noise',     30, 1.0, 0.5, 12, 'rankCentrality');
sweep('High noise',    30, 1.0, 2.0, 12, 'rankCentrality');
