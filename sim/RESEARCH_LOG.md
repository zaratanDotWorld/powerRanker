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

## Phase 7: Adaptive Prior (Pseudocount Annealing)

### 7a. Problem: C compresses spread at steep distributions

At α=1.5 (true spread 89x), the fixed prior C=1 produces spread ratio of 0.45x at vpi=12 with 20 items, and 0.27x with 30 items.
Root cause: the pseudocount k=C/N adds uniform flow to all cells including unobserved pairs (~25% at vpi=12).
For unobserved pairs, the prior is the _only_ signal and says "all items are equal," pulling extreme items toward the center.

### 7b. Anneal approach: k decays as 1/sqrt(1 + vpi)

Implemented `computeK()` with three modes:
- **fixed**: k = C/N (baseline)
- **anneal**: k = (C/N) / sqrt(1 + vpi). At vpi=12, prior is ~28% of initial strength.
- **dataScaled**: k proportional to minimum observed per-item flow. Experimental.

Tested other decay rates:
- 1/(1 + vpi): too aggressive, spread overshoots to 3.4x at α=1.5
- 1/(1 + log(1 + vpi)): similar to sqrt, no clear advantage
- sqrt: best balance of spread recovery vs overshoot

### 7c. Results: anneal vs fixed at vpi=12 (20 trials, seed=42, σ=0.15)

**20 items:**

| α | Mode | L2 | L1 | Spread | Spearman |
|---|------|------|------|--------|----------|
| 0.5 | fixed | 0.0318 | 0.1138 | 0.86x | 0.825 |
| 0.5 | anneal | 0.0327 | 0.1166 | 0.94x | 0.824 |
| 1.0 | fixed | 0.0371 | 0.1258 | 0.95x | 0.952 |
| 1.0 | anneal | 0.0354 | 0.1192 | 1.70x | 0.952 |
| 1.5 | fixed | 0.0429 | 0.1418 | 0.45x | 0.979 |
| 1.5 | anneal | 0.0388 | 0.1238 | 1.43x | 0.982 |

**Scaling with N (α=1.5):**

| N | Mode | L2 | L1 | Spread |
|---|------|------|------|--------|
| 10 | fixed | 0.0465 | 0.1067 | 0.83x |
| 10 | anneal | 0.0394 | 0.0942 | 1.65x |
| 20 | fixed | 0.0429 | 0.1418 | 0.45x |
| 20 | anneal | 0.0388 | 0.1238 | 1.43x |
| 30 | fixed | 0.0359 | 0.1467 | 0.27x |
| 30 | anneal | 0.0327 | 0.1245 | 0.95x |

### 7d. Analysis

Anneal uniformly improves L2 and L1 at α≥1.0.
Spread recovery is dramatic: at 30 items/α=1.5, 0.27x → 0.95x (near perfect).
At 20 items, α=1.0 overshoots (1.70x) and α=1.5 overshoots (1.43x).
At 30 items (more realistic), α=1.5 is nearly perfect (0.95x).

**Overshoot mechanism:** At small N with high pair coverage (~98% at N=10), the prior becomes irrelevant quickly, and the anneal removes it faster than needed.
At larger N with lower coverage (~58% at N=30), the anneal correctly adjusts the prior as data accumulates.

**dataScaled was unstable:** Produces Infinity spread early (when min flow ≈ 0) and overshoots to 4-5x later.
Not viable without significant redesign.

### 7e. Conclusion

Anneal (1/sqrt(1+vpi)) is a clear win for N≥20 with steep distributions.
It fixes the spread compression problem without hurting ordinal accuracy.
Best improvement: 30 items, α=1.5 — L2 improves 9%, L1 improves 15%, spread goes from 0.27x to 0.95x.
Trade-off: moderate spread overshoot at small N or moderate α. Acceptable in practice.

**Recommendation:** Use `priorMode='anneal'` as default for production. Keep `fixed` available as fallback.

## Phase 8: Systematic L2 Exploration

### 8a. Full sweep across scoring, prior, selection, and vpi

20 items, σ=0.15, 30 trials, seed=42.
Fixed bug: `--scoring continuous` was ignored due to parser checking `'continuous' in opts` instead of `opts['scoring']`.

