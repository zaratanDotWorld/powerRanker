# Simulation Harness

Simulation and analysis tools for studying PowerRanker's weight recovery properties.

## Two Problem Settings

PowerRanker serves two distinct use cases with different optimal configurations.

### Estimation

Recovering latent true weights from noisy pairwise observations (e.g., judges scoring items in a competition).

- Latent true weights exist; votes are noisy measurements.
- Graph structure is a sampling artifact.
- **Recommended: bidirectional + rank centrality normalization.**
- Random pair selection is sufficient; active selection provides marginal benefit.

### Aggregation

Constructing weights from intentional votes (e.g., a coliving house prioritizing chores).

- No ground truth; weights reflect group consensus.
- Voting is intentional and corrective — people vote only when they feel something is mispriced.
- Graph structure is meaningful signal (more votes = stronger group preference).
- **Recommended: unidirectional + flow normalization.**
- Open question: flow normalization introduces degree-dependent distortion, but alternatives (rank centrality) discard vote accumulation, which is the core signal.

## Key Finding: Rank Centrality

The default flow normalization (diagonal = column sum, then row-normalize) inflates weights for high-degree nodes on incomplete graphs.
This is a structural bias, not a noise artifact — it persists even with infinite noiseless observations.

Rank centrality (Negahban et al., 2017) fixes this by normalizing per-pair win fractions by a global constant (d_max) instead of per-row sums.
Result: spectral accuracy matches MLE across all coverage levels, with 2-4x improvement over flow normalization on incomplete graphs.

See `RESEARCH.md` for the full analysis, including a step-by-step derivation on a 3-node chain graph.

## Recommended Configurations

| Setting | Flow mode | Normalization | Selection | Prior |
|---------|-----------|---------------|-----------|-------|
| Estimation | bidirectional | rankCentrality | random | k=0 |
| Aggregation | unidirectional | flow | intentional | low k |

## Directory Structure

```
sim/
  simulate.ts       — main simulation runner
  sweep.ts          — parameter sweep runner
  mle.ts            — Bradley-Terry MLE (MM algorithm)
  metrics.ts        — accuracy metrics (Spearman, RMSE, L1, L2)
  utils.ts          — shared utilities (PRNG, weight generation, score drawing)
  types.ts          — shared type definitions
  posthoc.ts        — post-hoc correction methods
  plots/            — output figures
  scripts/          — one-off experiment and analysis scripts
```

## Shared Utilities

### `sim/utils.ts` — PRNG and vote simulation

```ts
import { mulberry32, generateGroundTruth, gaussianVariate, drawScore, drawBinary } from './utils.js';
```

- `mulberry32(seed)` — seeded PRNG returning `() => number` in [0, 1).
- `generateGroundTruth(n, alpha)` — power-law weight vector, normalized to sum to 1.
- `gaussianVariate(rng)` — standard normal draw via Box-Muller.
- `drawScore(wA, wB, sigma, rng, likertPoints?)` — logit-normal noisy BT score.
Omit `likertPoints` for continuous; pass e.g. `5` for 5-point Likert.
- `drawBinary(wA, wB, rng)` — noiseless BT coin flip (1.0 or 0.0).

### `sim/metrics.ts` — accuracy metrics

```ts
import { spearman, rmse, l1Error, l2Error, rankArray, avg, median } from './metrics.js';
```

- `spearman(a, b)` — Spearman rank correlation.
- `rmse(truth, recovered)` — root mean squared error.
- `l1Error(truth, recovered)` — L1 (Manhattan) distance.
- `l2Error(truth, recovered)` — L2 (Euclidean) distance.
- `rankArray(arr)` — descending rank assignment.
- `avg(arr)`, `median(arr)` — basic aggregation.

## Running Simulations

```bash
# Basic run (30 items, default settings)
npx tsx sim/simulate.ts --items 30 --alpha 1.0 --judges 10 --sessions 3 --ssize 12 --sigma 1 --prior 0 --trials 50 --seed 42

# Parameter sweep
npx tsx sim/sweep.ts --config sweep.json

# Individual experiment scripts
npx tsx sim/scripts/chain-3item.ts
```

## Documentation

- `RESEARCH.md` — thematic summary of findings and recommendations.
- `LOG.md` — chronological experiment record.
