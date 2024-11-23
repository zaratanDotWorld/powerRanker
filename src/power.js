const assert = require('assert');
const linAlg = require('linear-algebra')();

class PowerRanker {
  items; // Set(str)
  matrix; // linAlg.Matrix
  verbose; // bool

  /// @notice Construct an instance of a PowerRanker
  /// @param items:Set(str) The items being voted on
  /// @param numParticipants:int The number of participants
  /// @param preferences:Array[{target:str, source:str, value:float}] The preferences of the participants
  constructor ({ items, numParticipants, preferences, verbose = false }) {
    assert(items.size >= 2, 'PowerRanker: Cannot rank less than two items');

    this.items = items;
    this.verbose = verbose;

    this.matrix = this._toMatrix(items, preferences, numParticipants);

    this.log('Matrix initialized');
  }

  log (msg) {
    /* istanbul ignore next */
    if (this.verbose) { console.log(msg); }
  }

  /// @notice Run the algorithm and return the results
  /// @param d:float The damping factor, 1 means no damping
  /// @param epsilon:float The precision at which to run the algorithm
  /// @param nIter:int The maximum number of iterations to run the algorithm
  /// @return rankings:Map(int => float) The rankings, with item mapped to result
  run ({ d = 1, epsilon = 0.001, nIter = 1000 }) {
    const weights = this._powerMethod(this.matrix, d, epsilon, nIter);
    return this._applyLabels(this.items, weights);
  }

  // Internal

  // O(items)
  _applyLabels (items, eigenvector) {
    const itemMap = this.#toitemMap(items);
    assert(itemMap.size === eigenvector.length, 'Mismatched arguments!');
    itemMap.forEach((ix, item) => itemMap.set(item, eigenvector[ix]));
    return itemMap;
  }

  // O(preferences)
  _toMatrix (items, preferences, numParticipants) { // [{ target, source, value }]
    const n = items.size;
    const itemMap = this.#toitemMap(items);

    // Initialise the zero matrix;
    let matrix = linAlg.Matrix.zero(n, n);

    // Add implicit neutral preferences
    const implicitPref = (1 / numParticipants) / 2; // Halve the value since used twice
    matrix = matrix
      .plusEach(1).minus(linAlg.Matrix.identity(n))
      .mulEach(implicitPref).mulEach(numParticipants);

    // Add the preferences to the off-diagonals, removing the implicit neutral preference
    // Recall that value > 0.5 is flow towards, value < 0.5 is flow away
    preferences.forEach((p) => {
      const targetIx = itemMap.get(p.target);
      const sourceIx = itemMap.get(p.source);
      matrix.data[sourceIx][targetIx] -= implicitPref;
      matrix.data[targetIx][sourceIx] -= implicitPref;

      // We only record the dominant preference
      if (p.value >= 0.5) {
        matrix.data[sourceIx][targetIx] += p.value;
      } else {
        matrix.data[targetIx][sourceIx] += (1 - p.value);
      }
    });

    // Add the diagonals (sums of columns)
    this.#sumColumns(matrix).map((sum, ix) => matrix.data[ix][ix] = sum); // eslint-disable-line no-return-assign
    return matrix;
  }

  // O(n^3)-ish
  _powerMethod (matrix, d, epsilon, nIter) {
    assert(matrix.rows === matrix.cols, 'Matrix must be square!');
    const n = matrix.rows;

    // Normalize matrix
    matrix = matrix.clone(); // Make a copy for safety
    matrix.data = matrix.data
      .map((row) => {
        const rowSum = this.#sum(row);
        return row.map(x => x / rowSum);
      });

    // Add damping factor
    matrix.mulEach_(d);
    matrix.plusEach_((1 - d) / n);

    // Initialize eigenvector to uniform distribution
    let eigenvector = linAlg.Vector.zero(n)
      .plusEach(1.0 / n);

    // Power method
    let prev = eigenvector;
    for (var i = 0; i < nIter; i++) { // eslint-disable-line no-var
      eigenvector = prev.dot(matrix);
      if (this.#norm(eigenvector.minus(prev).data[0]) < epsilon) break;
      prev = eigenvector;
    }

    this.log(`Eigenvector convergence after ${i} iterations`);
    return eigenvector.data[0];
  }

  // Private

  #toitemMap (items) { // { id }
    return new Map(
      Array.from(items)
        .sort((a, b) => a - b) // Javascript is the worst
        .map((item, ix) => [ item, ix ]), // ItemName -> MatrixIdx
    );
  }

  #norm (array) {
    return Math.sqrt(this.#sum(array.map(x => x * x)));
  }

  #sum (array) {
    return array.reduce((sumSoFar, val) => sumSoFar + val, 0);
  }

  #sumColumns (matrix) {
    return matrix.trans().data.map(col => this.#sum(col));
  }
}

module.exports = PowerRanker;
