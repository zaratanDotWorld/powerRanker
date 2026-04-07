import { Matrix } from 'ml-matrix';

export type FlowMode = 'bidirectional' | 'unidirectional';
export type Normalization = 'flow' | 'rankCentrality';

export interface PowerRankerOptions {
  k?: number;
  flow?: FlowMode;
  normalization?: Normalization;
  verbose?: boolean;
}

export interface Preference {
  target: string;
  source: string;
  value: number;
}

export interface RunOptions {
  epsilon?: number;
  nIter?: number;
}

export interface DirectedEdge {
  source: string;
  target: string;
  weight: number;
}

export interface PairWeight {
  alpha: string;
  beta: string;
  weight: number;
}

export type ActiveImpactTerm = 'coverage' | 'proximity' | 'position' | 'fisher';

export interface ActiveSelectOptions {
  num?: number;
  exclude?: Set<string>;
  terms?: ActiveImpactTerm[];
  /** Regularization strength (power transform): 0 = uniform, 1 = full weighting. Default 1. */
  r?: number;
  /** Custom RNG function returning [0,1). Defaults to Math.random. */
  rng?: () => number;
}

/**
 * Canonical pair key for a sorted (alpha, beta) pair.
 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * PageRank-style spectral ranker using power iteration.
 *
 * Supports two preference flow modes:
 * - bidirectional (default): score s adds s toward target and (1-s) toward source
 * - unidirectional: only the dominant direction is recorded
 *
 * Uses Bayesian pseudocounts (k) for regularization.
 */
export class PowerRanker {
  readonly items: string[];
  private options: PowerRankerOptions;
  private matrix: Matrix;
  private itemIndices: Record<string, number>;
  private itemObservations: Record<string, number>;

  constructor({ items, options = {} }: { items: Set<string>; options?: PowerRankerOptions }) {
    if (items.size < 2) {
      throw new Error('PowerRanker: Cannot rank less than two items');
    }

    this.options = options;
    this.items = Array.from(items).sort((a, b) => a.localeCompare(b));
    this.itemIndices = Object.fromEntries(this.items.map((item, ix) => [item, ix]));
    this.itemObservations = Object.fromEntries(this.items.map((item) => [item, 0]));
    this.matrix = this.prepareMatrix();

    this.log('Matrix initialized');
  }

  private log(msg: string): void {
    if (this.options.verbose) {
      console.log(msg);
    }
  }

  /**
   * Add a single preference to the matrix.
   */
  addPreference(p: Preference): void {
    const d = (this.matrix as unknown as { data: Float64Array[] }).data;
    const flow = this.options.flow ?? 'bidirectional';

    const targetIx = this.itemIndices[p.target];
    const sourceIx = this.itemIndices[p.source];
    if (targetIx === undefined || sourceIx === undefined) return;

    this.itemObservations[p.target]++;
    this.itemObservations[p.source]++;

    if (flow === 'bidirectional') {
      d[sourceIx][targetIx] += p.value;
      d[targetIx][sourceIx] += 1 - p.value;
    } else {
      // Scale so 0.5 -> 0, 0.7 -> 0.4, etc.
      const scaled = (p.value - 0.5) * 2;
      if (scaled > 0) {
        d[sourceIx][targetIx] += scaled;
      } else {
        d[targetIx][sourceIx] += -scaled;
      }
    }
  }

  /**
   * Run the algorithm and return the results.
   */
  run({ epsilon = 0.001, nIter = 1000 }: RunOptions = {}): Map<string, number> {
    const weights = this.powerMethod(epsilon, nIter);
    return this.applyLabels(weights);
  }

  /**
   * Extract net directed edges from the matrix.
   * Returns one edge per pair, pointing loser -> winner, with weight = net preference strength.
   */
  getEdges(): DirectedEdge[] {
    const d = (this.matrix as unknown as { data: Float64Array[] }).data;
    const edges: DirectedEdge[] = [];

    for (let i = 0; i < this.items.length; i++) {
      for (let j = i + 1; j < this.items.length; j++) {
        const net = d[i][j] - d[j][i];
        if (net > 0) {
          edges.push({ source: this.items[i], target: this.items[j], weight: net });
        } else if (net < 0) {
          edges.push({ source: this.items[j], target: this.items[i], weight: -net });
        }
      }
    }

    return edges;
  }

