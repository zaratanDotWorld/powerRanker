# Research Log: Improving Weight Recovery Convergence

Date: 2026-04-04.
Goal: recover true weights as accurately as possible with as few votes as possible.
All experiments: 30 items, σ=1, C=1, seed=42, 50 trials unless noted.

## Phase 1: Parameter Sweeps

### 1a. Pseudocount C has no effect on ordinal accuracy

Swept C in [0.1, 0.25, 0.5, 1, 2, 4] across three alphas at vpi=12.
Spearman varied by less than 0.02 across a 40x range of C.
C controls cardinal accuracy (spread ratio) only.

| C | α=0.5 spearman | α=1.0 spearman | α=1.5 spearman |
|---|-----------------|-----------------|-----------------|
| 0.1 | 0.745 | 0.902 | 0.946 |
| 0.5 | 0.708 | 0.892 | 0.950 |
| 1 | 0.743 | 0.899 | 0.945 |
| 4 | 0.738 | 0.896 | 0.945 |

**Conclusion:** C is not a lever for ordinal accuracy.
It calibrates spread ratio, and the optimal C depends on the true distribution shape (unknowable in practice).

### 1b. Active selection r: marginal returns

r=1.0 (0.900) vs r=0.3 (0.890) vs random (0.882).
Full active selection is +0.018 over random.
r values above 0.7 are essentially equivalent.

### 1c. Term ablation: position hurts at low vpi

| Terms | Spearman (vpi=12) | Spearman (vpi=36) |
|-------|-------------------|-------------------|
| coverage | 0.900 | 0.964 |
| proximity | 0.878 | — |
| position | 0.857 | — |
| coverage,proximity | **0.902** | 0.964 |
| coverage,position | 0.892 | — |
| coverage,proximity,position | 0.899 | **0.968** |

Coverage is the key term.
Proximity adds a small benefit.
Position hurts at low vpi but helps slightly at high vpi (when rankings are already stable enough for top-bias to be useful).

**Conclusion:** Drop position for low-data regimes.
Coverage+proximity is the recommended default.

### 1d. Continuous vs Likert: no difference for ordinal accuracy

| α | Likert spearman | Continuous spearman |
|---|-----------------|---------------------|
| 0.5 | 0.743 | 0.745 |
| 1.0 | 0.899 | 0.898 |
| 1.5 | 0.945 | 0.950 |

The Likert "tax" on ordinal accuracy is negligible.
Likert binning does affect cardinal accuracy (spread ratio), consistent with the Jensen's inequality analysis in RESULTS.md.

### 1e. Unidirectional flow beats bidirectional

| α | Bidirectional | Unidirectional | Delta |
|---|---------------|----------------|-------|
| 0.5 | 0.743 | 0.777 | +0.034 |
| 1.0 | 0.899 | 0.907 | +0.009 |
| 1.5 | 0.945 | 0.950 | +0.005 |

Advantage is largest for flat distributions and shrinks for steep ones.
Holds across all sigma values tested (0.5 to 2.0) and item counts (10 to 50).
Trade-off: unidirectional inflates spread ratio (especially for flat distributions).

## Phase 2: Algorithmic Experiments

### 2a. Self-loop alternatives: colsum is far superior

| Self-loop | α=0.5 | α=1.0 | α=1.5 |
|-----------|-------|-------|-------|
| colsum | 0.743 | 0.899 | 0.945 |
| rowsum | 0.525 | 0.784 | 0.874 |
| none | 0.542 | 0.778 | 0.861 |

Column-sum self-loops encode "how much others prefer this item" as self-retention.
This is the right inductive bias.
Rowsum and none lose 0.07-0.22 Spearman — not viable alternatives.

### 2b. Finer Likert scales: negligible effect

| Scale | α=0.5 | α=1.0 | α=1.5 |
|-------|-------|-------|-------|
| 5-point | 0.743 | 0.899 | 0.945 |
| 7-point | 0.731 | 0.891 | 0.946 |
| 9-point | 0.717 | 0.900 | 0.952 |
| continuous | 0.745 | 0.898 | 0.950 |

No consistent improvement from finer scales.
The 5-point Likert is sufficient for ordinal accuracy.

### 2c. Isolating flow vs term effects

Both improvements are additive (α=0.5, vpi=12):

| Config | Spearman |
|--------|----------|
| bidir + all terms (baseline) | 0.743 |
| bidir + cov,prox (drop position) | 0.762 (+0.019) |
| unidir + all terms (switch flow) | 0.777 (+0.034) |
| unidir + cov,prox (both) | **0.803 (+0.060)** |

Flow change is ~2x the impact of term change.
They compose well.

### 2d. Generalization across item counts (α=1.0, vpi=12)

