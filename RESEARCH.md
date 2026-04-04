# PowerRanker Research

This document captures the research history, current algorithm design, and open questions for PowerRanker.
It is intended as a briefing for future sessions so new conversations can pick up momentum quickly.

## History

PowerRanker is a PageRank-style spectral ranking engine that turns pairwise preference inputs into probability distributions over items.
Research began at Columbia in 2016, was further developed at Colony in 2018, and shipped as the core of Chore Wheel (a cooperative household management system) in 2020.
Chore Wheel has been in continuous production at a 9-person house since September 2022, with 2,500+ claimed chores across 24 lifetime residents.

The broader vision is a "pairwise paradigm" for social choice: converting scarce human attention into robust allocation signals via algorithm selection, active pair selection, interface design, and audience development.
The paradigm is laid out in detail in [The Pairwise Paradigm](http://kronosapiens.github.io/blog/2025/12/14/pairwise-paradigm).

## Algorithm Evolution

The core algorithm takes pairwise preferences, builds a flow matrix, and extracts a stationary distribution via power iteration.
The algorithm has gone through several major revisions, documented in [Reinventing the Wheel](http://kronosapiens.github.io/blog/2026/02/07/reinventing-the-wheel.html).

### Original design (2016-2024)

- Bidirectional preference encoding: a vote of strength s adds s toward the target and (1-s) toward the source
- Implicit preferences of 0.5 in every off-diagonal cell, subtracted proportionally as real preferences arrive
- Fixed PageRank damping factor applied after row-normalization
- Damping and implicit preferences together provided regularization, but were entangled and hard to reason about

### Problems that emerged

1. **Compressed distributions.** Users couldn't push important items high enough. Deep-cleaning a bathroom and watering plants sat too close together.
2. **Opaque causality.** Submitting a clear preference sometimes caused unrelated items to shift, because bidirectional encoding added weight to the less-preferred item.
3. **Semantic violation.** De-prioritizing an item could increase its ranking, since (1-s) flow still went to it.

### From PageRank damping to Bayesian pseudocounts (late 2025)

Several functional damping curves were tried and abandoned.
The core problem: PageRank normalizes rows (erasing magnitude information) then applies damping, but for continuous preferences (unlike binary links), pre-normalization row sums encode meaningful evidence about each item.
Moving regularization before normalization made it possible to replace both implicit preferences and damping with **Bayesian pseudocounts**: a small constant k added to every off-diagonal cell before any data.
As real preferences accumulate, they dominate the pseudocounts naturally.
See [Reinventing the Wheel](http://kronosapiens.github.io/blog/2026/02/07/reinventing-the-wheel.html) for the full research journey.

```
k = C / N    (C = prior strength, N = number of items)
```

Properties:
- Single parameter with clear semantics (strength of uniform prior)
- Scales naturally: more items means weaker per-cell prior, requiring more data to move rankings
- No dependency on number of participants (separation of concerns)
- Net deletion of code vs the old approach
- Statistically principled: equivalent to a Dirichlet prior

### From variance sampling to active selection (Feb-Mar 2026)

The pair selection algorithm went through three approaches over three weeks, developed during a live ranking jam in the daimyo project.

The first approach used **Beta-distribution variance** to find uncertain pairs -- a natural information-theoretic starting point.
This was purely statistical and had no awareness of where items sat in the ranking, leading to path dependence on early votes.

The second iteration added **composable transforms** (coverage, weight) on top of variance.
This improved exploration of unseen items but still couldn't escape early-vote path dependence, because variance stayed high for pairs that happened to be sampled first.

The breakthrough was replacing variance entirely with a **position-aware model** (Mar 13, commit `0744b361` in daimyo).
Three multiplicative terms -- coverage, proximity, position -- have a natural lifecycle: coverage dominates early (explore unseen items), then proximity and position take over (refine close, high-ranked pairs where information gain is highest).

Significant tuning followed: regularization moved from a linear blend (`r*w + (1-r)`) to a **power transform** (`w^r`) which preserves signal ratios at intermediate values; the coverage formula oscillated between `1/(1+n)` and `1/sqrt(1+n)`, settling on sqrt; and the position term was found to be most useful for fresh data, while mid-process re-votes work better with just coverage + proximity.

## Current Algorithm

### Preference encoding

Two flow modes, selectable via `flow` option:

**Bidirectional** (default): a vote with value s adds s toward target and (1-s) toward source.
Every vote contributes 1.0 total weight to the matrix.
Preserves detailed balance: with exact Bradley-Terry probabilities, the stationary distribution is provably proportional to true weights.
Downside: can cause semantic violations where deprioritizing an item inflates it.

**Unidirectional**: a vote with value s is scaled around 0.5 (`scaled = (s - 0.5) * 2`), then only the dominant direction is recorded.
A vote of 0.7 adds 0.4 toward the target; a vote of 0.3 adds 0.4 toward the source; a vote of 0.5 adds nothing.
Avoids the semantic violation but discards information and produces sparser matrices.

### Matrix construction and power iteration

1. Initialize N x N matrix with k in every off-diagonal cell (pseudocount prior)
2. Add preferences according to the chosen flow mode
3. Set each diagonal to its column sum (self-loops encoding total incoming evidence)
4. Row-normalize to get a row-stochastic transition matrix
5. Power iteration to find the stationary distribution

### Active pair selection

`activeSelect` computes a weight for each candidate pair as a product of composable signals:

- **Coverage**: `1/sqrt(1 + nA) * 1/sqrt(1 + nB)` -- favors under-observed items
- **Proximity**: `1/(1 + |posA - posB|)` -- favors items close in current ranking
- **Position**: `1/sqrt(posA * posB)` -- favors items near the top of the ranking

The product is raised to a power `r` (0 = uniform, 1 = full weighting) for regularization.
Pairs are then sampled without replacement proportional to weight.

## Simulation Harness

The `sim/` directory provides tools for evaluating convergence:

- `simulate.ts` -- runs trials with configurable items, judges, sessions, sigma (logit-normal noise), scoring, flow mode, and pair selection strategy
- `sweep.ts` -- cartesian product of parameter arrays for systematic exploration
- `metrics.ts` -- Spearman, Kendall tau, Pearson, L2 error, spread ratio, pair coverage
- Seeded PRNG (mulberry32) for full reproducibility

Key metric: **votes per item (vpi)** -- the average number of pairwise comparisons each item participates in.
This is the natural unit for "how much data do we need?"

## Known Results

See `sim/RESULTS.md` for detailed tables.
Summary:

- **Ordinal accuracy** (Spearman) reaches 0.95 at ~12 vpi for steep distributions (alpha=1.5), ~24 vpi for medium (alpha=1.0)
- **Cardinal accuracy** (spread ratio) is harder: Likert binning introduces systematic bias that more data cannot fix (Jensen's inequality)
- **Active selection** converges faster than random pair selection
- Steeper distributions (higher alpha) are easier to rank because quality gaps are larger

## Open Research Questions

### 1. Bidirectional vs unidirectional flow

**Status:** Both modes are implemented and simulatable. Unidirectional tests now have exact numeric assertions showing the behavioral differences.

**What we know:**
- Bidirectional preserves detailed balance and uses all information from each vote
- Unidirectional avoids the semantic violation (deprioritizing can't inflate) and produces cleaner causal behavior
- With strong preferences (value = 1.0), both modes produce identical results (since `(1-1) = 0` and `(1-0.5)*2 = 1`)
- With mild preferences (value = 0.7), unidirectional produces more separation at the top and less at the bottom, since no reverse flow dilutes the signal

**Questions to answer:**
- Under what data conditions (density, noise, preference strength distribution) does each mode perform better?
- Is there a crossover point in vpi where bidirectional's information advantage outweighs its semantic violation risk?
- In production (Chore Wheel), where preferences tend to be extreme (0 or 1), does the choice matter much at all?
- For continuous-scored settings (e.g. public goods funding with nuanced preferences), which mode produces more legible and stable outputs?

**How to investigate:** Run sweep comparing flow modes across noise levels, preference strength distributions, and vpi levels. Track both ordinal accuracy (Spearman) and cardinal accuracy (spread ratio).

### 2. Active selection refinement

**Status:** Three composable terms (coverage, proximity, position) with power-transform regularization (r).

**What we know:**
- The three terms together with r=0.9 work well empirically
- Coverage is most important early (ensure all items are observed)
- Proximity becomes important later (resolve ambiguity between adjacent items)
- Position provides a top-bias that prioritizes getting the most important items right

**Questions to answer:**
- What is the optimal r value, and does it depend on the stage of data collection (early vs late)?
- Should term weights be dynamic rather than fixed (e.g. shift from coverage-heavy to proximity-heavy as data accumulates)?
- Are there better functional forms for each term? The current forms were chosen for simplicity.
- Is there a principled information-theoretic formulation (e.g. expected information gain per comparison)?
- How does the number of pairs per session (sessionSize) interact with term composition?

**How to investigate:** Sweep over individual terms, pairs of terms, and all three, at different r values and vpi levels. Compare against random selection as baseline. Consider implementing a "staged" selection strategy that shifts weights over time.

### 3. Pseudocount calibration

**Status:** Using `k = C/N` with C=1 as default. The constant C controls prior strength.

**What we know:**
- C=1 works reasonably well across tested configurations
- Too high C compresses rankings (strong prior drowns out data)
- Too low C makes early rankings volatile (not enough regularization)
- In production (Chore Wheel), k was computed as `c * numResidents` where the application knew the number of residents

**Questions to answer:**
- What is the optimal C as a function of items, judges, noise, and preference strength?
- Should C be adaptive (decrease as data accumulates), or is the natural dilution of pseudocounts sufficient?
- Is there a Bayesian-optimal choice of C given assumptions about the underlying distribution?
- How does C interact with flow mode? Unidirectional adds less total weight per vote, so the prior dominates longer.

**How to investigate:** Sweep C across a range (0.1 to 10) at different item counts and vpi levels, tracking convergence curves. Look for a scaling law or rule of thumb.

## Running Experiments

```bash
# Basic simulation
npx tsx sim/simulate.ts --items 20 --judges 10 --sessions 3 --ssize 10 --seed 42

# Compare flow modes
npx tsx sim/simulate.ts --flow bidirectional --items 20 --sigma 1 --seed 42
npx tsx sim/simulate.ts --flow unidirectional --items 20 --sigma 1 --seed 42

# Compare selection strategies
npx tsx sim/simulate.ts --strategy random --items 20 --sigma 1 --seed 42
npx tsx sim/simulate.ts --strategy activeSelect --items 20 --sigma 1 --seed 42

# Parameter sweep
npx tsx sim/sweep.ts --config sweep.json

# JSON output for analysis
npx tsx sim/simulate.ts --items 20 --sigma 1 --seed 42 --output json

# Fine-grained convergence
npx tsx sim/simulate.ts --items 10 --ssize 1 --sessions 30 --sigma 1 --seed 42
```

## Key References

- [The Pairwise Paradigm](http://kronosapiens.github.io/blog/2025/12/14/pairwise-paradigm) -- full framework for pairwise social choice
- [Reinventing the Wheel](http://kronosapiens.github.io/blog/2026/02/07/reinventing-the-wheel.html) -- research journey from damping to pseudocounts
- [Chore Wheel paper](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4856267) -- multi-year production deployment
