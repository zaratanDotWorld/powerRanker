# Agent Instructions

## Research Log

This project has an ongoing research log at `sim/RESEARCH_LOG.md`.
When running experiments or discovering new findings, update the log before moving on.
Each phase should include the hypothesis, results table, and conclusion.

The goal is for work to compound across sessions.
If a finding contradicts or extends a previous entry, note that explicitly.

## Simulation Harness

- All experiments use `sim/simulate.ts` (single config) or `sim/sweep.ts` (parameter sweeps).
- Standard baseline: 30 items, σ=1, C=1, seed=42, 50 trials.
- Results are also summarized in `sim/RESULTS.md` (user-facing) — update when recommendations change.
- MLE comparison is available via `sim/mle.ts` (imported into simulate.ts).
