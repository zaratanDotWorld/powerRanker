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
 *   --select <terms>  Active select terms (default: coverage,proximity)
 *   --sigma <s>       Logit-normal noise std dev (default: 1)
 *   --continuous      Use continuous BT scores instead of Likert
 *   --flow <mode>     Flow mode: bidirectional or unidirectional (default: bidirectional)
 *   --strategy <s>    Pair selection: random or activeSelect (default: activeSelect)
 *   --prior-mode <m>  Prior mode: fixed, anneal, dataScaled (default: fixed)
 *   --seed <n>        Random seed for reproducibility
 *   --output <fmt>    Output format: console, json, csv (default: console)
 */

import { PowerRanker, pairKey } from '../src/index.js';
import type { ActiveImpactTerm, FlowMode } from '../src/index.js';
import type { SimConfig, SessionSnapshot, TrialResult, AggregatedResult, PriorMode } from './types.js';
import * as metrics from './metrics.js';
import { bradleyTerryMLE, cramerRaoBound } from './mle.js';

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
    terms: (opts['select'] ?? 'coverage,proximity').split(',') as ActiveImpactTerm[],
    sigma: parseFloat(opts['sigma'] ?? '1'),
    scoring: (opts['scoring'] === 'continuous' || 'continuous' in opts) ? 'continuous' : 'likert',
    likertPoints: opts['likert'] !== undefined ? parseInt(opts['likert']) : undefined,
    flow: (opts['flow'] ?? 'bidirectional') as FlowMode,
    strategy: (opts['strategy'] ?? 'activeSelect') as 'random' | 'activeSelect',
    priorMode: (opts['prior-mode'] ?? 'fixed') as PriorMode,
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
// Vote simulation (logit-normal noise model)
// ---------------------------------------------------------------------------