**Spectral L2 at vpi=12:**

| Config | α=0.5 | α=1.0 | α=1.5 |
|--------|-------|-------|-------|
| Likert+fixed (baseline) | 0.0321 | 0.0368 | 0.0422 |
| Continuous+fixed | 0.0271 | 0.0320 | 0.0416 |
| Likert+anneal | 0.0321 | 0.0352 | 0.0392 |
| Continuous+anneal | **0.0264** | **0.0310** | **0.0365** |
| Random selection | 0.0406 | 0.0449 | 0.0472 |

**MLE L2 at vpi=12:**

| Config | α=0.5 | α=1.0 | α=1.5 |
|--------|-------|-------|-------|
| Likert 5pt | 0.0171 | 0.0186 | 0.0211 |
| Likert 7pt | 0.0118 | 0.0133 | 0.0158 |
| Likert 9pt | 0.0103 | 0.0110 | 0.0121 |
| Likert 21pt | 0.0073 | 0.0081 | 0.0087 |
| Continuous | **0.0069** | **0.0078** | **0.0090** |

### 8b. Key findings

**1. MLE dramatically outperforms spectral for cardinal recovery.**
At vpi=12 with continuous scoring, MLE L2 = 0.0078 vs spectral L2 = 0.0310 (α=1.0). That's a 4x gap.
With Likert, the gap shrinks to 2x (0.0186 vs 0.0368).

**2. Likert granularity is the biggest lever for MLE.**
Going from 5-point to 7-point Likert improves MLE L2 by ~30% across all α.
9-point gives another ~15%. 21-point ≈ continuous.
Spectral is barely affected by granularity (0.0368 → 0.0339 from 5pt → 7pt).

**3. Active selection barely matters for MLE.**
With Likert: active=0.0186 vs random=0.0190 at α=1.0/vpi=12.
MLE benefits from *any* data; strategic selection gives marginal improvement.
Active selection's main value is for the spectral method's ordinal accuracy.

**4. Spectral has a permanent ~20-60% L2 overhead vs MLE.**
At vpi=96+ with continuous scoring: spectral plateaus at 0.0049, MLE at 0.0041 (α=1.0).
This is the eigenvector normalization cost — structural, not fixable by more data.
With anneal, the gap narrows (0.0049 vs 0.0041) but doesn't close.

**5. Unidirectional flow is bad for spectral L2 (3-5x worse) but doesn't affect MLE.**
Spectral L2 goes from 0.037 to 0.110 at α=1.0/vpi=12 with unidirectional.
MLE L2 is unchanged (0.019 either way).

**6. Anneal helps spectral spread without hurting MLE.**
Spectral spread at vpi=96: 0.83x (fixed) → 0.94x (anneal).
MLE doesn't use pseudocounts, so prior mode only affects it via selection quality.

### 8c. Asymptotic behavior (continuous, α=1.0)

| vpi | Spectral (fixed) | Spectral (anneal) | MLE |
|-----|-------------------|-------------------|------|
| 12 | 0.0326 | 0.0309 | 0.0079 |
| 24 | 0.0214 | 0.0202 | 0.0050 |
| 48 | 0.0060 | 0.0049 | 0.0041 |
| 96 | 0.0060 | 0.0049 | 0.0041 |
| 192 | 0.0060 | 0.0049 | 0.0041 |

Both plateau around vpi=48. Spectral's residual is from eigenvector normalization.

### 8d. Root cause: spectral is sensitive to coverage imbalance, MLE is not

Tested spectral vs MLE with complete pair coverage (every pair compared equally K times) vs random selection (some pairs observed more, others less), at same total vpi. Continuous scoring, α=1.0, N=20, 30 trials averaged.

| Coverage | vpi | L2 spectral | L2 MLE | Ratio |
|----------|-----|-------------|--------|-------|
| complete | 10 | 0.00860 | 0.00850 | 1.0x |
| random | 10 | 0.05111 | 0.00837 | 6.1x |
| complete | 19 | 0.00595 | 0.00552 | 1.1x |
| random | 19 | 0.03879 | 0.00599 | 6.5x |
| complete | 76 | 0.00355 | 0.00297 | 1.2x |
| random | 76 | 0.01990 | 0.00309 | 6.4x |

