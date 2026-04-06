/**
 * Analyze why column-sum self-loops are "almost right" for BT recovery.
 *
 * Theory: With a complete graph, all pairs observed equally, and exact BT
 * probabilities, does our construction equal Rank Centrality?
 *
 * This script tests with controlled conditions to isolate the bias source.
 */

import { PowerRanker } from '../../src/index.js';
import { generateGroundTruth } from '../utils.js';
import * as metrics from '../metrics.js';

function spreadRatio(truth: number[], recovered: number[]): number {
  return (Math.max(...recovered) / Math.min(...recovered)) / (Math.max(...truth) / Math.min(...truth));
}

// Test 1: All pairs observed exactly once with exact BT probabilities, no pseudocount
function testExactBT(n: number, alpha: number): void {
  const trueWeights = generateGroundTruth(n, alpha);
  const itemIds = Array.from({ length: n }, (_, i) => `item-${i}`);

  const ranker = new PowerRanker({
    items: new Set(itemIds),
    options: { k: 0 },
  });

  // Add exactly one vote per pair with exact BT probability
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pij = trueWeights[i] / (trueWeights[i] + trueWeights[j]);
      ranker.addPreference({
        target: itemIds[i],
        source: itemIds[j],
        value: pij,
      });
    }
  }

  const weights = ranker.run();
  const recovered = itemIds.map((id) => weights.get(id)!);

  const l2 = metrics.l2Error(trueWeights, recovered);
  const sp = metrics.spearman(trueWeights, recovered);
  const spread = spreadRatio(trueWeights, recovered);

  console.log(`  n=${n}, α=${alpha}: L2=${l2.toFixed(6)}, spearman=${sp.toFixed(4)}, spread=${spread.toFixed(4)}`);

  // Show per-item comparison for small n
  if (n <= 10) {
    console.log('    Item | True     | Recovered | Ratio');
    for (let i = 0; i < n; i++) {
      const ratio = recovered[i] / trueWeights[i];
      console.log(`    ${i.toString().padStart(4)} | ${trueWeights[i].toFixed(5)} | ${recovered[i].toFixed(5)}  | ${ratio.toFixed(4)}`);
    }
  }
}

// Test 2: Same but with unequal pair observation counts
function testUnequalObservations(n: number, alpha: number): void {
  const trueWeights = generateGroundTruth(n, alpha);
  const itemIds = Array.from({ length: n }, (_, i) => `item-${i}`);

  const ranker = new PowerRanker({
    items: new Set(itemIds),
    options: { k: 0 },
  });

  // Add votes with count proportional to pair index (simulating unequal sampling)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pij = trueWeights[i] / (trueWeights[i] + trueWeights[j]);
      const count = 1 + (i + j) % 3; // 1, 2, or 3 observations per pair
      for (let c = 0; c < count; c++) {
        ranker.addPreference({
          target: itemIds[i],
          source: itemIds[j],
          value: pij,
        });
      }
    }
  }

  const weights = ranker.run();
  const recovered = itemIds.map((id) => weights.get(id)!);

  const l2 = metrics.l2Error(trueWeights, recovered);
  console.log(`  n=${n}, α=${alpha}, unequal obs: L2=${l2.toFixed(6)}`);
}

// Test 3: Rank Centrality construction (for comparison)
// RC: P_ij = p̂_ji / d_i where p̂_ji is empirical probability j beats i
// With exact BT and complete graph: P_ij = [w_j/(w_i+w_j)] / (n-1)
// Diagonal: P_ii = 1 - Σ_{j≠i} P_ij
function testRankCentrality(n: number, alpha: number): void {
  const trueWeights = generateGroundTruth(n, alpha);

  // Build RC transition matrix directly
  const P: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      // P_ij = P(j beats i) / (n-1)
      P[i][j] = (trueWeights[j] / (trueWeights[i] + trueWeights[j])) / (n - 1);
      rowSum += P[i][j];
    }
    P[i][i] = 1 - rowSum;
  }

  // Power iteration (left eigenvector: v * P = v)
  let vec = new Array(n).fill(1 / n);
  for (let iter = 0; iter < 10000; iter++) {
    const newVec = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        newVec[j] += vec[i] * P[i][j];
      }
    }
    const sum = newVec.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) newVec[i] /= sum;

    let maxDiff = 0;
    for (let i = 0; i < n; i++) maxDiff = Math.max(maxDiff, Math.abs(newVec[i] - vec[i]));
    vec = newVec;
    if (maxDiff < 1e-12) break;
  }

  const l2 = metrics.l2Error(trueWeights, vec);
  const sp = metrics.spearman(trueWeights, vec);
  const spread = spreadRatio(trueWeights, vec);

  console.log(`  n=${n}, α=${alpha}, Rank Centrality: L2=${l2.toFixed(6)}, spearman=${sp.toFixed(4)}, spread=${spread.toFixed(4)}`);

  if (n <= 10) {
    console.log('    Item | True     | RC        | Ratio');
    for (let i = 0; i < n; i++) {
      const ratio = vec[i] / trueWeights[i];
      console.log(`    ${i.toString().padStart(4)} | ${trueWeights[i].toFixed(5)} | ${vec[i].toFixed(5)}  | ${ratio.toFixed(4)}`);
    }
  }
}

