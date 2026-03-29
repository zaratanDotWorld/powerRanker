[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# powerRanker

Spectral pairwise ranking with simulation harness.
Determines probability distributions over sets of items based on weighted pairwise preference inputs, using PageRank-style power iteration.
Includes a simulation framework for evaluating convergence behavior under different regimes.

## Usage

```typescript
import { PowerRanker } from './src/index.js';

const items = new Set(['a', 'b', 'c']);
const ranker = new PowerRanker({ items, options: { k: 0.15 } });

ranker.addPreference({ target: 'a', source: 'b', value: 1 });
ranker.addPreference({ target: 'b', source: 'c', value: 1 });

const rankings = ranker.run();
// a -> 0.650, b -> 0.256, c -> 0.093
```

### Options

- `k` - Bayesian pseudocount for regularization (typically `C / N` where C is prior strength)
- `flow` - `'bidirectional'` (default) or `'unidirectional'`. Bidirectional records both directions of each vote; unidirectional only records the dominant direction.
- `verbose` - Enable convergence logging

### Active Pair Selection

```typescript
// Select pairs for the next round of voting
const pairs = ranker.activeSelect({
  num: 10,                                      // how many pairs
  terms: ['coverage', 'proximity', 'position'],  // which signals to use
  r: 0.9,                                        // regularization (0=uniform, 1=full)
  exclude: alreadyJudgedPairs,                   // skip these
});
```

## Simulation

Run convergence simulations to answer: "how many votes does it take to recover the true ranking?"

```bash
# Basic simulation with convergence curve
npx tsx sim/simulate.ts --items 20 --judges 10 --sessions 3 --ssize 10 --seed 42

# Compare selection strategies
npx tsx sim/simulate.ts --strategy random --items 20 --seed 42
npx tsx sim/simulate.ts --strategy activeSelect --items 20 --seed 42

# Compare flow modes
npx tsx sim/simulate.ts --flow bidirectional --items 20 --seed 42
npx tsx sim/simulate.ts --flow unidirectional --items 20 --seed 42

# JSON output for analysis
npx tsx sim/simulate.ts --items 20 --seed 42 --output json

# Parameter sweep
npx tsx sim/sweep.ts --config sweep.json
```

See [docs/ANALYSIS.md](docs/ANALYSIS.md) for research results and methodology.

## Development

```bash
npm install
npm test                # run tests
npx tsx sim/simulate.ts # run simulation
npx tsx sim/sweep.ts    # run parameter sweep
```

## License

MIT - see LICENSE.txt.

## Acknowledgements

The authors would like to acknowledge [Gitcoin](https://www.gitcoin.co/) and [Metagov](https://metagov.org/) for helping fund the development of this project.