**Key insight: with equal pair coverage, spectral ≈ MLE (1.0-1.2x ratio).**
**With unequal coverage, spectral is 6-7x worse, while MLE is unaffected.**

MLE L2 is essentially identical regardless of coverage pattern.
Spectral L2 is 6x worse with unequal coverage because it propagates observation imbalances through the transition matrix.
An over-observed item gets its eigenvector weight distorted, and that distortion cascades to neighbors.

This explains why MLE with random sampling outperforms spectral with active selection for L2:
the "wasted comparisons" argument applies to ordinal accuracy but not cardinal accuracy.
For L2, the estimator's robustness to coverage imbalance matters more than which pairs are selected.

### 8e. Crossover analysis: when does spectral beat MLE?

Spectral with pseudocounts beats MLE at vpi < 1.0 (continuous, α=1.0, N=20, random selection, 50 trials):

| votes | vpi | L2 spectral | L2 MLE | winner |
|-------|-----|-------------|--------|--------|
| 5 | 0.3 | 0.125 | 0.313 | spectral |
| 10 | 0.5 | 0.123 | 0.206 | spectral |
| 15 | 0.8 | 0.117 | 0.141 | spectral |
| 20 | 1.0 | 0.112 | 0.106 | **MLE** |
| 40 | 2.0 | 0.091 | 0.036 | MLE |
| 120 | 6.0 | 0.061 | 0.011 | MLE |

Crossover at vpi ≈ 1.0.
Below that, MLE assigns ~0 to unobserved items (7/20 items unobserved at vpi=0.5).
Spectral's pseudocount prior (uniform 1/N) is closer to truth for unobserved items.

This isn't spectral being a better estimator — it's MLE lacking regularization.
A regularized MLE (Bayesian prior or Laplace smoothing) would likely dominate at all vpi.

### 8f. Why spectral loses: error propagation through the graph

With noiseless BT data (σ=0) and complete pair coverage:
- MLE achieves L2 = 0.000000 (exact recovery)
- Spectral achieves L2 = 0.001361 (ε=0.001 tolerance residual)

With noisy data and complete coverage, ratio grows from 1.04x (K=1) to 1.31x (K=64).
This is NOT coverage imbalance — it's the transition matrix mixing errors between items.

Item A's spectral weight depends on all items A connects to, and *their* connections.
Noise in the B-C comparison affects A's weight even if A was never compared to B or C.
MLE avoids this: θ_i depends only on i's direct comparisons.

With incomplete coverage (random selection), this effect amplifies 6-7x:
- Complete vpi=19: spectral/MLE = 1.1x
- Random vpi=19: spectral/MLE = 6.5x

### 8g. When are spectral and MLE equivalent?

Binary outcomes, N=10, α=1.0, 200 trials averaged.

| Condition | Spec/MLE ratio | max|diff| |
|-----------|----------------|-----------|
| Complete + equal K + binary | **1.00x** | 0.006 |
| Complete + unequal K per pair | 1.38x | 0.032 |
| Complete + unequal item obs | 1.28x | 0.065 |
| Random selection (incomplete) | 1.05x | 0.036 |
| Complete + equal K + fractional | 1.15x | 0.001 |

**Equivalence requires all three:** complete graph, equal K per pair, binary scores.

Breaking each condition:
- **Unequal K per pair** (largest factor): spectral's row normalization overweights heavily-compared partners.
- **Fractional scores**: Rank Centrality proof assumes binary. Fractional flow doesn't correspond to BT MLE first-order conditions.
- **Unequal item observations**: row normalization means differently-observed items get differently-weighted averages.

At N=20+ with random/active selection, all three violations compound to 6-7x.

### 8h. Spectral has structural bias on non-complete graphs

Tested graph topologies where transitive inference is needed.
Binary outcomes, N=10, α=1.0, 300 trials averaged.

**Chain graph (only adjacent pairs compared):**