| Items | Baseline | Recommended | Delta |
|-------|----------|-------------|-------|
| 10 | 0.902 | 0.918 | +0.016 |
| 20 | 0.901 | 0.920 | +0.019 |
| 30 | 0.899 | 0.916 | +0.017 |
| 50 | 0.893 | 0.912 | +0.018 |

Consistent +0.016-0.019 improvement across item counts.

## Comprehensive Comparison

Baseline: bidirectional + coverage,proximity,position.
Recommended: unidirectional + coverage,proximity.

| α | vpi | Baseline | Recommended | Delta |
|---|-----|----------|-------------|-------|
| 0.5 | 12 | 0.743 | 0.803 | **+0.060** |
| 0.5 | 24 | 0.828 | 0.870 | **+0.042** |
| 0.5 | 36 | 0.889 | 0.915 | **+0.026** |
| 1.0 | 12 | 0.899 | 0.916 | **+0.017** |
| 1.0 | 24 | 0.946 | 0.953 | +0.007 |
| 1.0 | 36 | 0.968 | 0.967 | -0.001 |
| 1.5 | 12 | 0.945 | 0.950 | +0.005 |
| 1.5 | 24 | 0.974 | 0.972 | -0.001 |
| 1.5 | 36 | 0.985 | 0.982 | -0.003 |

The recommended config wins where it matters most: low vpi (the stated goal) and flat distributions (the hardest case).
At high vpi with steep distributions, the baseline is marginally better (<0.003).

## Key Insights

1. **Unidirectional flow is better for ordinal accuracy** because it naturally weights votes by information content.
A vote near 0.5 adds almost no flow; a strong vote adds nearly 1.0.
Bidirectional treats every vote equally (total flow always = 1.0), diluting signal from strong preferences with noise from weak ones.

2. **Coverage is the dominant active selection term.**
It ensures all items get observed, which is the binding constraint at low vpi.
Proximity provides a secondary benefit by resolving ambiguity between adjacent items.
Position (top-bias) is counterproductive at low vpi because it concentrates data on items that already rank well, starving lower-ranked items of observations.

3. **Column-sum self-loops are essential.**
They encode "how much others prefer this item" as self-retention probability, providing the right inductive bias for spectral ranking.
No alternative tested comes close.

4. **Pseudocount C is purely a cardinal accuracy parameter.**
It has almost no effect on ordering.
The optimal C for spread ratio depends on the true distribution shape, which is unknown.

5. **Likert binning does not hurt ordinal accuracy.**
Finer scales (7, 9-point) don't help either.
The 5-point Likert is sufficient.

## Phase 3: L2 Analysis

The Phase 2 analysis focused on Spearman.
Re-examining with L2 (weight recovery) reveals a critical trade-off.

### Unidirectional improves Spearman but worsens L2

At alpha=1.0, vpi=12:

| Config | Spearman | L2 |
|--------|----------|----|
| bidir + all terms (baseline) | 0.899 | 0.068 |
| bidir + cov,prox | 0.902 | **0.044** |
| unidir + all terms | 0.907 | 0.185 |
| unidir + cov,prox | 0.916 | 0.120 |

Unidirectional nearly triples L2.
Discarding reverse flow filters noise (helping ordering) but loses magnitude information.

### Dropping position improves both metrics

This is the key finding: bidir + coverage,proximity improves L2 by 35-45% over the baseline while also slightly improving Spearman.
The position term was hurting both metrics.

Full L2 comparison (bidir + cov,prox vs baseline):

| α | vpi | Baseline L2 | Recommended L2 | Improvement |
|---|-----|-------------|----------------|-------------|
| 0.5 | 12 | 0.071 | 0.039 | -45% |
| 0.5 | 24 | 0.056 | 0.027 | -52% |
| 1.0 | 12 | 0.068 | 0.044 | -35% |
| 1.0 | 24 | 0.050 | 0.034 | -32% |
| 1.5 | 12 | 0.067 | 0.052 | -22% |
| 1.5 | 24 | 0.049 | 0.041 | -16% |

## Recommendations

**For both ordering and magnitude recovery:**
- **Bidirectional flow + coverage,proximity** (drop position)
- This improves Spearman slightly and L2 substantially (up to 45% reduction)

**For ordering only (magnitudes don't matter):**
- **Unidirectional flow + coverage,proximity**
- Better Spearman (+0.06 at α=0.5/vpi=12) but ~2x worse L2

**Keep as-is:** C=1, r=0.9, colsum self-loops, 5-point Likert.

## Reproduction

```bash
# Baseline
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 3 --ssize 12 --sigma 1 --prior 1 --trials 50 --seed 42

# Recommended (both metrics)
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 3 --ssize 12 --sigma 1 --prior 1 --select "coverage,proximity" --trials 50 --seed 42

# Ordinal-only
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 3 --ssize 12 --sigma 1 --prior 1 --flow unidirectional --select "coverage,proximity" --trials 50 --seed 42
```
