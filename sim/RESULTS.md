# Ranking Weight Recovery Analysis

Results from simulation exploring how well the spectral ranker recovers true item weights from pairwise comparisons.

## Setup

- Items with power-law weights `w_i = ((i+1)/n)^alpha`, normalized.
- Pairs selected via `activeSelect` with coverage, proximity, and position terms (r=0.9).
- Votes drawn from Bradley-Terry with logit-normal noise: `score = sigmoid(log(wA/wB) + N(0, σ²))`, with optional Likert binning.
- Prior: `k = C / n` with C=1.
- Each trial runs judges x sessions x sessionSize votes.

## Algorithm

**Bidirectional linear flow** with column-sum self-loops.

Each vote with score s adds `s` flow toward the preferred item and `(1-s)` toward the other.
Before row-normalization, each item's diagonal is set to its column sum (total incoming flow), which lets items retain weight proportional to how much others prefer them.

This satisfies detailed balance: with exact Bradley-Terry probabilities and no prior, the stationary distribution is provably proportional to true weights.

**Unidirectional flow** (original algorithm) only records the dominant direction: if value >= 0.5, flow goes toward the target; otherwise toward the source.
This discards information from the non-dominant direction.

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

### Ordinal accuracy (Spearman rank correlation)

| vpi | alpha=0.5 | alpha=1.0 | alpha=1.5 |
| --- | --------- | --------- | --------- |
| 12  | 0.75      | 0.91      | 0.95      |
| 24  | 0.85      | 0.95      | 0.98      |
| 36  | 0.89      | 0.97      | 0.99      |

Ordering is reliable across all distribution shapes.
Steeper distributions are easier to rank because the quality gaps between items are larger.

### Cardinal accuracy (spread ratio: recovered/true, 1.0 = perfect)

| vpi | alpha=0.5 | alpha=1.0 | alpha=1.5 |
| --- | --------- | --------- | --------- |
| 12  | 1.83x     | 1.10x     | 0.39x     |
| 24  | 1.92x     | 1.44x     | 0.71x     |
| 36  | 1.93x     | 1.62x     | 0.94x     |

No single configuration recovers magnitudes for all distributions.

## The Bias-Variance Dilemma

With Likert binning, you can recover **ordering** but not **exact magnitudes**, and more data does not fix this.

Likert binning introduces systematic magnitude **bias** that does not average out with more votes.
This is Jensen's inequality: Likert binning is a nonlinear step function, and `E[bin(p + noise)] != bin(E[p + noise])`.
More votes reduce **variance** (ordering improves) but not **bias** (magnitudes stay distorted).

## Open Research Questions

1. **Adaptive prior**: Could C be tuned based on observed vote density or spread?
2. **Post-hoc parametric fitting**: Fit a power-law curve to recovered ordering to estimate true shape parameter.
3. **Finer scoring granularity**: Would a 7- or 9-point scale improve magnitude recovery?
4. **Hybrid scoring**: Coarse Likert for most pairs, fine-grained calibration comparisons for a few.
5. **Confidence weighting**: Weight votes by judge consistency (internal transitivity).
6. **Self-loop alternatives**: Column sums cause mild ordering inversions in sparse graphs (3 items, 2 votes).
7. **Bidirectional vs unidirectional flow**: Systematic comparison of convergence rates and magnitude recovery.

## Reproducing These Results

All results generated with seed=42, 50 trials, 10 judges, 9 sessions, 12 votes per session.

```bash
npx tsx sim/simulate.ts --items 30 --alpha 0.5 --judges 10 --sessions 9 --ssize 12 --sigma 1 --prior 1 --trials 50 --seed 42
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 9 --ssize 12 --sigma 1 --prior 1 --trials 50 --seed 42
npx tsx sim/simulate.ts --items 30 --alpha 1.5 --judges 10 --sessions 9 --ssize 12 --sigma 1 --prior 1 --trials 50 --seed 42
```

vpi=12 corresponds to session 30, vpi=24 to session 60, vpi=36 to session 90 in the convergence output.

```bash
# Compare strategies
npx tsx sim/simulate.ts --strategy random --items 30 --sigma 1 --seed 42
npx tsx sim/simulate.ts --strategy activeSelect --items 30 --sigma 1 --seed 42

# Compare flow modes
npx tsx sim/simulate.ts --flow bidirectional --items 30 --sigma 1 --seed 42
npx tsx sim/simulate.ts --flow unidirectional --items 30 --sigma 1 --seed 42

# Parameter sweep (JSONL output)
npx tsx sim/sweep.ts --config sweep.json

# Fine-grained convergence (sessionSize=1)
npx tsx sim/simulate.ts --items 10 --ssize 1 --sessions 30 --sigma 1 --seed 42
```
