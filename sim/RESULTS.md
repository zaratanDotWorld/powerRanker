# Ranking Weight Recovery Analysis

Results from simulation exploring how well the spectral ranker recovers true item weights from pairwise comparisons.

## Setup

- Items with power-law weights `w_i = ((i+1)/n)^alpha`, normalized.
- Pairs selected via `activeSelect` with configurable terms (r=0.9).
- Votes drawn from Bradley-Terry with logit-normal noise: `score = sigmoid(log(wA/wB) + N(0, σ²))`, with optional Likert binning.
- Prior: `k = C / n` with C=1.
- Each trial runs judges x sessions x sessionSize votes.

## Algorithm

Two flow modes are supported.

**Bidirectional flow**: a vote with score s adds `s` flow toward the preferred item and `(1-s)` toward the other.
Every vote contributes 1.0 total weight regardless of preference strength.
Satisfies detailed balance: with exact BT probabilities, the stationary distribution is proportional to true weights.

**Unidirectional flow**: only records the dominant direction, scaled by `(s - 0.5) * 2`.
A vote of 0.95 adds 0.9 flow; a vote of 0.55 adds 0.1 flow.
This naturally weights votes by information content — strong preferences contribute more than weak ones.

Both use column-sum self-loops: each item's diagonal is set to its column sum (total incoming flow from others), then the matrix is row-normalized for power iteration.

## Noise Model

Votes are generated using a **logit-normal** model.
The true Bradley-Terry log-odds `log(wA/wB)` are perturbed by Gaussian noise with standard deviation σ, then mapped back to (0,1) via the sigmoid function.

This is the natural noise model for BT comparisons: it perturbs the judge's strength estimate in log-odds space (where BT already lives), always produces scores on (0,1) without clamping, and is always unimodal.

σ controls judge accuracy:
- σ=0 → deterministic (exact BT probabilities)
- σ=1 → moderate noise (at pA=0.5, 68% of votes fall in [0.27, 0.73])
- σ=2 → heavy noise (at pA=0.5, 68% of votes fall in [0.12, 0.88])

## Recovery Results (Likert, σ=1, C=1, 30 items)

Three distribution shapes tested:

- **alpha=0.5** (flat): true spread 5.5x between best and worst item.
- **alpha=1.0** (medium): true spread 30x.
- **alpha=1.5** (steep): true spread 164x.

### Baseline (bidirectional + coverage,proximity,position)

#### Ordinal accuracy (Spearman rank correlation)

| vpi | alpha=0.5 | alpha=1.0 | alpha=1.5 |
| --- | --------- | --------- | --------- |
| 12  | 0.74      | 0.90      | 0.95      |
| 24  | 0.83      | 0.95      | 0.97      |
| 36  | 0.89      | 0.97      | 0.98      |

#### Cardinal accuracy (spread ratio: recovered/true, 1.0 = perfect)

| vpi | alpha=0.5 | alpha=1.0 | alpha=1.5 |
| --- | --------- | --------- | --------- |
| 12  | 2.10x     | 1.21x     | 0.44x     |
| 24  | 2.07x     | 1.52x     | 0.73x     |
| 36  | 1.93x     | 1.62x     | 0.94x     |

### Optimized (unidirectional + coverage,proximity)

#### Ordinal accuracy (Spearman rank correlation)

| vpi | alpha=0.5 | alpha=1.0 | alpha=1.5 |
| --- | --------- | --------- | --------- |
| 12  | 0.80      | 0.92      | 0.95      |
| 24  | 0.87      | 0.95      | 0.97      |
| 36  | 0.91      | 0.97      | 0.98      |

Improvement over baseline: **+0.06** at alpha=0.5/vpi=12 (the hardest, most data-constrained case), tapering to near-zero at high vpi with steep distributions.

## Optimization Findings

See `RESEARCH_LOG.md` for detailed experiment results.

### What helps ordinal accuracy

1. **Unidirectional flow** (+0.03 average).
Natural information weighting: strong preferences contribute more flow, weak preferences near 0.5 contribute almost nothing.
Bidirectional treats every vote equally, diluting signal.

2. **Drop position term from active selection** (+0.01-0.02).
Position (top-bias) concentrates data on already-well-ranked items, starving lower-ranked items of observations.
Coverage + proximity is the best combination at low vpi.

### What doesn't help

- **Pseudocount C**: no effect on ordinal accuracy (varies <0.02 across 40x range of C).
- **Finer Likert scales**: 5, 7, 9-point and continuous all produce equivalent Spearman.
- **Active selection r**: values from 0.7 to 1.0 are essentially equivalent.
- **Alternative self-loops**: rowsum and none lose 0.07-0.22 Spearman vs colsum.

## The Bias-Variance Dilemma

With Likert binning, you can recover **ordering** but not **exact magnitudes**, and more data does not fix this.

Likert binning introduces systematic magnitude **bias** that does not average out with more votes.
This is Jensen's inequality: Likert binning is a nonlinear step function, and `E[bin(p + noise)] != bin(E[p + noise])`.
More votes reduce **variance** (ordering improves) but not **bias** (magnitudes stay distorted).

## Open Research Questions

1. **Adaptive prior**: Could C be tuned based on observed vote density or spread?
2. **Post-hoc parametric fitting**: Fit a power-law curve to recovered ordering to estimate true shape parameter.
3. **Hybrid scoring**: Coarse Likert for most pairs, fine-grained calibration comparisons for a few.
4. **Confidence weighting**: Weight votes by judge consistency (internal transitivity).
5. **Adaptive selection**: Shift from coverage-heavy to proximity-heavy as data accumulates.

## Reproducing These Results

All results generated with seed=42, 50 trials, 10 judges, 12 votes per session.
vpi=12 at sessions=3, vpi=24 at sessions=6, vpi=36 at sessions=9.

```bash
# Baseline (bidirectional + all terms)
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 3 --ssize 12 --sigma 1 --prior 1 --trials 50 --seed 42

# Optimized (unidirectional + coverage,proximity)
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 3 --ssize 12 --sigma 1 --prior 1 --flow unidirectional --select "coverage,proximity" --trials 50 --seed 42

# Full convergence curve (vpi 12→36)
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 9 --ssize 12 --sigma 1 --prior 1 --flow unidirectional --select "coverage,proximity" --trials 50 --seed 42
```
