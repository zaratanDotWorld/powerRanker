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

Two normalization modes are supported.

**Flow normalization** (default): each item's diagonal is set to its column sum (total incoming flow from others), then the matrix is row-normalized for power iteration.
On incomplete graphs, this inflates weights for high-degree nodes — a structural bias that does not diminish with more data.

**Rank centrality normalization**: each pair's flow is normalized to a win fraction, divided by d_max (maximum node degree), with diagonal set to the residual (1 - off-diagonal sum).
Eliminates degree-dependent bias on incomplete graphs.
Matches MLE accuracy across all coverage levels.

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

#### Ordinal accuracy (Spearman) / Weight recovery (L2)

| vpi | α=0.5 Spearman | α=0.5 L2 | α=1.0 Spearman | α=1.0 L2 | α=1.5 Spearman | α=1.5 L2 |
| --- | -------------- | --------- | -------------- | --------- | -------------- | --------- |
| 12  | 0.74           | 0.071     | 0.90           | 0.068     | 0.95           | 0.067     |
| 24  | 0.83           | 0.056     | 0.95           | 0.050     | 0.97           | 0.049     |
| 36  | 0.89           | 0.044     | 0.97           | 0.038     | 0.98           | 0.037     |

### Recommended (bidirectional + coverage,proximity)

Dropping the position term improves both Spearman and L2 simultaneously.

#### Ordinal accuracy (Spearman) / Weight recovery (L2)

| vpi | α=0.5 Spearman | α=0.5 L2 | α=1.0 Spearman | α=1.0 L2 | α=1.5 Spearman | α=1.5 L2 |
| --- | -------------- | --------- | -------------- | --------- | -------------- | --------- |
| 12  | 0.76           | **0.039** | 0.90           | **0.044** | 0.94           | **0.052** |
| 24  | 0.86           | **0.027** | 0.95           | **0.034** | 0.97           | **0.041** |
| 36  | 0.89           | **0.023** | 0.96           | **0.029** | 0.98           | **0.036** |

Improvement over baseline at vpi=12: Spearman +0.02 (α=0.5), L2 **-45%** (α=0.5).
L2 improves substantially across all regimes.

### Ordinal-only: unidirectional + coverage,proximity

If only ordering matters (not magnitudes), unidirectional flow adds further Spearman improvement at the cost of L2.

| vpi | α=0.5 Spearman | α=0.5 L2 | α=1.0 Spearman | α=1.0 L2 |
| --- | -------------- | --------- | -------------- | --------- |
| 12  | **0.80**       | 0.112     | **0.92**       | 0.120     |
| 24  | **0.87**       | 0.089     | **0.95**       | 0.107     |
| 36  | **0.91**       | 0.080     | **0.97**       | 0.106     |

## The Spearman/L2 Trade-off

Unidirectional flow improves ordering but worsens weight recovery.
The mechanism: discarding reverse flow filters noise (helping ordering) but throws away information (hurting magnitudes).

At alpha=1.0, vpi=12:

| Config | Spearman | L2 |
|--------|----------|----|
| bidir + all terms (baseline) | 0.899 | 0.068 |
| bidir + cov,prox (**recommended**) | 0.902 | **0.044** |
| unidir + all terms | 0.907 | 0.185 |
| unidir + cov,prox (ordinal-only) | 0.916 | 0.120 |

Dropping position is a free win (improves both metrics).
Switching to unidirectional is a trade-off (better ordering, worse magnitudes).

## Optimization Findings

See `RESEARCH_LOG.md` for detailed experiment results.

### What helps both Spearman and L2

1. **Drop position term from active selection**.
Position (top-bias) concentrates data on already-well-ranked items, starving lower-ranked items of observations.
Coverage + proximity is the best combination.

### What helps Spearman but hurts L2

1. **Unidirectional flow** (+0.03 Spearman, but ~2x worse L2).
Use only when ordering is the sole objective.

### What doesn't help either metric

