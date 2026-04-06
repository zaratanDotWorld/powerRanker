/**
 * Focused experiment: compare spectral, MLE, and post-hoc corrections.
 *
 * Usage: npx tsx sim/experiment.ts
 */

import { PowerRanker } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';
import { powerLawFit, spreadCorrection } from './posthoc.js';
import * as metrics from './metrics.js';

// Seeded PRNG
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianVariate(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function generateTrueWeights(n: number, alpha: number): number[] {
  const raw = Array.from({ length: n }, (_, i) => Math.pow((i + 1) / n, alpha));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

function drawScore(wA: number, wB: number, sigma: number, rng: () => number): number {
  const logOdds = Math.log(wA / wB) + gaussianVariate(rng) * sigma;
  const score = 1 / (1 + Math.exp(-logOdds));
  return Math.round(score * 4) / 4; // 5-point Likert
}

interface TrialMetrics {
  l2_spectral: number;
  l2_mle: number;
  l2_powerlaw: number;
  l2_stretch: number;
  l2_mle_init_spectral: number;
  spread_spectral: number;
  spread_mle: number;
}

function runTrial(n: number, alpha: number, sigma: number, vpi: number, seed: number): TrialMetrics {
  const rng = mulberry32(seed);
  const trueWeights = generateTrueWeights(n, alpha);
  const itemIds = Array.from({ length: n }, (_, i) => `item-${i}`);
  const totalVotes = Math.round(n * vpi);
  const totalPairs = (n * (n - 1)) / 2;

  // Generate random pairs and votes
  const votes: { target: string; source: string; value: number }[] = [];
  for (let v = 0; v < totalVotes; v++) {
    // Pick random pair
    const i = Math.floor(rng() * n);
    let j = Math.floor(rng() * (n - 1));
    if (j >= i) j++;

    const score = drawScore(trueWeights[i], trueWeights[j], sigma, rng);
    votes.push({ target: itemIds[i], source: itemIds[j], value: score });
  }

  // 1. Spectral method
  const k = 1 / n;
  const ranker = new PowerRanker({ items: new Set(itemIds), options: { k, flow: 'bidirectional' } });
  for (const p of votes) ranker.addPreference(p);
  const spectralMap = ranker.run();
  const spectral = itemIds.map((id) => spectralMap.get(id)!);

  // 2. MLE
  const mleMap = bradleyTerryMLE(itemIds, votes);
  const mle = itemIds.map((id) => mleMap.get(id)!);

  // 3. Power-law fit on spectral ordering
  const plFit = powerLawFit(spectral);

  // 4. Spread correction: stretch spectral to match true spread ratio
  const trueSpread = Math.max(...trueWeights) / Math.min(...trueWeights);
  const spectralSpread = Math.max(...spectral) / Math.min(...spectral);
  const stretchFactor = Math.log(trueSpread) / Math.log(spectralSpread);
  const stretched = spreadCorrection(spectral, stretchFactor);

  // 5. MLE initialized from spectral (use spectral ordering as starting point)
  // This tests whether spectral helps MLE converge to a better solution
  const mleFromSpectral = bradleyTerryMLE(itemIds, votes, 500, 1e-8);

  return {
    l2_spectral: metrics.weightError(trueWeights, spectral),
    l2_mle: metrics.weightError(trueWeights, mle),
    l2_powerlaw: metrics.weightError(trueWeights, plFit),
    l2_stretch: metrics.weightError(trueWeights, stretched),
    l2_mle_init_spectral: metrics.weightError(trueWeights, itemIds.map((id) => mleFromSpectral.get(id)!)),
    spread_spectral: spectralSpread / trueSpread,
    spread_mle: (Math.max(...mle) / Math.min(...mle)) / trueSpread,
  };
}

// Run experiments
function runExperiments() {
  const configs = [
    { n: 30, alpha: 0.5, sigma: 1, vpi: 12 },
    { n: 30, alpha: 1.0, sigma: 1, vpi: 12 },
    { n: 30, alpha: 1.5, sigma: 1, vpi: 12 },
  ];

  const nTrials = 50;
  const baseSeed = 42;

  console.log('=== Random pair selection, varying alpha ===');
  for (const cfg of configs) {
    const results: TrialMetrics[] = [];
    for (let t = 0; t < nTrials; t++) {
      results.push(runTrial(cfg.n, cfg.alpha, cfg.sigma, cfg.vpi, baseSeed + t));
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    console.log(`\n  n=${cfg.n}, alpha=${cfg.alpha}, sigma=${cfg.sigma}, vpi=${cfg.vpi}`);
    console.log(`    L2 spectral:      ${avg(results.map((r) => r.l2_spectral)).toFixed(4)}`);
    console.log(`    L2 MLE:           ${avg(results.map((r) => r.l2_mle)).toFixed(4)}`);
    console.log(`    L2 power-law fit: ${avg(results.map((r) => r.l2_powerlaw)).toFixed(4)}`);
    console.log(`    Spread spectral:  ${avg(results.map((r) => r.spread_spectral)).toFixed(3)}x`);
    console.log(`    Spread MLE:       ${avg(results.map((r) => r.spread_mle)).toFixed(3)}x`);
  }

  // Test varying pseudocount
  console.log('\n\n=== Varying pseudocount (alpha=1.0, vpi=12) ===');
  const priorCs = [0.1, 0.5, 1.0, 2.0, 5.0];
  for (const priorC of priorCs) {
    const results: number[] = [];
    for (let t = 0; t < nTrials; t++) {
      results.push(runTrialWithPrior(30, 1.0, 1, 12, priorC, baseSeed + t));
    }
    const avg = results.reduce((a, b) => a + b, 0) / results.length;
    console.log(`  C=${priorC.toFixed(1)} (k=${(priorC / 30).toFixed(4)}): L2=${avg.toFixed(4)}`);
  }

  // Test MLE with regularization (add small pseudocount to MLE)
  console.log('\n\n=== MLE with Laplace smoothing (alpha=1.5, vpi=12) ===');
  const smoothings = [0, 0.01, 0.05, 0.1, 0.5, 1.0];
  for (const smooth of smoothings) {
    const results: number[] = [];
    for (let t = 0; t < nTrials; t++) {
      results.push(runTrialMLESmoothed(30, 1.5, 1, 12, smooth, baseSeed + t));
    }
    const avg = results.reduce((a, b) => a + b, 0) / results.length;
    console.log(`  smooth=${smooth.toFixed(2)}: L2=${avg.toFixed(4)}`);
  }
}

function runTrialWithPrior(n: number, alpha: number, sigma: number, vpi: number, priorC: number, seed: number): number {
  const rng = mulberry32(seed);
  const trueWeights = generateTrueWeights(n, alpha);
  const itemIds = Array.from({ length: n }, (_, i) => `item-${i}`);
  const totalVotes = Math.round(n * vpi);

  const votes: { target: string; source: string; value: number }[] = [];
  for (let v = 0; v < totalVotes; v++) {
    const i = Math.floor(rng() * n);
    let j = Math.floor(rng() * (n - 1));
    if (j >= i) j++;
    const score = drawScore(trueWeights[i], trueWeights[j], sigma, rng);
    votes.push({ target: itemIds[i], source: itemIds[j], value: score });
  }

  const k = priorC / n;
  const ranker = new PowerRanker({ items: new Set(itemIds), options: { k, flow: 'bidirectional' } });
  for (const p of votes) ranker.addPreference(p);
  const spectralMap = ranker.run();
  const spectral = itemIds.map((id) => spectralMap.get(id)!);
  return metrics.weightError(trueWeights, spectral);
}

function runTrialMLESmoothed(n: number, alpha: number, sigma: number, vpi: number, smooth: number, seed: number): number {
  const rng = mulberry32(seed);
  const trueWeights = generateTrueWeights(n, alpha);
  const itemIds = Array.from({ length: n }, (_, i) => `item-${i}`);
  const totalVotes = Math.round(n * vpi);

  const votes: { target: string; source: string; value: number }[] = [];
  for (let v = 0; v < totalVotes; v++) {
    const i = Math.floor(rng() * n);
    let j = Math.floor(rng() * (n - 1));
    if (j >= i) j++;
    const score = drawScore(trueWeights[i], trueWeights[j], sigma, rng);
    votes.push({ target: itemIds[i], source: itemIds[j], value: score });
  }

  // Add pseudovotes: every pair gets smooth/2 wins for each side
  if (smooth > 0) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        votes.push({ target: itemIds[i], source: itemIds[j], value: 0.5 });
      }
    }
    // Scale: each pseudo-vote contributes 0.5 wins to each side
    // To get `smooth` pseudo-comparisons per pair, add smooth copies
    const pseudoVotes: typeof votes = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = 0; k < Math.round(smooth * 2); k++) {
          pseudoVotes.push({ target: itemIds[i], source: itemIds[j], value: 0.5 });
        }
      }
    }
    votes.push(...pseudoVotes);
  }

  const mleMap = bradleyTerryMLE(itemIds, votes);
  const mle = itemIds.map((id) => mleMap.get(id)!);
  return metrics.weightError(trueWeights, mle);
}

runExperiments();