  /**
   * Select pairs using coverage x proximity x top-bias.
   *
   * terms defaults to all three; pass a subset to disable specific signals.
   * r (0-1) regularizes via power transform: final = w^r. Default 1 (no regularization).
   */
  activeSelect({
    num,
    exclude,
    terms = ['coverage', 'proximity'],
    r = 1,
    rng = Math.random,
  }: ActiveSelectOptions = {}): PairWeight[] {
    const weights = this.run();
    const sorted = Array.from(weights.entries()).sort((a, b) => b[1] - a[1]);
    const position: Record<string, number> = {};
    sorted.forEach(([name], i) => {
      position[name] = i + 1;
    });

    const candidates: PairWeight[] = [];

    for (let i = 0; i < this.items.length; i++) {
      for (let j = i + 1; j < this.items.length; j++) {
        const alpha = this.items[i];
        const beta = this.items[j];

        if (exclude && exclude.has(pairKey(alpha, beta))) continue;

        let weight = 1;

        if (terms.includes('coverage')) {
          const nAlpha = this.itemObservations[alpha] ?? 0;
          const nBeta = this.itemObservations[beta] ?? 0;
          weight *= (1 / Math.sqrt(1 + nAlpha)) * (1 / Math.sqrt(1 + nBeta));
        }

        if (terms.includes('proximity')) {
          weight *= 1 / (1 + Math.abs(position[alpha] - position[beta]));
        }

        if (terms.includes('position')) {
          weight *= 1 / Math.sqrt(position[alpha] * position[beta]);
        }

        if (terms.includes('fisher')) {
          const wA = weights.get(alpha)!;
          const wB = weights.get(beta)!;
          const p = wA / (wA + wB);
          weight *= p * (1 - p);  // Fisher info: maximized at p=0.5
        }


        weight = Math.pow(weight, r);

        candidates.push({ alpha, beta, weight });
      }
    }

    if (num === undefined) {
      return candidates;
    }
    return this.selectWithoutReplacement(candidates, num, rng);
  }

  // Internal

  private applyLabels(eigenvector: number[]): Map<string, number> {
    if (this.items.length !== eigenvector.length) {
      throw new Error('Mismatched arguments!');
    }

    const result = new Map<string, number>();
    for (let ix = 0; ix < this.items.length; ix++) {
      result.set(this.items[ix], eigenvector[ix]);
    }
    return result;
  }

  private prepareMatrix(): Matrix {
    const n = this.items.length;

    if (this.options.k) {
      return Matrix.ones(n, n).sub(Matrix.eye(n)).mul(this.options.k);
    }

    return Matrix.zeros(n, n);
  }

  private powerMethod(epsilon: number, nIter: number): number[] {
    const n = this.items.length;
    const mat = this.matrix.clone();

    if (this.options.normalization === 'flow') {
      // Flow normalization: diagonal = column sums, then row-normalize.
      // Preserves vote accumulation but has degree-dependent bias on incomplete graphs.
      const colSums = mat.sum('column');
      for (let i = 0; i < n; i++) {
        mat.set(i, i, colSums[i] - mat.get(i, i));
      }

      const rowSums = mat.sum('row');
      for (let i = 0; i < n; i++) {
        if (rowSums[i] > 0) {
          mat.setRow(i, mat.getRow(i).map((v) => v / rowSums[i]));
        } else {
          mat.setRow(i, Array(n).fill(1 / n));
        }
      }
    } else {
      // Default: rank centrality (Negahban et al., 2017).
      // Per-pair win fractions divided by d_max.
      // Eliminates degree-dependent bias on incomplete graphs.
      const degree = Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (mat.get(i, j) + mat.get(j, i) > 0) {
            degree[i]++;
            degree[j]++;
          }
        }
      }
      const dMax = Math.max(...degree);

      const T = Matrix.zeros(n, n);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const total = mat.get(i, j) + mat.get(j, i);
          if (total > 0) {
            T.set(i, j, (mat.get(i, j) / total) / dMax);
            T.set(j, i, (mat.get(j, i) / total) / dMax);
          }
        }
      }
      for (let i = 0; i < n; i++) {
        let offDiag = 0;
        for (let j = 0; j < n; j++) if (j !== i) offDiag += T.get(i, j);
        T.set(i, i, 1 - offDiag);
      }
      mat.setSubMatrix(T.to2DArray(), 0, 0);
    }

    // Power iteration
    let vec = Matrix.rowVector(Array(n).fill(1 / n));
    let prev = vec;

    for (let iter = 0; iter < nIter; iter++) {
      vec = prev.mmul(mat);

      if (Matrix.sub(vec, prev).norm() < epsilon) {
        this.log(`Eigenvector convergence after ${iter} iterations`);
        break;
      }

      prev = vec;
    }

    return vec.getRow(0);
  }

  private selectWithoutReplacement(candidates: PairWeight[], num: number, rng: () => number = Math.random): PairWeight[] {
    const remaining = [...candidates];
    const selected: PairWeight[] = [];

    for (let pick = 0; pick < num && remaining.length > 0; pick++) {
      const totalWeight = remaining.reduce((sum, p) => sum + p.weight, 0);

      let idx: number;
      if (totalWeight > 0) {
        let random = rng() * totalWeight;
        idx = remaining.length - 1;
        for (let k = 0; k < remaining.length; k++) {
          random -= remaining[k].weight;
          if (random <= 0) {
            idx = k;
            break;
          }
        }
      } else {
        idx = Math.floor(rng() * remaining.length);
      }

      selected.push(remaining[idx]);
      remaining.splice(idx, 1);
    }

    return selected;
  }
}
