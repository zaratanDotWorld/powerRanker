# Research: Spectral Pairwise Ranking

Summary of findings from simulation experiments on PowerRanker's weight recovery properties.
See `LOG.md` for the chronological experiment record.

## Two Problem Settings

PowerRanker serves two distinct use cases with different optimal configurations.

**Estimation** recovers latent true weights from noisy pairwise observations (e.g., judges scoring items in a competition).
Votes are noisy measurements.
Graph structure is a sampling artifact.
Recommended: bidirectional + rank centrality, k=0.

**Aggregation** constructs weights from intentional votes (e.g., a coliving house prioritizing chores).
No ground truth exists.
Voting is intentional and corrective.
Graph structure is meaningful signal.
Recommended: unidirectional + flow normalization, low k.

## Normalization

The choice of transition matrix normalization is the single most impactful design decision.

### Flow normalization (PageRank-style)

Sets diagonal to column sums, then row-normalizes.
Preserves vote accumulation (more votes = more influence).
Has degree-dependent bias on incomplete graphs: high-degree nodes retain more probability mass per step, inflating their weight independent of vote direction.
On complete graphs, all degrees are equal, so the bias cancels.

### Rank centrality (Negahban et al., 2017)

For each pair, computes the win fraction and divides by `d_max` (the maximum node degree).
Each pair contributes equally regardless of node degree.
Eliminates the structural bias entirely.

On a 3-node chain graph with noiseless data, flow normalization gives the wrong ordering.
Rank centrality recovers exact weights.

### Empirical comparison

Rank centrality matches MLE accuracy across all coverage levels, with 2-4x improvement over flow normalization on incomplete graphs.
At very sparse coverage (2%), rank centrality actually beats MLE (the optimizer becomes unstable with few constraints per parameter).

| N | VPI | Coverage | Flow L2 | RC L2 | MLE L2 |
|---|-----|----------|---------|-------|--------|
| 30 | 5 | 34% | 0.0116 | 0.0042 | 0.0041 |
| 100 | 5 | 10% | 0.0039 | 0.0016 | 0.0017 |
| 500 | 5 | 2% | 0.0007 | 0.0004 | 0.0036 |

### Why flow normalization exists

PageRank and pairwise ranking are different problems.
In web search, the link graph IS the data: degree inflation is the signal, not a bug.
In pairwise ranking, the graph is a sampling artifact: degree is noise.
Applying the PageRank template to pairwise ranking inherits a bias that was a feature in the original context.

### Normalization and aggregation

For aggregation, flow normalization's preservation of vote accumulation is the desired property.
10 people voting "Dishes > Trash" should move the allocation more than 1 person voting.
Rank centrality normalizes each pair to a win fraction, discarding observation counts.
This is a genuine design tension with no clean resolution: flow preserves accumulation but introduces degree bias, RC eliminates bias but discards accumulation.

## Bayesian Prior

The prior (`k = priorC / N`) adds uniform pseudocounts to all off-diagonal entries.

### Interaction with normalization

With flow normalization, the prior fills in the graph (making it complete), which masks the degree-dependent bias.
Optimal `priorC` is ~2 across most conditions, improving L2 by 5-38%.

With rank centrality, the prior actively hurts.
Any nonzero prior makes the graph artificially complete, defeating the sparse-graph normalization that rank centrality provides.
Optimal `priorC` is 0 in most conditions.
A tiny prior (0.01) helps only with disconnected graphs or extreme noise.

| Condition | Flow (best prior) | RC (k=0) |
|-----------|-------------------|----------|
| Medium skew | L2=0.0517, ρ=0.878 | L2=0.0432, ρ=0.922 |
| High skew | L2=0.0590, ρ=0.929 | L2=0.0497, ρ=0.955 |
| Dense data | L2=0.0362, ρ=0.942 | L2=0.0296, ρ=0.961 |

RC with no prior beats flow with its best prior in every tested condition.

### Prior for aggregation

In a small group with sparse comparisons, a single vote can dominate a pair's flow.
The prior controls the inertia/responsiveness tradeoff.
Natural stabilization may come from accumulation: as more votes exist, each new vote is a smaller fraction of total flow.
This suggests a low prior with stability emerging from voting history, rather than imposed artificially.