function gaussianVariate(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Logit-normal vote model: computes true log-odds log(wA/wB), adds Gaussian
// noise to draw from N(log(wA/wB), σ²), then applies sigmoid to map back to
// (0, 1). Equivalent to drawing the BT probability with noisy strength estimates.
function drawScore(
  wA: number, wB: number, sigma: number, continuous: boolean, rng: () => number, likertPoints: number = 5
): number {
  const logOdds = Math.log(wA / wB) + gaussianVariate(rng) * sigma;
  const score = 1 / (1 + Math.exp(-logOdds));
  if (continuous) return score;
  const bins = likertPoints - 1;
  return Math.round(score * bins) / bins;
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
  allPairSet: Set<string>,
  totalPossiblePairs: number,
  allVotes: { target: string; source: string; value: number }[],
  sigma: number,
): Omit<SessionSnapshot, 'session' | 'vpi' | 'totalVotes'> {
  const weights = ranker.run();
  const recovered = itemIds.map((id) => weights.get(id)!);

  // MLE Bradley-Terry
  const mleWeights = bradleyTerryMLE(itemIds, allVotes);
  const mleRecovered = itemIds.map((id) => mleWeights.get(id)!);
  const l2_mle = metrics.weightError(trueWeights, mleRecovered);

  // Cramér-Rao bound
  const l2_cr = cramerRaoBound(trueWeights, allVotes, itemIds, sigma);

  return {
    spearman: metrics.spearman(trueWeights, recovered),
    rmse: metrics.rmse(trueWeights, recovered),
    l1: metrics.l1Error(trueWeights, recovered),
    l2: metrics.weightError(trueWeights, recovered),
    l2_mle,
    l2_cr: isNaN(l2_cr) ? undefined : l2_cr,
    pairCoverage: allPairSet.size / totalPossiblePairs,
  };
}

// ---------------------------------------------------------------------------
// Adaptive prior
// ---------------------------------------------------------------------------

function computeK(
  config: SimConfig,
  allPrefs: { target: string; source: string; value: number }[],
): number {
  const N = config.items;
  const baseK = config.priorC / N;

  if (config.priorMode === 'fixed') return baseK;

  // anneal: prior fades as 1/sqrt(1 + vpi).
  // At vpi=0, k=baseK. At vpi=12, k≈baseK/3.6.
  const totalVotes = allPrefs.length;
  if (totalVotes === 0) return baseK;
  const vpi = totalVotes / N;
  return baseK / Math.sqrt(1 + vpi);
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
      const k = computeK(config, allPrefs);
      const ranker = new PowerRanker({
        items: new Set(itemIds),
        options: { k, flow: config.flow },
      });
      if (allPrefs.length > 0) {
        for (const p of allPrefs) ranker.addPreference(p);
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
          config.sigma, config.scoring === 'continuous', rng, config.likertPoints,
        );

        allPrefs.push({ target: pair.alpha, source: pair.beta, value: score });
        pairSet.add(pairKey(pair.alpha, pair.beta));
        exclude.add(pairKey(pair.alpha, pair.beta));
      }

      // Measure at this session boundary
      const measK = computeK(config, allPrefs);
      const measRanker = new PowerRanker({
        items: new Set(itemIds),
        options: { k: measK, flow: config.flow },
      });
      for (const p of allPrefs) measRanker.addPreference(p);

      const totalVotes = allPrefs.length;
      const vpi = totalVotes / config.items;
      const acc = measureAccuracy(trueWeights, itemIds, measRanker, pairSet, totalPossiblePairs, allPrefs, config.sigma);

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

    const mleVals = snaps.map((s) => s.l2_mle).filter((v): v is number => v !== undefined);
    const crVals = snaps.map((s) => s.l2_cr).filter((v): v is number => v !== undefined);

    convergenceCurve.push({
      session: snaps[0].session,
      vpi: metrics.avg(snaps.map((s) => s.vpi)),
      totalVotes: Math.round(metrics.avg(snaps.map((s) => s.totalVotes))),
      spearman: metrics.avg(snaps.map((s) => s.spearman)),
      rmse: metrics.avg(snaps.map((s) => s.rmse)),
      l1: metrics.avg(snaps.map((s) => s.l1)),
      l2: metrics.avg(snaps.map((s) => s.l2)),
      l2_mle: mleVals.length > 0 ? metrics.avg(mleVals) : undefined,
      l2_cr: crVals.length > 0 ? metrics.avg(crVals) : undefined,
      pairCoverage: metrics.avg(snaps.map((s) => s.pairCoverage)),
    });
  }

  // Final-state stats
  const finals = trials.map((t) => t.snapshots[t.snapshots.length - 1]);
  const finalMle = finals.map((f) => f.l2_mle).filter((v): v is number => v !== undefined);
  const finalCr = finals.map((f) => f.l2_cr).filter((v): v is number => v !== undefined);

  return {
    config,
    convergenceCurve,
    final: {
      spearman: { mean: metrics.avg(finals.map((f) => f.spearman)), median: metrics.median(finals.map((f) => f.spearman)) },
      rmse: { mean: metrics.avg(finals.map((f) => f.rmse)), median: metrics.median(finals.map((f) => f.rmse)) },
      l1: { mean: metrics.avg(finals.map((f) => f.l1)), median: metrics.median(finals.map((f) => f.l1)) },
      l2: { mean: metrics.avg(finals.map((f) => f.l2)), median: metrics.median(finals.map((f) => f.l2)) },
      l2_mle: finalMle.length > 0 ? { mean: metrics.avg(finalMle), median: metrics.median(finalMle) } : undefined,
      l2_cr: finalCr.length > 0 ? { mean: metrics.avg(finalCr) } : undefined,
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
  console.log(`  Prior: C=${config.priorC}  k=${(config.priorC / config.items).toFixed(4)}  mode=${config.priorMode}`);
  console.log(`  Strategy: ${config.strategy}  Flow: ${config.flow}`);
  if (config.strategy === 'activeSelect') {
    console.log(`  Active select: ${config.terms.join(', ')}  r=${config.r}`);
  }
  console.log(`  Sigma: ${config.sigma}  Scoring: ${config.scoring}`);
  console.log(`  Trials: ${config.trials}  Seed: ${config.seed ?? 'random'}\n`);

  // Convergence curve
  console.log('  Convergence:');
  console.log('  session  vpi     spearman  RMSE      L1        L2        L2_mle    L2_cr     coverage');
  for (const snap of convergenceCurve) {
    console.log(
      `  ${String(snap.session).padStart(7)}  ` +
      `${snap.vpi.toFixed(1).padStart(5)}  ` +
      `${snap.spearman.toFixed(3).padStart(8)}  ` +
      `${snap.rmse.toFixed(5).padStart(8)}  ` +
      `${snap.l1.toFixed(4).padStart(8)}  ` +
      `${snap.l2.toFixed(4).padStart(8)}  ` +
      `${(snap.l2_mle?.toFixed(4) ?? '   N/A').padStart(8)}  ` +
      `${(snap.l2_cr?.toFixed(4) ?? '   N/A').padStart(8)}  ` +
      `${(snap.pairCoverage * 100).toFixed(0).padStart(6)}%`
    );
  }

  console.log('\n  Final (mean):');
  console.log(
    `  spearman=${final.spearman.mean.toFixed(3)}  ` +
    `RMSE=${final.rmse.mean.toFixed(5)}  ` +
    `L1=${final.l1.mean.toFixed(4)}  ` +
    `L2=${final.l2.mean.toFixed(4)}  ` +
    `L2_mle=${final.l2_mle?.mean.toFixed(4) ?? 'N/A'}  ` +
    `L2_cr=${final.l2_cr?.mean.toFixed(4) ?? 'N/A'}  ` +
    `coverage=${(final.pairCoverage.mean * 100).toFixed(0)}%`
  );
}

function outputJson(result: AggregatedResult) {
  console.log(JSON.stringify(result));
}

function outputCsv(result: AggregatedResult) {
  const { config, convergenceCurve } = result;
  const header = 'items,alpha,sigma,scoring,strategy,flow,priorC,r,session,vpi,spearman,rmse,l1,l2,pairCoverage';
  console.log(header);
  for (const snap of convergenceCurve) {
    console.log(
      `${config.items},${config.alpha},${config.sigma},${config.scoring},` +
      `${config.strategy},${config.flow},${config.priorC},${config.r},` +
      `${snap.session},${snap.vpi.toFixed(2)},${snap.spearman.toFixed(4)},` +
      `${snap.rmse.toFixed(6)},${snap.l1.toFixed(6)},${snap.l2.toFixed(6)},` +
      `${snap.pairCoverage.toFixed(4)}`
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