| K/edge | L2 spectral | L2 MLE | ratio |
|--------|-------------|--------|-------|
| 5 | 0.344 | 0.371 | 0.93x (spectral wins) |
| 10 | 0.240 | 0.242 | 0.99x (tie) |
| 20 | 0.172 | 0.164 | 1.04x |
| 100 | 0.116 | 0.071 | 1.63x |
| 200 | 0.106 | 0.049 | 2.16x (MLE wins) |

**Two cliques connected by a bridge:**

| K on bridge | L2 spectral | L2 MLE | ratio |
|-------------|-------------|--------|-------|
| 1 | 0.128 | 0.299 | **0.43x (spectral 2.3x better)** |
| 5 | 0.124 | 0.131 | 0.94x |
| 20 | 0.098 | 0.091 | 1.07x |
| 100 | 0.147 | 0.075 | 1.96x |

**Two regimes:**
- Low data per edge: spectral wins (noise dominates, spectral's bias is smaller than MLE's variance)
- High data per edge: MLE wins (noise averages out, spectral's structural bias remains)

**Proof that spectral bias is structural (not noise):**
Noiseless chain graph (score = exact BT probability):
- MLE: L2 = 0.000000 (exact recovery at K=1)
- Spectral: L2 = 0.096370 (permanent, unchanged at K=1000)

The Markov chain stationary distribution ≠ BT weights on non-complete graphs.
Spectral compresses the highest-weight item (0.182 → 0.093) and inflates middle items.
This is a bias-variance tradeoff: spectral's bias provides implicit regularization at low data, but becomes the bottleneck at high data.

### 8i. Design implications

The path to better L2 is:
1. **Use MLE (Bradley-Terry MM) for final scoring.** This is the single biggest improvement — 2-4x L2 reduction depending on scoring mode.
2. **Use finer scoring granularity.** 7-point Likert gives ~30% MLE improvement over 5-point.
3. **Keep spectral for active selection.** It provides excellent ordinal rankings for pair prioritization.
4. **Anneal helps spectral spread recovery** if spectral output is also needed.

The recommended architecture: hybrid spectral+MLE.
Spectral drives pair selection (ordinal-optimal), MLE produces final weights (cardinal-optimal).

## Phase 9: Rank Centrality Normalization

Date: 2026-04-06.

### 9a. Root cause of spectral bias: step-by-step

Traced through the exact matrix construction on a 3-node chain (C--B--A, true weights 1:2:3).
With 1000 noiseless observations per pair, spectral outputs A=0.375, B=**0.500**, C=0.125 — wrong ordering.

The mechanism:
1. Raw flow matrix accumulates bidirectional flow per pair.
2. Self-loop (diagonal) is set to column sum — total incoming flow per node.
B receives flow from two neighbors (600+667=1267), A and C from one each.
3. Row normalization divides each row by its sum. B's row sums to 2000, A and C to 1000.
B→A transition (raw 600) becomes 600/2000=0.30, while A→B (raw 400) becomes 400/1000=0.40.
4. The random walk gets "stuck" at B because its self-loop retention is proportionally larger.

The bias is structural: high-degree nodes retain more probability mass per step.
On complete graphs all degrees are equal, so it cancels. On incomplete graphs it doesn't.

### 9b. Rank centrality formulation eliminates the bias

The rank centrality approach (Negahban et al.) builds the transition matrix differently:
- For each observed pair (i,j): `T[i][j] = P(j beats i) / d_max`
- Diagonal: `T[i][i] = 1 - sum(off-diagonal)`

Where d_max is the maximum node degree (constant across all nodes).
Each pair contributes equally regardless of node degree.

**Noiseless 3-node chain**: rank centrality recovers exact weights (A=0.500, B=0.333, C=0.167).

**N=20, noiseless, varying coverage**:

| Coverage | Current L2 | Rank centrality L2 |
|----------|-----------|-------------------|
| 20% | 0.095 | 0.000 |
| 50% | 0.045 | 0.000 |
| 80% | 0.026 | 0.000 |
| 100% | 0.000 | 0.000 |

### 9c. Noisy results: rank centrality ≈ MLE

N=20, σ=0.15, 5-point Likert, 10 trials, random selection:

| α | Coverage | Current | Rank centrality | MLE |
|---|----------|---------|-----------------|-----|
| 1.0 | 30% K=2 | 0.087 | 0.043 | 0.043 |
| 1.0 | 30% K=10 | 0.083 | 0.024 | 0.024 |
| 1.0 | 50% K=2 | 0.059 | 0.024 | 0.023 |
| 1.0 | 100% K=10 | 0.013 | 0.013 | 0.010 |

Rank centrality matches MLE on incomplete graphs. At 100% coverage it equals current spectral.

### 9d. Active selection is redundant with rank centrality

N=30, α=1.0, σ=0.15, 10 trials, RMSE:

| VPI | Random+RC | Active+RC | MLE |
|-----|-----------|-----------|-----|
| 5 | 0.0039 | 0.0042 | 0.0041 |
| 10 | 0.0031 | 0.0030 | 0.0029 |
| 15 | 0.0028 | 0.0027 | 0.0025 |

Random selection performs the same or better than active selection under rank centrality.
Active selection was primarily compensating for the flow normalization's degree bias by pushing toward complete coverage.
With the bias eliminated, the coverage push is unnecessary.

### 9e. Unidirectional encoding is incompatible

N=30, α=1.0, σ=0.15, 10 trials, RMSE:

| VPI | flow+bidir | flow+unidir | RC+bidir | RC+unidir | MLE |
|-----|-----------|-------------|----------|-----------|-----|
| 5 | 0.0113 | 0.0347 | **0.0039** | 0.0332 | 0.0041 |
| 10 | 0.0084 | 0.0344 | **0.0031** | 0.0333 | 0.0029 |
| 20 | 0.0062 | 0.0384 | **0.0026** | 0.0377 | 0.0023 |

Unidirectional RMSE is ~0.03-0.05 and doesn't improve with data.
It discards half the signal, leaving many cell pairs with zero flow in one direction.
**Bidirectional + rank centrality is the clear winner.**

### 9f. Scaling to large graphs (N=30 to N=500)

α=1.0, σ=0.15, bidirectional, random selection, 3 trials, RMSE:

| N | VPI | Coverage | Flow | RC | MLE | RC/MLE |
|---|-----|----------|------|-----|-----|--------|
| 30 | 5 | 34.5% | 0.0116 | 0.0042 | 0.0041 | 1.02 |
| 100 | 5 | 10.1% | 0.0039 | 0.0016 | 0.0017 | 0.93 |
| 200 | 5 | 5.0% | 0.0018 | 0.0008 | 0.0008 | 0.97 |
| 500 | 5 | 2.0% | 0.0007 | 0.0004 | 0.0036 | 0.10 |
| 100 | 20 | 40.4% | 0.0019 | 0.0008 | 0.0007 | 1.09 |
| 500 | 20 | 8.0% | 0.0004 | 0.0002 | 0.0002 | 1.31 |

- RC is 2-4x better than flow normalization at every scale.
- At very sparse coverage (2%), RC beats MLE — MLE's optimizer becomes unstable with few constraints per parameter.
- At moderate coverage (8-40%), MLE has a slight edge (10-30%).
- RC is the most robust spectral method across all regimes.

### 9g. Implementation

Added `normalization: 'flow' | 'rankCentrality'` option to `PowerRankerOptions`.
Change is self-contained to the `powerMethod` function in `PowerRanker.ts`.
Default is `'flow'` for backward compatibility.

### 9h. Revised design implications

1. **Rank centrality is the recommended normalization** for spectral ranking.
It eliminates structural degree bias with no meaningful downside.
2. **Bidirectional encoding is required.** Unidirectional is incompatible with both normalization modes.
3. **Active selection provides marginal value** once rank centrality removes the degree bias.
Random selection is sufficient for cardinal accuracy.
4. **MLE remains slightly better at moderate-high coverage** but RC is more robust at the extremes.

## Reproduction

```bash
# Baseline
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 3 --ssize 12 --sigma 1 --prior 1 --trials 50 --seed 42

# Recommended (both metrics)
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 3 --ssize 12 --sigma 1 --prior 1 --select "coverage,proximity" --trials 50 --seed 42

# Ordinal-only
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 3 --ssize 12 --sigma 1 --prior 1 --flow unidirectional --select "coverage,proximity" --trials 50 --seed 42
```