## Spectral vs MLE

### When spectral wins

At very low data (vpi < 1), spectral's implicit regularization (pseudocounts, self-loop structure) beats MLE, which assigns ~0 to unobserved items.
At very sparse coverage (2%), spectral also wins because MLE's optimizer becomes unstable.

### When MLE wins

MLE outperforms spectral for cardinal accuracy (L2) by 2-4x at moderate data.
The gap widens with more data and finer scoring granularity.

The root cause: spectral propagates observation imbalances through the transition matrix.
With equal pair coverage, spectral matches MLE (1.0-1.2x ratio).
With unequal coverage (the realistic case), spectral is 6-7x worse while MLE is unaffected.

### Structural bias on non-complete graphs

On a chain graph with noiseless data, MLE recovers exact weights at K=1.
Spectral has permanent L2=0.096, unchanged at K=1000.
The Markov chain stationary distribution is not equal to BT weights on non-complete graphs.

This is a bias-variance tradeoff: spectral's bias provides implicit regularization at low data but becomes the bottleneck at high data.

### Practical recommendation

Use spectral (with rank centrality) for ranking and pair selection.
Use MLE for final weight estimation when cardinal accuracy matters.

## Active Selection

### Coverage is the dominant term

Coverage (1/sqrt(1+n)) ensures all items get observed.
At low vpi, this is the binding constraint.
Proximity provides a secondary benefit by resolving ambiguity between adjacent items.
Position (top-bias) hurts at low vpi: it concentrates data on already-well-ranked items, starving lower-ranked items.

### Fisher information term

Fisher information `p(1-p)` from BT estimates is the principled replacement for proximity.
Better at α >= 1.0 (common for real preference data).
Slightly worse at α=0.5 (flat distributions, where all Fisher values are ~0.25).
Advantage grows with more data.

### Active selection is less important with rank centrality

Active selection was primarily compensating for flow normalization's degree bias by pushing toward complete coverage.
With rank centrality, random selection performs the same or better.

## Scoring

### Likert vs continuous

No meaningful difference for ordinal accuracy (Spearman varies by < 0.005).
Likert binning affects cardinal accuracy through Jensen's inequality.

### Likert granularity

5-point Likert is sufficient for spectral.
For MLE, finer scales help: 7-point gives ~30% L2 improvement over 5-point.

## Flow Direction

Bidirectional records both directions of each vote.
Unidirectional only records the dominant direction (0.5 maps to 0, i.e., ties are no-ops).

### For estimation

Unidirectional slightly improves Spearman (+0.005 to +0.034) but nearly triples L2.
Bidirectional is required for rank centrality normalization.
Unidirectional is incompatible with rank centrality (RMSE ~0.03-0.05 and doesn't improve with data).

### For aggregation

Unidirectional is correct: a vote of "Dishes > Trash" is a directional correction with no implicit counter-flow toward Trash.
An "equal" vote carries no directional information and should be a no-op.

## Self-Loop Construction

Column-sum self-loops (`F[i][i] = sum of column i`) are essential.
They encode "how much others prefer this item" as self-retention probability.
On a complete graph with equal observations per pair, column-sum self-loops produce a matrix identical to the Rank Centrality formulation.
Alternatives (row-sum, no self-loop) lose 0.07-0.22 Spearman.

## Convergence Tolerance

The default ε=0.001 acts as early stopping / implicit regularization.
Tighter ε (1e-8) makes both Spearman and L2 slightly worse in the noisy regime.
The eigenvector of a noisy transition matrix overfits if solved too precisely.

## Recommended Configurations

| Setting | Flow | Normalization | Selection | Prior | Scoring |
|---------|------|---------------|-----------|-------|---------|
| Estimation | bidirectional | rankCentrality | random | k=0 | any |
| Aggregation | unidirectional | flow | intentional | low k | 5-point Likert |

## References

- Negahban, Oh, Shah (2017). "Rank Centrality: Ranking from Pairwise Comparisons." *Operations Research*.
- Bradley, Terry (1952). "Rank Analysis of Incomplete Block Designs."
- Hunter (2004). "MM algorithms for generalized Bradley-Terry models."
- Keener (1993). "Spectral ranking for sports tournaments."
