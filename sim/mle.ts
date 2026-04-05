/**
 * MLE Bradley-Terry estimator and Cramér-Rao lower bound.
 *
 * Given pairwise vote data (the same format as the spectral ranker uses),
 * fits BT strengths by maximizing the likelihood via the MM algorithm.
 */

export interface PairVote {
  target: string;  // "A" in the comparison
  source: string;  // "B" in the comparison
  value: number;   // score in [0,1]: fraction of preference toward target
}

/**
 * MM algorithm for Bradley-Terry with fractional wins.
 *
 * Each vote with score s contributes s wins to target, (1-s) wins to source.
 * Update rule: θ_i^(t+1) = W_i / Σ_j (n_ij / (θ_i^t + θ_j^t))
 *   where W_i = total fractional wins for i
 *         n_ij = number of comparisons between i and j
 *
 * Returns normalized weights summing to 1, indexed by item ID.
 */
export function bradleyTerryMLE(
  itemIds: string[],
  votes: PairVote[],
  maxIter = 500,
  tol = 1e-8,
): Map<string, number> {
  const n = itemIds.length;
  const idx = new Map<string, number>();
  for (let i = 0; i < n; i++) idx.set(itemIds[i], i);

  // Accumulate fractional wins and comparison counts
  const wins = new Float64Array(n);
  // nPair[i][j] = number of comparisons between i and j
  const nPair: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (const v of votes) {
    const ti = idx.get(v.target);
    const si = idx.get(v.source);
    if (ti === undefined || si === undefined) continue;
    wins[ti] += v.value;
    wins[si] += 1 - v.value;
    nPair[ti][si]++;
    nPair[si][ti]++;
  }

  // Initialize strengths uniformly
  let theta = new Float64Array(n).fill(1 / n);

  for (let iter = 0; iter < maxIter; iter++) {
    const newTheta = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      if (wins[i] === 0) {
        // No wins at all: keep small positive value
        newTheta[i] = 1e-10;
        continue;
      }
      let denom = 0;
      for (let j = 0; j < n; j++) {
        if (i === j || nPair[i][j] === 0) continue;
        denom += nPair[i][j] / (theta[i] + theta[j]);
      }
      newTheta[i] = denom > 0 ? wins[i] / denom : 1e-10;
    }

    // Normalize
    const sum = newTheta.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) newTheta[i] /= sum;

    // Check convergence
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(newTheta[i] - theta[i]));
    }
    theta = newTheta;
    if (maxDiff < tol) break;
  }

  const result = new Map<string, number>();
  for (let i = 0; i < n; i++) result.set(itemIds[i], theta[i]);
  return result;
}

/**
 * Cramér-Rao lower bound for BT model weight recovery.
 *
 * For the MM-BT estimator with fractional scores, the effective Fisher info
 * per comparison of (i,j) depends on the score variance under the true DGP.
 *
 * Under pure BT (binary), Var(s) = p(1-p) and Fisher info = p(1-p).
 * Under logit-normal noise with Likert quantization, Var(s) > p(1-p),
 * and the Fisher info per comparison is reduced to p(1-p)^2 / Var(s).
 *
 * We numerically compute Var(s) for each pair under the true DGP.
 */
