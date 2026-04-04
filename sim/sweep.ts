/**
 * Parameter sweep runner.
 *
 * Usage:
 *   npx tsx sim/sweep.ts --config sweep.json
 *   npx tsx sim/sweep.ts  (uses built-in default config)
 *
 * Output: JSONL to stdout (one line per config), progress to stderr.
 */

import { readFileSync } from 'fs';
import { runTrial } from './simulate.js';
import * as metrics from './metrics.js';
import type { SimConfig, SweepConfig, TrialResult, AggregatedResult } from './types.js';
import type { ActiveImpactTerm } from '../src/index.js';

// ---------------------------------------------------------------------------
// Default sweep configuration
// ---------------------------------------------------------------------------

const DEFAULT_SWEEP: SweepConfig = {
  items: [10, 20, 30],
  alpha: [0.5, 1.0, 1.5],
  sigma: [0.5, 1.0, 2.0],
  scoring: ['likert'],
  strategies: ['random', 'activeSelect'],
  flow: ['bidirectional'],
  priorC: [1],
  r: [0.9],
  judges: [10],
  sessions: [3, 6, 9],
  sessionSize: [10],
  trials: 50,
  seed: 42,
};

// ---------------------------------------------------------------------------
// Cartesian product
// ---------------------------------------------------------------------------

function cartesian<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((val) => [...combo, val])),
    [[]]
  );
}

function generateConfigs(sweep: SweepConfig): SimConfig[] {
  const grid = cartesian([
    sweep.items,
    sweep.alpha,
    sweep.sigma,
    sweep.scoring,
    sweep.strategies,
    sweep.flow,
    sweep.priorC,
    sweep.r,
    sweep.judges,
    sweep.sessions,
    sweep.sessionSize,
  ]);

  return grid.map((row) => ({
    items: row[0] as number,
    alpha: row[1] as number,
    sigma: row[2] as number,
    scoring: row[3] as 'likert' | 'continuous',
    strategy: row[4] as 'random' | 'activeSelect',
    flow: row[5] as 'bidirectional' | 'unidirectional',
    priorC: row[6] as number,
    r: row[7] as number,
    judges: row[8] as number,
    sessions: row[9] as number,
    sessionSize: row[10] as number,
    trials: sweep.trials,
    terms: ['coverage', 'proximity', 'position'] as ActiveImpactTerm[],
    seed: sweep.seed,
  }));
}

// ---------------------------------------------------------------------------
// Aggregation (same logic as simulate.ts)
// ---------------------------------------------------------------------------

function aggregateTrials(config: SimConfig, trials: TrialResult[]): AggregatedResult {
  const totalSessions = config.judges * config.sessions;

  const convergenceCurve = [];
  for (let s = 0; s < totalSessions; s++) {
    const snaps = trials.map((t) => t.snapshots[s]).filter(Boolean);
    if (snaps.length === 0) continue;

    convergenceCurve.push({
      session: snaps[0].session,
      vpi: metrics.avg(snaps.map((s) => s.vpi)),
      totalVotes: Math.round(metrics.avg(snaps.map((s) => s.totalVotes))),
      spearman: metrics.avg(snaps.map((s) => s.spearman)),
      kendall: metrics.avg(snaps.map((s) => s.kendall)),
      l2: metrics.avg(snaps.map((s) => s.l2)),
      pearson: metrics.avg(snaps.map((s) => s.pearson)),
      spreadRatio: metrics.avg(snaps.map((s) => s.spreadRatio)),
      pairCoverage: metrics.avg(snaps.map((s) => s.pairCoverage)),
    });
  }

  const finals = trials.map((t) => t.snapshots[t.snapshots.length - 1]);

  return {
    config,
    convergenceCurve,
    final: {
      pearson: { mean: metrics.avg(finals.map((f) => f.pearson)), median: metrics.median(finals.map((f) => f.pearson)) },
      spearman: { mean: metrics.avg(finals.map((f) => f.spearman)), median: metrics.median(finals.map((f) => f.spearman)) },
      kendall: { mean: metrics.avg(finals.map((f) => f.kendall)), median: metrics.median(finals.map((f) => f.kendall)) },
      l2: { mean: metrics.avg(finals.map((f) => f.l2)), median: metrics.median(finals.map((f) => f.l2)) },
      spreadRatio: { mean: metrics.avg(finals.map((f) => f.spreadRatio)), median: metrics.median(finals.map((f) => f.spreadRatio)) },
      pairCoverage: { mean: metrics.avg(finals.map((f) => f.pairCoverage)) },
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const configIdx = args.indexOf('--config');
let sweep: SweepConfig;

if (configIdx >= 0 && args[configIdx + 1]) {
  sweep = JSON.parse(readFileSync(args[configIdx + 1], 'utf-8'));
} else {
  sweep = DEFAULT_SWEEP;
}

const configs = generateConfigs(sweep);
const total = configs.length;

process.stderr.write(`Sweep: ${total} configs x ${sweep.trials} trials = ${total * sweep.trials} runs\n`);

for (let i = 0; i < configs.length; i++) {
  const config = configs[i];
  const baseSeed = config.seed ?? 42;

  const trials: TrialResult[] = [];
  for (let t = 0; t < config.trials; t++) {
    trials.push(runTrial(config, baseSeed + t));
  }

  const result = aggregateTrials(config, trials);

  // Output JSONL: one line per config with final metrics
  const line = {
    items: config.items,
    alpha: config.alpha,
    sigma: config.sigma,
    scoring: config.scoring,
    strategy: config.strategy,
    flow: config.flow,
    priorC: config.priorC,
    r: config.r,
    judges: config.judges,
    sessions: config.sessions,
    sessionSize: config.sessionSize,
    vpi: (config.judges * config.sessions * config.sessionSize) / config.items,
    ...result.final,
  };
  console.log(JSON.stringify(line));

  if ((i + 1) % 10 === 0 || i + 1 === total) {
    process.stderr.write(`  ${i + 1}/${total} configs complete\n`);
  }
}

process.stderr.write('Sweep complete.\n');
