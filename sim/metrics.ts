export function rankArray(arr: number[]): number[] {
  const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const ranks = new Array(arr.length);
  sorted.forEach((el, rank) => {
    ranks[el.i] = rank + 1;
  });
  return ranks;
}

export function spearman(a: number[], b: number[]): number {
  const n = a.length;
  const rA = rankArray(a);
  const rB = rankArray(b);
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (rA[i] - rB[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

export function weightError(truth: number[], recovered: number[]): number {
  let sumSq = 0;
  for (let i = 0; i < truth.length; i++) {
    sumSq += (truth[i] - recovered[i]) ** 2;
  }
  return Math.sqrt(sumSq);
}

export function l1Error(truth: number[], recovered: number[]): number {
  let sumAbs = 0;
  for (let i = 0; i < truth.length; i++) {
    sumAbs += Math.abs(truth[i] - recovered[i]);
  }
  return sumAbs;
}

export function rmse(truth: number[], recovered: number[]): number {
  let sumSq = 0;
  for (let i = 0; i < truth.length; i++) {
    sumSq += (truth[i] - recovered[i]) ** 2;
  }
  return Math.sqrt(sumSq / truth.length);
}

export function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
