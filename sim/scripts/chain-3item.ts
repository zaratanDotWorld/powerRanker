import { PowerRanker } from '../../src/index.js';
import { bradleyTerryMLE } from '../mle.js';

// 3 items, chain graph: 0-1-2
// True weights: (1/3)^1, (2/3)^1, (3/3)^1 = 1/3, 2/3, 1, normalized to [1/6, 1/3, 1/2]
const trueWeights = [1/6, 1/3, 1/2];
const itemIds = ['item-0', 'item-1', 'item-2'];

// Noiseless: score = exact BT probability
const p01 = trueWeights[0] / (trueWeights[0] + trueWeights[1]); // 1/3
const p12 = trueWeights[1] / (trueWeights[1] + trueWeights[2]); // 2/5

console.log('=== 3 items, chain 0-1-2, noiseless ===');
console.log(`True weights: [${trueWeights.map(w => w.toFixed(4)).join(', ')}]`);
console.log(`BT prob 0vs1: ${p01.toFixed(4)}  (true ratio w0/w1 = ${(trueWeights[0]/trueWeights[1]).toFixed(3)})`);
console.log(`BT prob 1vs2: ${p12.toFixed(4)}  (true ratio w1/w2 = ${(trueWeights[1]/trueWeights[2]).toFixed(3)})`);
console.log('');

// Feed exact probabilities as fractional scores
const prefs = [
  { target: 'item-0', source: 'item-1', value: p01 },
  { target: 'item-1', source: 'item-2', value: p12 },
];

// Spectral
const ranker = new PowerRanker({ items: new Set(itemIds), options: { k: 0, flow: 'bidirectional' } });
for (const p of prefs) ranker.addPreference(p);
const spec = itemIds.map(id => ranker.run().get(id)!);

// MLE
const mle = itemIds.map(id => bradleyTerryMLE(itemIds, prefs, 2000, 1e-12).get(id)!);

console.log('Recovered weights:');
console.log(`  True:     [${trueWeights.map(w => w.toFixed(4)).join(', ')}]`);
console.log(`  Spectral: [${spec.map(w => w.toFixed(4)).join(', ')}]`);
console.log(`  MLE:      [${mle.map(w => w.toFixed(4)).join(', ')}]`);
console.log('');

// Show what spectral actually computes: the transition matrix
console.log('--- What spectral builds internally ---');
console.log('');

// Reconstruct the matrix
// addPreference(target=0, source=1, value=1/3):
//   d[1][0] += 1/3,  d[0][1] += 2/3
// addPreference(target=1, source=2, value=2/5):
//   d[2][1] += 2/5,  d[1][2] += 3/5

const d = [[0, 2/3, 0], [1/3, 0, 3/5], [0, 2/5, 0]];
console.log('Raw flow matrix (before self-loops):');
for (let i = 0; i < 3; i++)
  console.log(`  [${d[i].map(v => v.toFixed(3)).join(', ')}]`);

const colSums = [0,0,0];
for (let j = 0; j < 3; j++)
  for (let i = 0; i < 3; i++) colSums[j] += d[i][j];

console.log(`\nColumn sums: [${colSums.map(v => v.toFixed(3)).join(', ')}]`);

// Set diagonal = column sum
for (let i = 0; i < 3; i++) d[i][i] = colSums[i];
console.log('\nAfter setting diagonal = column sum:');
for (let i = 0; i < 3; i++)
  console.log(`  [${d[i].map(v => v.toFixed(3)).join(', ')}]`);

// Row normalize
const rowSums = d.map(row => row.reduce((a,b) => a+b, 0));
console.log(`\nRow sums: [${rowSums.map(v => v.toFixed(3)).join(', ')}]`);

const P = d.map((row, i) => row.map(v => v / rowSums[i]));
console.log('\nTransition matrix P (row-normalized):');
for (let i = 0; i < 3; i++)
  console.log(`  [${P[i].map(v => v.toFixed(4)).join(', ')}]`);

console.log(`\nNotice: row sums of P differ BEFORE normalization.`);
console.log(`  Item-0 (endpoint, degree 1): row sum = ${rowSums[0].toFixed(3)}`);
console.log(`  Item-1 (interior, degree 2): row sum = ${rowSums[1].toFixed(3)}`);
console.log(`  Item-2 (endpoint, degree 1): row sum = ${rowSums[2].toFixed(3)}`);
console.log(`\nRow normalization divides each row by a DIFFERENT number.`);
console.log(`Item-1's flow is divided by ${rowSums[1].toFixed(3)}, diluting its outgoing transitions.`);
console.log(`This changes the stationary distribution in a way that has nothing to do with true weights.`);
