import { PowerRanker } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';

function generateTrueWeights(n: number, alpha: number): number[] {
  const raw = Array.from({ length: n }, (_, i) => Math.pow((i + 1) / n, alpha));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

const N = 10;
const trueWeights = generateTrueWeights(N, 1.0);
const itemIds = Array.from({ length: N }, (_, i) => `item-${i}`);
const l2 = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

// Noiseless chain: score = exact BT probability
console.log('=== Noiseless chain (score = exact p_ij) ===');
for (const K of [1, 10, 100, 1000]) {
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N - 1; i++) {
    const p = trueWeights[i] / (trueWeights[i] + trueWeights[i+1]);
    for (let rep = 0; rep < K; rep++) {
      prefs.push({ target: itemIds[i], source: itemIds[i+1], value: p });
    }
  }
  const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
  for (const p of prefs) ranker.addPreference(p);
  const spec = itemIds.map(id => ranker.run().get(id)!);
  const mle = itemIds.map(id => bradleyTerryMLE(itemIds, prefs, 2000, 1e-12).get(id)!);

  console.log(`K=${String(K).padStart(4)}  L2_spec=${l2(trueWeights, spec).toFixed(6)}  L2_mle=${l2(trueWeights, mle).toFixed(6)}`);

  if (K === 1) {
    console.log('\n  Per-item weights:');
    console.log('  item       true      spec      mle');
    for (let i = 0; i < N; i++) {
      console.log(`  ${itemIds[i].padEnd(10)} ${trueWeights[i].toFixed(5)}   ${spec[i].toFixed(5)}   ${mle[i].toFixed(5)}`);
    }
    console.log('');
  }
}

// Noiseless complete graph for comparison
console.log('=== Noiseless complete graph (score = exact p_ij), K=1 ===');
{
  const prefs: { target: string; source: string; value: number }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const p = trueWeights[i] / (trueWeights[i] + trueWeights[j]);
      prefs.push({ target: itemIds[i], source: itemIds[j], value: p });
    }
  }
  const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
  for (const p of prefs) ranker.addPreference(p);
  const spec = itemIds.map(id => ranker.run().get(id)!);
  const mle = itemIds.map(id => bradleyTerryMLE(itemIds, prefs, 2000, 1e-12).get(id)!);
  console.log(`  L2_spec=${l2(trueWeights, spec).toFixed(6)}  L2_mle=${l2(trueWeights, mle).toFixed(6)}`);
}
