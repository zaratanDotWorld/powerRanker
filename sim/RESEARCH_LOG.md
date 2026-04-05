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

## Phase 4: L1 Metric & Position Term Confirmation

### 4a. L1 confirms position hurts across all error norms

Added L1 (sum of absolute errors) to test whether position might help under absolute error, since L2 penalizes large errors quadratically.
Hypothesis: position concentrates precision on high-weight top items; L1 wouldn't penalize small errors on bottom items as harshly.

| α | Config | Spearman | L1 | L2 |
|---|--------|----------|------|------|
| 0.5 | all terms (baseline) | 0.743 | 0.295 | 0.071 |
| 0.5 | cov,prox | 0.762 | **0.170** (-42%) | **0.039** (-45%) |
| 1.0 | all terms (baseline) | 0.899 | 0.263 | 0.068 |
| 1.0 | cov,prox | 0.902 | **0.186** (-29%) | **0.044** (-35%) |
| 1.5 | all terms (baseline) | 0.945 | 0.242 | 0.067 |
| 1.5 | cov,prox | 0.944 | **0.209** (-14%) | **0.052** (-22%) |

**Conclusion:** Position hurts L1 too.
The bottom items are starved so badly that total absolute error still increases, even without the quadratic penalty.
Dropping position is a free win across all three metrics (Spearman, L1, L2).

Default active selection terms changed to `['coverage', 'proximity']` everywhere.

## Phase 5: Fundamental Limits — Spectral vs MLE vs Cramér-Rao

### 5a. MLE Bradley-Terry implementation

Implemented MM algorithm BT estimator in `sim/mle.ts`.
Each vote with score s contributes s fractional wins to target, (1-s) to source.
Update rule: θ_i^(t+1) = W_i / Σ_j (n_ij / (θ_i^t + θ_j^t)).
Also implemented Cramér-Rao lower bound via Fisher information matrix inversion.

### 5b. Spectral vs MLE with activeSelect (vpi=12)

| α | L2 spectral | L2 MLE | CR bound |
|---|-------------|--------|----------|
| 0.5 | **0.039** | 0.041 | 0.080 |
| 1.0 | 0.044 | **0.043** | 0.090 |
| 1.5 | 0.052 | **0.048** | 0.101 |

Spectral matches or beats MLE at α=0.5, tied at α=1.0, loses 8% at α=1.5.
Both beat the CR bound by ~2x (bias-variance tradeoff — both are biased but have lower MSE).

### 5c. Gap widens at high vpi

At α=1.0, vpi=36: spectral 0.029 vs MLE **0.024** (17% gap).
As data grows, spectral's regularization bias becomes the dominant error term while MLE converges to truth.

### 5d. ActiveSelect is a powerful implicit regularizer

With random pair selection (α=1.0, vpi=12): spectral 0.051 vs MLE **0.041** (20% gap).
ActiveSelect closes this gap almost entirely for the spectral method.
It focuses comparisons on nearby-ranked pairs, which is exactly where the spectral method needs signal.

### 5e. Key insight: spectral vs MLE is about regularization, not transitivity

Initial hypothesis: spectral methods outperform MLE because they leverage transitive graph structure.
**This is wrong.** BT MLE is also a global model — it fits θ_i per item so that P(A>B) = θ_A/(θ_A+θ_B) for all pairs.
If A>B and B>C are observed, MLE infers θ_A > θ_C even without a direct A-C comparison.
Transitivity is baked into the parametric structure.

The real difference:
- **Spectral advantage**: implicit regularization (pseudocount, self-loops), robustness to model misspecification, graceful degradation with intransitive preferences.
- **MLE advantage**: statistical efficiency (extracts maximum information per vote when BT model is correct), dominates at large sample sizes.

In our setting (data generated from BT), spectral's only advantage is regularization.
This explains the empirical pattern: tied at vpi=12 (regularization helps), MLE wins at vpi=36 (efficiency dominates).

**Practical implication**: for real deployments with heterogeneous judges, mild intransitivity, and limited data, spectral is the safer bet.

### 5f. Column-sum self-loops ARE Rank Centrality

Initially observed that with σ=0, C≈0, and massive data, spectral L2 plateaus at ~0.0014 while MLE reaches 0.0000.
Hypothesized this was structural bias from the self-loop construction.

