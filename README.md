[![CircleCI](https://dl.circleci.com/status-badge/img/gh/zaratanDotWorld/powerRanker/tree/main.svg?style=svg)](https://dl.circleci.com/status-badge/redirect/gh/zaratanDotWorld/powerRanker/tree/main)
[![npm version](https://badge.fury.io/js/power-ranker.svg)](https://badge.fury.io/js/power-ranker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# powerRanker

Multipurpose Power Ranker implementation for determining probability distributions over sets of items based on weighted pairwise preference inputs. [Chore Wheel](https://github.com/zaratanDotWorld/choreWheel) spin-off.

---

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Installation

Installation is simple with `npm`:

```
>> npm install --save power-ranker
```

## Usage

```
const { PowerRanker } = require('power-ranker');

const items = new Set([ 'a', 'b', 'c' ]);
const powerRanker = new PowerRanker({ items });

powerRanker.addPreferences([
  { target: 'a', source: 'b', value: 1 },
  { target: 'b', source: 'c', value: 1 },
]);

const results = powerRanker.run();

// a -> 0.5038945471248252)
// b -> 0.31132043857597014)
// c -> 0.18478501429920438)
```

## API

#### `constructor({ items: Set<string>, options: Object }): PowerRanker`
- **Description**: Initialize a new instance of PowerRanker
- **Parameters**:
  - `items`: A set of strings describing the items being compared
  - `options`: An optional options object containing additional configuration
- **Returns**: An initialized PowerRanker

#### `addPreferences(preferences: Array<preference>)`
- **Description**: Add preferences to the ranker
- **Parameters**:
  - `preferences`: An array of preference objects `{ target: string, source: string, value:float }`

 Note that a preference value must be between 0 and 1

 #### `run({ d:float, epsilon:float, nIter:int }): Map<string, float>`
- **Description**: Generates rankings using the given preferences
- **Parameters**:
  - `d`: The "damping factor" which regularizes the output, must be between 0 and 1 with 1 being no damping
  - `epsilon`: A sensitivity used to determine when the algorithm stops running, normally a very small number
  - `nIter`: A maximum number of iterations to run the algorithm
- **Returns**: A map of the rankings
 
Note that `epsilon` and `nIter` come with sensible defaults and normally will not need to be explicitly passed

## License

This project is licensed under the [MIT License](https://en.wikipedia.org/wiki/MIT_License) - see LICENSE.txt for details.

## Acknowledgements

The authors would like to acknowledge [Gitcoin](https://www.gitcoin.co/) and [Metagov](https://metagov.org/) for helping fund the development of this project.
