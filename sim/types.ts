import type { ActiveImpactTerm, FlowMode } from '../src/index.js';

export type ScoringMode = 'likert' | 'continuous';
export type Strategy = 'random' | 'activeSelect';
export type PriorMode = 'fixed' | 'anneal';

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
  priorMode: PriorMode;
  likertPoints?: number;
  seed?: number;
}

export interface SessionSnapshot {
  session: number;
  vpi: number;
  totalVotes: number;
  spearman: number;
  rmse: number;
  l1: number;
  l2: number;
  l2_mle?: number;
  l2_cr?: number;
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
    spearman: { mean: number; median: number };
    rmse: { mean: number; median: number };
    l1: { mean: number; median: number };
    l2: { mean: number; median: number };
    l2_mle?: { mean: number; median: number };
    l2_cr?: { mean: number };
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