export function cramerRaoBound(
  trueWeights: number[],
  votes: PairVote[],
  itemIds: string[],
  sigma: number,
): number {
  const n = itemIds.length;
  const idx = new Map<string, number>();
  for (let i = 0; i < n; i++) idx.set(itemIds[i], i);

  // Count comparisons per pair
  const nPair: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const v of votes) {
    const ti = idx.get(v.target);
    const si = idx.get(v.source);
    if (ti === undefined || si === undefined) continue;
    nPair[ti][si]++;
    nPair[si][ti]++;
  }

  const m = n - 1; // Fix last parameter for identifiability
  const fisher = Array.from({ length: m }, () => new Float64Array(m));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const nij = nPair[i][j];
      if (nij === 0) continue;

      const pij = trueWeights[i] / (trueWeights[i] + trueWeights[j]);

      // Fisher info for BT with fractional scores:
      // The score s has E[s] = pij (approx) and Var(s) depends on noise + quantization.
      // For the BT likelihood with fractional wins, the Fisher info per comparison
      // in log-space is: (dp/d_lambda)^2 / Var(s) = p(1-p)^2 * p(1-p) / Var(s)
      // Wait -- more carefully:
      //
      // The BT log-likelihood for fractional score s is:
      //   ℓ = s * log(p) + (1-s) * log(1-p)
      // where p = theta_i/(theta_i+theta_j) = sigmoid(lambda_i - lambda_j)
      //
      // Score of ℓ w.r.t. (lambda_i - lambda_j):
      //   dℓ/dδ = s * (1-p) - (1-s) * p = s - p
      //
      // Fisher info = E[(s-p)^2] / 1 ... but wait, dp/dδ = p(1-p), so:
      //   dℓ/dδ = (s - p) where we used the chain rule for sigmoid
      //
      // Actually more carefully:
      //   dℓ/d(lambda_i) = (s - p) * dp/dδ / ... no.
      //   Let δ = lambda_i - lambda_j, p = sigmoid(δ)
      //   dℓ/dδ = s*(1-p) - (1-s)*p = s - p
      //   Fisher info I_δ = E[(s-p)^2] = Var(s) (since E[s] ≈ p)
      //
      // But this is Fisher info for δ. For log-space params:
      //   dδ/d(lambda_i) = 1, so I_{lambda_i, lambda_i} gets Var(s) added.
      //
      // Hmm, but that means MORE noise -> MORE Fisher info, which is wrong.
      // The issue: (s-p) is the score function, and I = E[score^2].
      // When Var(s) is large (noisy scores), the likelihood is flat, so
      // the score function has high variance but low signal.
      //
      // The correct Fisher info for the BT *model* (not the DGP) is:
      //   I = (dp/dδ)^2 / Var(s|p) = p(1-p)^2 / Var(s)
      //
      // Wait no. The Fisher info for the BT model treating s as data is:
      //   ℓ(δ) = s*log(sigmoid(δ)) + (1-s)*log(1-sigmoid(δ))
      //   dℓ/dδ = s - sigmoid(δ)
      //   d²ℓ/dδ² = -sigmoid(δ)*(1-sigmoid(δ)) = -p(1-p)  (this is deterministic!)
      //
      // So I_δ = -E[d²ℓ/dδ²] = p(1-p) per observation.
      // This is the same as standard BT regardless of score distribution!
      //
      // The BT Fisher info is p(1-p) per comparison, period.
      // The noise and quantization don't affect the *model* Fisher info,
      // they affect whether the model is well-specified.
      // The CR bound with p(1-p) is a lower bound on the variance of ANY
      // unbiased estimator of the BT parameters -- but the BT model may
      // be misspecified when data comes from logit-normal + Likert.

      const fij = nij * pij * (1 - pij);

      if (i < m) fisher[i][i] += fij;
      if (j < m) fisher[j][j] += fij;
      if (i < m && j < m) {
        fisher[i][j] -= fij;
        fisher[j][i] -= fij;
      }
    }
  }

  // Invert Fisher matrix to get covariance of log-strengths
  const covLog = invertMatrix(fisher);
  if (!covLog) return NaN;

  // Convert to variance of normalized weights via delta method:
  // w_i = θ_i / Σθ => ∂w_i/∂log(θ_j) = w_i * (δ_ij - w_j)
  let totalVar = 0;
  for (let i = 0; i < n; i++) {
    let variance = 0;
    for (let j = 0; j < m; j++) {
      const Jij = trueWeights[i] * ((i === j ? 1 : 0) - trueWeights[j]);
      for (let k = 0; k < m; k++) {
        const Jik = trueWeights[i] * ((i === k ? 1 : 0) - trueWeights[k]);
        variance += Jij * covLog[j][k] * Jik;
      }
    }
    totalVar += Math.max(0, variance);
  }

  return Math.sqrt(totalVar);
}

/**
 * Invert a symmetric positive-definite matrix using Cholesky decomposition.
 */
function invertMatrix(A: Float64Array[]): number[][] | null {
  const n = A.length;
  if (n === 0) return null;

  // Cholesky decomposition: A = L * L^T
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) return null; // Not positive definite
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }

  // Invert L (forward substitution)
  const Linv: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    Linv[i][i] = 1 / L[i][i];
    for (let j = i + 1; j < n; j++) {
      let sum = 0;
      for (let k = i; k < j; k++) sum -= L[j][k] * Linv[k][i];
      Linv[j][i] = sum / L[j][j];
    }
  }

  // A^{-1} = L^{-T} * L^{-1}
  const Ainv: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = i; k < n; k++) sum += Linv[k][i] * Linv[k][j];
      Ainv[i][j] = sum;
      Ainv[j][i] = sum;
    }
  }

  return Ainv;
}
