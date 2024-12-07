const assert = require('assert');

class AdaptiveSampler {
  variances; // Array[{a:str, b:str, variance:float}]

  /// @notice Construct an instance of a AdaptiveSampler
  /// @param variances:Array[{a:str, b:str, variance:float}] The variances
  constructor ({ variances }) {
    assert(variances.length >= 1, 'AdaptiveSampler: Cannot sample less than one pair');

    this.sumVariance = 0;

    // O(n)
    this.variances = variances
      .map(({ alpha, beta, variance }) => {
        this.sumVariance += variance;
        return { alpha, beta, cumSumVariance: this.sumVariance };
      });
  }

  /// @notice Suggest a pair of items, proportional to the variance
  /// @dev Result is non-deterministic
  /// @return { a, b }: { str, str } The pair of items to vote on
  samplePair () {
    const threshold = Math.random() * this.sumVariance;

    // cumSumVariance increases monotonically
    return this.variances
      .find(({ cumSumVariance }) => cumSumVariance >= threshold);
  }
}

module.exports = AdaptiveSampler;
