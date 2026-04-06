import { bradleyTerryMLE } from '../mle.js';
import { mulberry32, generateGroundTruth, drawScore } from '../utils.js';

const N = 100;
const trueWeights = generateGroundTruth(N, 1.0);
const itemIds = Array.from({ length: N }, (_, i) => `item-${String(i).padStart(3, '0')}`);
const totalPairs = N * (N - 1) / 2;

const rng = mulberry32(42);

for (const vpi of [2, 5, 10, 20, 50]) {
  const totalVotes = vpi * N;
  const allPrefs: { target: string; source: string; value: number }[] = [];
  const pairsSeen = new Set<string>();
  const itemObs = new Map<string, number>();
  for (const id of itemIds) itemObs.set(id, 0);

  for (let v = 0; v < totalVotes; v++) {
    const i = Math.floor(rng() * N);
    let j = Math.floor(rng() * (N - 1));
    if (j >= i) j++;
    const key = i < j ? `${i}:${j}` : `${j}:${i}`;
    pairsSeen.add(key);
    itemObs.set(itemIds[i], itemObs.get(itemIds[i])! + 1);
    itemObs.set(itemIds[j], itemObs.get(itemIds[j])! + 1);
    allPrefs.push({ target: itemIds[i], source: itemIds[j], value: drawScore(trueWeights[i], trueWeights[j], 0.15, rng) });
  }

  const obsCounts = Array.from(itemObs.values());
  const minObs = Math.min(...obsCounts);
  const maxObs = Math.max(...obsCounts);
  const unobservedItems = obsCounts.filter(c => c === 0).length;

  // How many unique partners does each item have?
  const partners = new Map<number, Set<number>>();
  for (const key of pairsSeen) {
    const [a, b] = key.split(':').map(Number);
    if (!partners.has(a)) partners.set(a, new Set());
    if (!partners.has(b)) partners.set(b, new Set());
    partners.get(a)!.add(b);
    partners.get(b)!.add(a);
  }
  const partnerCounts = Array.from(partners.values()).map(s => s.size);
  const minPartners = partnerCounts.length > 0 ? Math.min(...partnerCounts) : 0;
  const avgPartners = partnerCounts.reduce((a, b) => a + b, 0) / N;

  console.log(`VPI=${vpi}: ${totalVotes} votes, ${pairsSeen.size}/${totalPairs} pairs (${(pairsSeen.size/totalPairs*100).toFixed(0)}%), ` +
    `items unobserved: ${unobservedItems}, obs range: ${minObs}-${maxObs}, ` +
    `partners: min=${minPartners} avg=${avgPartners.toFixed(0)} (of ${N-1})`);
  console.log(`  BT model: ${N-1} free parameters, ${totalVotes} observations = ${(totalVotes/(N-1)).toFixed(1)} obs/parameter`);
}
