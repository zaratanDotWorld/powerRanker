import type { ActiveImpactTerm, FlowMode } from '../src/index.js';

export type ScoringMode = 'likert' | 'continuous';
export type Strategy = 'random' | 'activeSelect';

export interface SimConfig {
  items: number;
  alpha: number;
  sigma: number;
  scoring: ScoringMode;
  strategy: Strategy;
  flow: FlowMode;
  priorC: number;
  r: number;
  terms: ActiveImpactTerm[];
  judges: number;
  sessions: number;
  sessionSize: number;
  trials: number;
  likertPoints?: number;
  seed?: number;
}

export interface SessionSnapshot {
  session: number;
  vpi: number;
  totalVotes: number;
  spearman: number;
  kendall: number;
  l1: number;
  l2: number;
  pearson: number;
  spreadRatio: number;
  pairCoverage: number;
}

export interface TrialResult {
  snapshots: SessionSnapshot[];
  uniquePairs: number;
  totalPairs: number;
}

export interface AggregatedResult {
  config: SimConfig;
  /** Mean metrics at each session boundary across all trials */
  convergenceCurve: SessionSnapshot[];
  /** Final-state summary stats */
  final: {
    pearson: { mean: number; median: number };
    spearman: { mean: number; median: number };
    kendall: { mean: number; median: number };
    l1: { mean: number; median: number };
    l2: { mean: number; median: number };
    spreadRatio: { mean: number; median: number };
    pairCoverage: { mean: number };
  };
}

export interface SweepConfig {
  items: number[];
  alpha: number[];
  sigma: number[];
  scoring: ScoringMode[];
  strategies: Strategy[];
  flow: FlowMode[];
  priorC: number[];
  r: number[];
  judges: number[];
  sessions: number[];
  sessionSize: number[];
  trials: number;
  seed?: number;
}
