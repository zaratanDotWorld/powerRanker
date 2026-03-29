export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, dA = 0, dB = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - meanA) * (b[i] - meanB);
    dA += (a[i] - meanA) ** 2;
    dB += (b[i] - meanB) ** 2;
  }
  return dA > 0 && dB > 0 ? num / Math.sqrt(dA * dB) : 0;
}

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

export function kendallTau(a: number[], b: number[]): number {
  const n = a.length;
  let concordant = 0, discordant = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const aSign = Math.sign(a[i] - a[j]);
      const bSign = Math.sign(b[i] - b[j]);
      if (aSign * bSign > 0) concordant++;
      else if (aSign * bSign < 0) discordant++;
    }
  }
  const pairs = (n * (n - 1)) / 2;
  return (concordant - discordant) / pairs;
}

export function weightError(truth: number[], recovered: number[]): number {
  let sumSq = 0;
  for (let i = 0; i < truth.length; i++) {
    sumSq += (truth[i] - recovered[i]) ** 2;
  }
  return Math.sqrt(sumSq);
}

export function spreadRatio(truth: number[], recovered: number[]): number {
  const trueSpread = Math.max(...truth) / Math.min(...truth);
  const recSpread = Math.max(...recovered) / Math.min(...recovered);
  return trueSpread > 0 ? recSpread / trueSpread : 0;
}

export function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