**Investigation**: built a controlled analysis (`sim/selfloop-analysis.ts`) comparing:
1. Our column-sum self-loop matrix with all pairs observed once at exact BT probabilities
2. The Rank Centrality matrix P_ij = p_ji/(n-1) (Negahban et al., 2012)

**Result: the matrices are identical to floating-point precision (max diff ~1e-16).**

Proof sketch: with complete graph and one observation per pair:
- Our F[i][j] = P(j beats i) = w_j/(w_i+w_j) for i≠j
- Column sum of j = Σ_{i≠j} F[i][j] = Σ_{i≠j} w_j/(w_i+w_j)
- Self-loop for i: F[i][i] = column_sum_i = Σ_{j≠i} w_i/(w_j+w_i)
- Row sum = Σ_{j≠i} [w_j/(w_i+w_j) + w_i/(w_i+w_j)] = n-1 for all i
- After row-normalization: M[i][j] = P(j beats i)/(n-1) = Rank Centrality P[i][j]
- Diagonal: M[i][i] = Σ_{j≠i} P(i beats j)/(n-1) = 1 - Σ_{j≠i} P(j beats i)/(n-1) = RC P[i][i] ✓

The "structural bias" was actually the power iteration convergence tolerance (ε=0.001).

| n | α | L2 (ε=0.001) | L2 (ε=1e-10) |
|---|---|---------------|---------------|
| 5 | 1.0 | 0.000615 | 0.0000000001 |
| 10 | 1.0 | 0.001361 | 0.0000000002 |
| 30 | 1.0 | 0.001385 | 0.0000000002 |
| 30 | 0.5 | 0.000962 | 0.0000000001 |
| 30 | 1.5 | 0.001792 | 0.0000000002 |

With ε=1e-10, recovery is exact to machine precision. No structural bias.

### 5g. ε=0.001 is beneficial regularization (don't tighten it)

Tested tighter epsilon in the noisy regime (α=1.0, σ=1, vpi=12):

| ε | Spearman | L2 |
|---|----------|----|
| 0.001 (default) | **0.902** | **0.044** |
| 1e-8 | 0.896 | 0.045 |

Tighter epsilon made BOTH metrics worse.
The coarse convergence acts as early stopping / implicit regularization: the eigenvector of a noisy transition matrix overfits if solved too precisely.
This is analogous to early stopping in gradient descent — stopping before convergence reduces overfitting to training noise.

**Keep ε=0.001.** It's not a bug, it's a feature.

### 5h. Unequal pair sampling is the real bias source

With equal observations per pair: L2=0 (with tight ε).
With unequal observations (1-3 per pair, deterministic pattern): L2=0.001-0.014.

In practice, even with activeSelect achieving 56% pair coverage at vpi=12, pair observation counts are highly non-uniform.
This is the actual source of bias in the noisy regime — not the matrix construction, not the convergence tolerance.

**Summary of spectral bias decomposition (α=1.0, vpi=12):**
- Matrix construction: 0 (equivalent to Rank Centrality)
- Convergence tolerance: ~0.001 (beneficial regularization)
- Unequal pair sampling: dominant source of remaining error
- Vote noise: dominant source of total error

## Phase 6: Principled Active Selection (Fisher Information)

### 6a. Fisher info term: p(1-p) from BT estimates

Added `fisher` as an active selection term.
For each candidate pair (i,j), weight by p̂_ij(1-p̂_ij) where p̂_ij = w_i/(w_i+w_j).
This is the Fisher information per BT comparison — maximized at p̂=0.5 (equal items), zero when one dominates.
It's the information-theoretic analog of the heuristic `proximity` term.

### 6b. Fisher vs proximity comparison (vpi=12, 30 items)

| α | Config | Spearman | L1 | L2 | Coverage |
|---|--------|----------|------|------|----------|
| 0.5 | cov,prox | **0.762** | **0.170** | **0.039** | 56% |
| 0.5 | cov,fisher | 0.755 | 0.178 | 0.041 | 58% |
| 0.5 | fisher only | 0.717 | 0.197 | 0.046 | 57% |
| 1.0 | cov,prox | 0.902 | 0.186 | 0.044 | 56% |
| 1.0 | cov,fisher | **0.909** | **0.179** | **0.043** | 58% |
| 1.0 | cov,prox,fisher | 0.903 | 0.187 | 0.045 | 55% |
| 1.0 | coverage only | 0.900 | 0.195 | 0.048 | 58% |
| 1.0 | fisher only | 0.883 | 0.203 | 0.049 | 57% |
| 1.5 | cov,prox | 0.944 | 0.209 | 0.052 | 55% |
| 1.5 | cov,fisher | **0.945** | **0.202** | 0.052 | 58% |

