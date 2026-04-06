/**
 * Post-hoc correction methods for spectral weight estimates.
 *
 * The spectral method's main weakness is spread compression:
 * it biases toward uniform due to finite data + pseudocount.
 * These methods attempt to correct that bias.
 */

/**
 * Fit a power-law curve to spectral weights based on their rank order.
 *
 * Given spectral weights (which have the right ordering but compressed spread),
 * fit w_i = c * rank_i^(-beta) to find the exponent that best matches
 * the spectral weight ratios while expanding the spread.
 *
 * Returns normalized weights summing to 1.
 */
export function powerLawFit(spectralWeights: number[]): number[] {
  const n = spectralWeights.length;

  // Sort indices by spectral weight (descending)
  const ranked = spectralWeights
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w - a.w);

  // Fit log(w) = log(c) - beta * log(rank) via least squares
  // Using rank = 1, 2, ..., n
  const logW: number[] = [];
  const logR: number[] = [];
  for (let r = 0; r < n; r++) {
    if (ranked[r].w > 0) {
      logW.push(Math.log(ranked[r].w));
      logR.push(Math.log(r + 1));
    }
  }

  const m = logW.length;
  const meanLogR = logR.reduce((a, b) => a + b, 0) / m;
  const meanLogW = logW.reduce((a, b) => a + b, 0) / m;

  let num = 0;
  let den = 0;
  for (let i = 0; i < m; i++) {
    num += (logR[i] - meanLogR) * (logW[i] - meanLogW);
    den += (logR[i] - meanLogR) ** 2;
  }
  const beta = den > 0 ? -(num / den) : 0; // Negative because weight decreases with rank

  // Generate power-law weights
  const raw = Array.from({ length: n }, (_, r) => Math.pow(r + 1, -beta));
  const sum = raw.reduce((a, b) => a + b, 0);

  // Map back to original indices
  const result = new Array(n);
  for (let r = 0; r < n; r++) {
    result[ranked[r].i] = raw[r] / sum;
  }
  return result;
}

/**
 * Isotonic regression + spread correction.
 *
 * Takes spectral weights and stretches the spread by a factor,
 * while preserving the ordering and sum-to-1 constraint.
 * The stretch is applied in log-space around the mean.
 */
export function spreadCorrection(spectralWeights: number[], targetSpreadRatio: number): number[] {
  const n = spectralWeights.length;
  const logW = spectralWeights.map((w) => Math.log(Math.max(w, 1e-15)));
  const meanLog = logW.reduce((a, b) => a + b, 0) / n;

  // Current spread in log-space
  const currentLogSpread = Math.max(...logW) - Math.min(...logW);
  if (currentLogSpread === 0) return [...spectralWeights];

  // Stretch in log-space
  const stretched = logW.map((lw) => meanLog + (lw - meanLog) * targetSpreadRatio);
  const raw = stretched.map((lw) => Math.exp(lw));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}
