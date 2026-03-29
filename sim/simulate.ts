/**
 * Simulate a full judging process and evaluate weight recovery.
 *
 * Usage:
 *   npx tsx sim/simulate.ts [options]
 *
 * Options:
 *   --items <n>       Number of items (default: 20)
 *   --alpha <a>       Power-law exponent (default: 1.5)
 *   --judges <j>      Number of judges (default: 10)
 *   --sessions <s>    Sessions per judge (default: 3)
 *   --ssize <sz>      Votes per session (default: 10)
 *   --trials <t>      Number of simulation trials (default: 50)
 *   --prior <c>       Prior strength constant (default: 1)
 *   --r <r>           Active select power transform (default: 0.9)
 *   --select <terms>  Active select terms (default: coverage,proximity,position)
 *   --noise <n>       Vote noise amplitude (default: 0.3)
 *   --continuous      Use continuous BT scores instead of Likert
 *   --flow <mode>     Flow mode: bidirectional or unidirectional (default: bidirectional)
 *   --strategy <s>    Pair selection: random or activeSelect (default: activeSelect)
 *   --seed <n>        Random seed for reproducibility
 *   --output <fmt>    Output format: console, json, csv (default: console)
 */

import { PowerRanker, pairKey } from '../src/index.js';
import type { ActiveImpactTerm, FlowMode } from '../src/index.js';
import type { SimConfig, SessionSnapshot, TrialResult, AggregatedResult } from './types.js';
import * as metrics from './metrics.js';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): SimConfig {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      opts[key] = args[i + 1] ?? 'true';
      i++;
    }
  }
  return {
    items: parseInt(opts['items'] ?? '20'),
    alpha: parseFloat(opts['alpha'] ?? '1.5'),
    judges: parseInt(opts['judges'] ?? '10'),
    sessions: parseInt(opts['sessions'] ?? '3'),
    sessionSize: parseInt(opts['ssize'] ?? '10'),
    trials: parseInt(opts['trials'] ?? '50'),
    priorC: parseFloat(opts['prior'] ?? '1'),
    r: parseFloat(opts['r'] ?? '0.9'),
    terms: (opts['select'] ?? 'coverage,proximity,position').split(',') as ActiveImpactTerm[],
    noise: parseFloat(opts['noise'] ?? '0.3'),
    scoring: 'continuous' in opts ? 'continuous' : 'likert',
    flow: (opts['flow'] ?? 'bidirectional') as FlowMode,
    strategy: (opts['strategy'] ?? 'activeSelect') as 'random' | 'activeSelect',
    seed: opts['seed'] !== undefined ? parseInt(opts['seed']) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Weight generation
// ---------------------------------------------------------------------------

function generateTrueWeights(n: number, alpha: number): number[] {
  if (n <= 0) throw new Error('Cannot generate weights for 0 items');
  const raw = Array.from({ length: n }, (_, i) => Math.pow((i + 1) / n, alpha));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

// ---------------------------------------------------------------------------
// Vote simulation
// ---------------------------------------------------------------------------

function drawScore(
  wA: number, wB: number, noise: number, continuous: boolean, rng: () => number
): number {
  const pA = wA / (wA + wB);
  const noisy = pA + (rng() - 0.5) * noise;
  const clamped = Math.max(0, Math.min(1, noisy));
  return continuous ? clamped : Math.round(clamped * 4) / 4;
}

// ---------------------------------------------------------------------------
// Pair selection strategies
// ---------------------------------------------------------------------------

function randomSelectPairs(
  itemIds: string[], num: number, exclude: Set<string>, rng: () => number
): { alpha: string; beta: string }[] {
  const candidates: { alpha: string; beta: string }[] = [];
  for (let i = 0; i < itemIds.length; i++) {
    for (let j = i + 1; j < itemIds.length; j++) {
      const key = pairKey(itemIds[i], itemIds[j]);
      if (!exclude.has(key)) {
        candidates.push({ alpha: itemIds[i], beta: itemIds[j] });
      }
    }
  }

  // Fisher-Yates shuffle with seeded RNG
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, num);
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

function measureAccuracy(
  trueWeights: number[],
  itemIds: string[],
  ranker: PowerRanker,
  allPrefs: Set<string>,
  totalPossiblePairs: number,
): Omit<SessionSnapshot, 'session' | 'vpi' | 'totalVotes'> {
  const weights = ranker.run();
  const recovered = itemIds.map((id) => weights.get(id)!);

  return {
    spearman: metrics.spearman(trueWeights, recovered),
    kendall: metrics.kendallTau(trueWeights, recovered),
    l2: metrics.weightError(trueWeights, recovered),
    pearson: metrics.pearson(trueWeights, recovered),
    spreadRatio: metrics.spreadRatio(trueWeights, recovered),
    pairCoverage: allPrefs.size / totalPossiblePairs,
  };
}

// ---------------------------------------------------------------------------
// Simulation engine
// ---------------------------------------------------------------------------

export function runTrial(config: SimConfig, trialSeed: number): TrialResult {
  const rng = mulberry32(trialSeed);

  const trueWeights = generateTrueWeights(config.items, config.alpha);
  const itemIds = Array.from({ length: config.items }, (_, i) => `item-${i}`);
  const totalPossiblePairs = (config.items * (config.items - 1)) / 2;

  const allPrefs: { target: string; source: string; value: number }[] = [];
  const pairSet = new Set<string>();
  const judgeExclusions = new Map<string, Set<string>>();
  const snapshots: SessionSnapshot[] = [];

  let sessionCount = 0;

  for (let judge = 0; judge < config.judges; judge++) {
    const judgeId = `judge-${judge}`;
    if (!judgeExclusions.has(judgeId)) {
      judgeExclusions.set(judgeId, new Set());
    }
    const exclude = judgeExclusions.get(judgeId)!;

    for (let session = 0; session < config.sessions; session++) {
      sessionCount++;

      // Build ranker with current data
      const k = config.priorC / config.items;
      const ranker = new PowerRanker({
        items: new Set(itemIds),
        options: { k, flow: config.flow },
      });
      if (allPrefs.length > 0) {
        ranker.addPreferences(allPrefs);
      }

      // Select pairs
      let pairs: { alpha: string; beta: string }[];
      if (config.strategy === 'random') {
        pairs = randomSelectPairs(itemIds, config.sessionSize, exclude, rng);
      } else {
        pairs = ranker.activeSelect({
          num: config.sessionSize,
          exclude,
          terms: config.terms,
          r: config.r,
          rng,
        });
      }

      // Simulate votes
      for (const pair of pairs) {
        const iA = parseInt(pair.alpha.split('-')[1]);
        const iB = parseInt(pair.beta.split('-')[1]);
        const score = drawScore(
          trueWeights[iA], trueWeights[iB],
          config.noise, config.scoring === 'continuous', rng,
        );

        allPrefs.push({ target: pair.alpha, source: pair.beta, value: score });
        pairSet.add(pairKey(pair.alpha, pair.beta));
        exclude.add(pairKey(pair.alpha, pair.beta));
      }

      // Measure at this session boundary
      const measRanker = new PowerRanker({
        items: new Set(itemIds),
        options: { k, flow: config.flow },
      });
      measRanker.addPreferences(allPrefs);

      const totalVotes = allPrefs.length;
      const vpi = totalVotes / config.items;
      const acc = measureAccuracy(trueWeights, itemIds, measRanker, pairSet, totalPossiblePairs);

      snapshots.push({
        session: sessionCount,
        vpi,
        totalVotes,
        ...acc,
      });
    }
  }

  return {
    snapshots,
    uniquePairs: pairSet.size,
    totalPairs: totalPossiblePairs,
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function aggregateTrials(config: SimConfig, trials: TrialResult[]): AggregatedResult {
  const totalSessions = config.judges * config.sessions;

  // Average convergence curves across trials
  const convergenceCurve: SessionSnapshot[] = [];
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

  // Final-state stats
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
// Output formatters
// ---------------------------------------------------------------------------

function outputConsole(result: AggregatedResult) {
  const { config, final, convergenceCurve } = result;
  const totalVotes = config.judges * config.sessions * config.sessionSize;
  const vpi = totalVotes / config.items;
  const trueWeights = generateTrueWeights(config.items, config.alpha);
  const trueSpread = Math.max(...trueWeights) / Math.min(...trueWeights);

  console.log('=== Ranker Simulation ===');
  console.log(`  Items: ${config.items}  Alpha: ${config.alpha}  True spread: ${trueSpread.toFixed(1)}x`);
  console.log(`  Judges: ${config.judges}  Sessions: ${config.sessions}  Session size: ${config.sessionSize}  Total votes: ${totalVotes}`);
  console.log(`  Votes per item (avg): ${vpi.toFixed(1)}`);
  console.log(`  Prior: C=${config.priorC}  k=${(config.priorC / config.items).toFixed(4)}`);
  console.log(`  Strategy: ${config.strategy}  Flow: ${config.flow}`);
  if (config.strategy === 'activeSelect') {
    console.log(`  Active select: ${config.terms.join(', ')}  r=${config.r}`);
  }
  console.log(`  Noise: ${config.noise}  Scoring: ${config.scoring}`);
  console.log(`  Trials: ${config.trials}  Seed: ${config.seed ?? 'random'}\n`);

  // Convergence curve
  console.log('  Convergence:');
  console.log('  session  vpi     spearman  kendall   L2        spread    coverage');
  for (const snap of convergenceCurve) {
    console.log(
      `  ${String(snap.session).padStart(7)}  ` +
      `${snap.vpi.toFixed(1).padStart(5)}  ` +
      `${snap.spearman.toFixed(3).padStart(8)}  ` +
      `${snap.kendall.toFixed(3).padStart(7)}  ` +
      `${snap.l2.toFixed(4).padStart(8)}  ` +
      `${snap.spreadRatio.toFixed(2).padStart(8)}x ` +
      `${(snap.pairCoverage * 100).toFixed(0).padStart(6)}%`
    );
  }

  console.log('\n  Final (mean):');
  console.log(
    `  pearson=${final.pearson.mean.toFixed(3)}  ` +
    `spearman=${final.spearman.mean.toFixed(3)}  ` +
    `kendall=${final.kendall.mean.toFixed(3)}  ` +
    `L2=${final.l2.mean.toFixed(4)}  ` +
    `spread=${final.spreadRatio.mean.toFixed(2)}x  ` +
    `coverage=${(final.pairCoverage.mean * 100).toFixed(0)}%`
  );
}

function outputJson(result: AggregatedResult) {
  console.log(JSON.stringify(result));
}

function outputCsv(result: AggregatedResult) {
  const { config, convergenceCurve } = result;
  const header = 'items,alpha,noise,scoring,strategy,flow,priorC,r,session,vpi,spearman,kendall,l2,pearson,spreadRatio,pairCoverage';
  console.log(header);
  for (const snap of convergenceCurve) {
    console.log(
      `${config.items},${config.alpha},${config.noise},${config.scoring},` +
      `${config.strategy},${config.flow},${config.priorC},${config.r},` +
      `${snap.session},${snap.vpi.toFixed(2)},${snap.spearman.toFixed(4)},` +
      `${snap.kendall.toFixed(4)},${snap.l2.toFixed(6)},${snap.pearson.toFixed(4)},` +
      `${snap.spreadRatio.toFixed(4)},${snap.pairCoverage.toFixed(4)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Main (only runs when executed directly, not when imported)
// ---------------------------------------------------------------------------

const isMain = process.argv[1]?.endsWith('simulate.ts') || process.argv[1]?.endsWith('simulate.js');

if (isMain) {
  const config = parseArgs();
  const outputFormat = process.argv.includes('--output')
    ? process.argv[process.argv.indexOf('--output') + 1]
    : 'console';

  const baseSeed = config.seed ?? Math.floor(Math.random() * 2 ** 32);

  const trials: TrialResult[] = [];
  for (let t = 0; t < config.trials; t++) {
    trials.push(runTrial(config, baseSeed + t));
  }

  const result = aggregateTrials(config, trials);

  switch (outputFormat) {
    case 'json': outputJson(result); break;
    case 'csv': outputCsv(result); break;
    default: outputConsole(result); break;
  }
}