Fisher beats proximity at α≥1.0 but loses at α=0.5 (flat distributions).
Fisher without coverage degrades badly — coverage remains essential.
Three-term combination (cov,prox,fisher) slightly worse than two-term — the terms dilute each other.

### 6c. Fisher advantage grows with data (α=1.0)

| vpi | cov,prox L2 | cov,fisher L2 | Δ |
|-----|-------------|---------------|------|
| 12 | 0.044 | **0.043** | -2% |
| 36 | 0.029 | **0.027** | -7% |

At vpi=36: Spearman 0.967 vs 0.964, coverage 93% vs 89%.
Fisher increasingly outperforms as data accumulates.

### 6d. Generalization across item counts (α=1.0, vpi=12)

| Items | cov,prox Spearman | cov,fisher Spearman | cov,prox L2 | cov,fisher L2 |
|-------|-------------------|---------------------|-------------|---------------|
| 10 | 0.970 | 0.969 | 0.046 | **0.044** |
| 30 | 0.902 | **0.909** | 0.044 | **0.043** |
| 50 | 0.856 | **0.861** | 0.043 | 0.043 |

Consistent pattern: fisher matches or beats proximity on L2 at α=1.0 across item counts.

### 6e. Why fisher fails at flat distributions

At α=0.5, all items have similar weights.
p̂_ij ≈ 0.5 for most pairs → p(1-p) ≈ 0.25 everywhere.
Fisher can't discriminate — it degenerates toward uniform selection.
Proximity still provides signal via rank positions (even if noisy, adjacent ranks are closer).

At α≥1.0, weights are spread enough that Fisher info varies meaningfully across pairs.
It directly identifies the most informative comparisons (similar-strength items) without the rank-position indirection.

### 6f. Unified A-optimal term (infoGain): doesn't beat factored approach

Implemented a single `infoGain` term combining coverage and fisher:
weight = p̂_ij(1-p̂_ij) / √((info_i + 0.25)(info_j + 0.25)),
where info_i = n_i × avg_j(p̂_ij(1-p̂_ij)) is the accumulated Fisher info for item i.

This is a greedy A-optimal design step — selects the pair that most reduces total estimation variance.

| α | vpi | cov,prox L2 | cov,fisher L2 | infoGain L2 |
|---|-----|-------------|---------------|-------------|
| 0.5 | 12 | **0.039** | 0.041 | 0.042 |
| 1.0 | 12 | 0.044 | **0.043** | 0.046 |
| 1.5 | 12 | 0.052 | 0.052 | **0.051** |
| 1.0 | 36 | 0.029 | **0.027** | 0.028 |

infoGain has the best spread ratios (0.98-0.99x) and pair coverage (94% at vpi=36), but worse Spearman and L2 at α=1.0.

**Why it doesn't win**: the principled formula's exploration is too weak at low vpi.
The heuristic 1/√(1+n) gives massive priority to unobserved items (0→1.0).
The Fisher-weighted accumulated info is more gradual — the 0.25 prior dominates early, so all items look equally uncertain, degenerating toward pure exploitation.

The factored approach (coverage × fisher) works better because each term has a clear, strong signal.
Coverage says "observe this item." Fisher says "compare similar items." They compose cleanly.
The unified formula compromises on both.

**Removed from implementation** — documented here for reference.

### 6g. Assessment

Fisher (coverage,fisher) is the principled replacement for proximity:
- Uses BT Fisher information p(1-p) instead of rank-position heuristic
- Better at α≥1.0 (the common regime for real preference data)
- Slightly worse at α=0.5 (flat distributions, uncommon in practice)
- Advantage grows with more data
- Same computational cost as proximity

Coverage remains heuristic (1/√(1+n)) but well-calibrated.
Attempts to make it "more principled" (Fisher-weighted info) actually weakened the exploration signal.

The practical recommendation depends on the expected distribution shape.
For most real-world preference data (α≈1.0+), coverage+fisher is optimal.

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