- **Pseudocount C**: no effect on ordinal accuracy (varies <0.02 across 40x range of C).
- **Finer Likert scales**: 5, 7, 9-point and continuous all produce equivalent Spearman.
- **Active selection r**: values from 0.7 to 1.0 are essentially equivalent.
- **Alternative self-loops**: rowsum and none lose 0.07-0.22 Spearman vs colsum.

## Rank Centrality Results

Rank centrality eliminates spectral's degree-dependent bias on incomplete graphs.
With bidirectional flow and k=0, it matches MLE accuracy.

### RMSE comparison (N=30, α=1.0, σ=0.15, Likert, random selection, 10 trials)

| VPI | Flow | Rank Centrality | MLE |
|-----|------|-----------------|-----|
| 5 | 0.0113 | **0.0039** | 0.0041 |
| 10 | 0.0084 | **0.0031** | 0.0029 |
| 20 | 0.0062 | **0.0026** | 0.0023 |

### Scaling (α=1.0, σ=0.15, VPI=5, random selection)

| N | Coverage | Flow | RC | MLE |
|---|----------|------|-----|-----|
| 30 | 34.5% | 0.0116 | 0.0042 | 0.0041 |
| 100 | 10.1% | 0.0039 | 0.0016 | 0.0017 |
| 200 | 5.0% | 0.0018 | 0.0008 | 0.0008 |
| 500 | 2.0% | 0.0007 | 0.0004 | 0.0036 |

RC is 2-4x better than flow at every scale.
At very sparse coverage (2%), RC beats MLE (MLE's optimizer becomes unstable).

### Active selection is redundant with rank centrality

| VPI | Random+RC | Active+RC |
|-----|-----------|-----------|
| 5 | 0.0039 | 0.0042 |
| 10 | 0.0031 | 0.0030 |

Active selection was primarily compensating for flow normalization's degree bias.
With the bias eliminated, random selection is sufficient.

## The Bias-Variance Dilemma

With Likert binning, you can recover **ordering** but not **exact magnitudes**, and more data does not fix this.

Likert binning introduces systematic magnitude **bias** that does not average out with more votes.
This is Jensen's inequality: Likert binning is a nonlinear step function, and `E[bin(p + noise)] != bin(E[p + noise])`.
More votes reduce **variance** (ordering improves) but not **bias** (magnitudes stay distorted).

## Open Research Questions

1. **Aggregation degree bias**: Flow normalization introduces degree-dependent distortion in the aggregation use case, but rank centrality discards vote accumulation (the core signal). No clean resolution yet.
2. **Aggregation responsiveness**: With sparse intentional voting, the system can feel too responsive (single vote swings weights) or not responsive enough (high prior masks votes). Optimal prior tuning for small groups is an open question.
3. **Post-hoc parametric fitting**: Fit a power-law curve to recovered ordering to estimate true shape parameter.
4. **Hybrid scoring**: Coarse Likert for most pairs, fine-grained calibration comparisons for a few.
5. **Confidence weighting**: Weight votes by judge consistency (internal transitivity).

## Reproducing These Results

All results generated with seed=42, 50 trials, 10 judges, 12 votes per session.
vpi=12 at sessions=3, vpi=24 at sessions=6, vpi=36 at sessions=9.

```bash
# Baseline (bidirectional + all terms)
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 3 --ssize 12 --sigma 1 --prior 1 --trials 50 --seed 42

# Recommended (bidirectional + coverage,proximity)
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 3 --ssize 12 --sigma 1 --prior 1 --select "coverage,proximity" --trials 50 --seed 42

# Ordinal-only (unidirectional + coverage,proximity)
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 3 --ssize 12 --sigma 1 --prior 1 --flow unidirectional --select "coverage,proximity" --trials 50 --seed 42

# Full convergence curve (vpi 12→36)
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 9 --ssize 12 --sigma 1 --prior 1 --select "coverage,proximity" --trials 50 --seed 42
```