// Compare our construction vs RC matrix directly
function compareMatrices(n: number, alpha: number): void {
  const trueWeights = generateGroundTruth(n, alpha);
  const itemIds = Array.from({ length: n }, (_, i) => `item-${i}`);

  // Build our flow matrix manually (mimicking PowerRanker)
  const F: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pij = trueWeights[i] / (trueWeights[i] + trueWeights[j]);
      // addPreference({target: i, source: j, value: pij})
      // d[sourceIx][targetIx] += value → F[j][i] += pij
      // d[targetIx][sourceIx] += 1-value → F[i][j] += 1-pij
      F[j][i] += pij;
      F[i][j] += 1 - pij;
    }
  }

  // Column-sum self-loops
  for (let j = 0; j < n; j++) {
    let colSum = 0;
    for (let i = 0; i < n; i++) colSum += F[i][j];
    F[j][j] = colSum; // Note: was 0, so colSum - 0 = colSum
  }

  // Row-normalize
  const M: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) rowSum += F[i][j];
    for (let j = 0; j < n; j++) M[i][j] = F[i][j] / rowSum;
  }

  // Build RC matrix
  const P: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    let offDiagSum = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      P[i][j] = (trueWeights[j] / (trueWeights[i] + trueWeights[j])) / (n - 1);
      offDiagSum += P[i][j];
    }
    P[i][i] = 1 - offDiagSum;
  }

  // Compare
  let maxDiff = 0;
  let maxDiffI = 0, maxDiffJ = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const diff = Math.abs(M[i][j] - P[i][j]);
      if (diff > maxDiff) {
        maxDiff = diff;
        maxDiffI = i;
        maxDiffJ = j;
      }
    }
  }

  console.log(`  n=${n}, α=${alpha}: max |M-P| = ${maxDiff.toExponential(4)} at (${maxDiffI},${maxDiffJ})`);

  if (n <= 5) {
    console.log('  Our matrix M:');
    for (let i = 0; i < n; i++) {
      console.log(`    [${M[i].map(v => v.toFixed(4)).join(', ')}]`);
    }
    console.log('  RC matrix P:');
    for (let i = 0; i < n; i++) {
      console.log(`    [${P[i].map(v => v.toFixed(4)).join(', ')}]`);
    }
  }
}

// Test 5: Our construction with tighter convergence tolerance
function testTightConvergence(n: number, alpha: number): void {
  const trueWeights = generateGroundTruth(n, alpha);
  const itemIds = Array.from({ length: n }, (_, i) => `item-${i}`);

  const ranker = new PowerRanker({
    items: new Set(itemIds),
    options: { k: 0 },
  });

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pij = trueWeights[i] / (trueWeights[i] + trueWeights[j]);
      ranker.addPreference({ target: itemIds[i], source: itemIds[j], value: pij });
    }
  }

  const defaultWeights = ranker.run();  // epsilon=0.001
  const tightWeights = ranker.run({ epsilon: 1e-10, nIter: 100000 });

  const recDefault = itemIds.map((id) => defaultWeights.get(id)!);
  const recTight = itemIds.map((id) => tightWeights.get(id)!);

  const l2Default = metrics.l2Error(trueWeights, recDefault);
  const l2Tight = metrics.l2Error(trueWeights, recTight);

  console.log(`  n=${n}, α=${alpha}: L2(ε=0.001)=${l2Default.toFixed(6)}, L2(ε=1e-10)=${l2Tight.toFixed(10)}`);
}

console.log('=== Test 5: Convergence tolerance comparison ===');
testTightConvergence(5, 1.0);
testTightConvergence(10, 1.0);
testTightConvergence(30, 1.0);
testTightConvergence(30, 0.5);
testTightConvergence(30, 1.5);

console.log('\n=== Test 1: All pairs exactly once, exact BT, k=0 ===');
testExactBT(5, 1.0);
testExactBT(10, 1.0);
testExactBT(30, 1.0);
testExactBT(30, 0.5);
testExactBT(30, 1.5);

console.log('\n=== Test 2: Unequal pair observations, exact BT, k=0 ===');
testUnequalObservations(5, 1.0);
testUnequalObservations(10, 1.0);
testUnequalObservations(30, 1.0);

console.log('\n=== Test 3: Rank Centrality (direct construction) ===');
testRankCentrality(5, 1.0);
testRankCentrality(10, 1.0);
testRankCentrality(30, 1.0);
testRankCentrality(30, 0.5);
testRankCentrality(30, 1.5);

console.log('\n=== Test 4: Matrix comparison (our construction vs RC) ===');
compareMatrices(3, 1.0);
compareMatrices(5, 1.0);
compareMatrices(10, 1.0);
compareMatrices(30, 1.0);
