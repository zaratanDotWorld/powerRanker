# Agent Instructions

## Research Log

This project has two research documents:
- `sim/RESEARCH.md` — thematic summary of findings and recommendations. Update when conclusions change.
- `sim/LOG.md` — chronological experiment record. Append new phases when running experiments.

Each log phase should include the hypothesis, results table, and conclusion.
If a finding contradicts or extends a previous entry, note that explicitly and update RESEARCH.md.

## Simulation Harness

- All experiments use `sim/simulate.ts` (single config) or `sim/sweep.ts` (parameter sweeps).
- Standard baseline: 30 items, σ=1, C=0, seed=42, 50 trials.
- MLE comparison is available via `sim/mle.ts` (imported into simulate.ts).
