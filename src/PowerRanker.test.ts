import { describe, test, expect } from '@jest/globals';
import { PowerRanker, pairKey } from './PowerRanker.js';

const PSEUDOCOUNT_C = 0.05;
const NUM_PARTICIPANTS = 3;
const K = PSEUDOCOUNT_C * NUM_PARTICIPANTS; // 0.15

const ITEM_A = 1;
const ITEM_B = 2;
const ITEM_C = 3;

function makeItems(...ids: number[]): Set<string> {
  return new Set(ids.map(String));
}

function pref(target: number, source: number, value: number) {
  return { target: String(target), source: String(source), value };
}

function score(rankings: Map<string, number>, item: number): number {
  return rankings.get(String(item))!;
}

describe('PowerRanker (bidirectional, default)', () => {
  describe('generating rankings', () => {
    test('handles less than two items', () => {
      expect(() => new PowerRanker({ items: new Set(['1']) })).toThrow(
        'Cannot rank less than two items'
      );
      expect(() => new PowerRanker({ items: new Set() })).toThrow(
        'Cannot rank less than two items'
      );
    });

    test('returns uniform rankings with no preferences', () => {
      const ranker = new PowerRanker({
        items: makeItems(ITEM_A, ITEM_B, ITEM_C),
        options: { k: K },
      });

      const rankings = ranker.run();

      expect(score(rankings, ITEM_A)).toBeCloseTo(1 / 3);
      expect(score(rankings, ITEM_B)).toBeCloseTo(1 / 3);
      expect(score(rankings, ITEM_C)).toBeCloseTo(1 / 3);
    });

    test('ranks by strong preferences', () => {
      const ranker = new PowerRanker({
        items: makeItems(ITEM_A, ITEM_B, ITEM_C),
        options: { k: K },
      });

      ranker.addPreferences([pref(ITEM_A, ITEM_B, 1), pref(ITEM_B, ITEM_C, 1)]);

      const rankings = ranker.run();

      expect(score(rankings, ITEM_A)).toBeCloseTo(0.6504044299518104);
      expect(score(rankings, ITEM_B)).toBeCloseTo(0.25639052368514753);
      expect(score(rankings, ITEM_C)).toBeCloseTo(0.093205046363043);
    });

    test('ranks by mild preferences', () => {
      const ranker = new PowerRanker({
        items: makeItems(ITEM_A, ITEM_B, ITEM_C),
        options: { k: K },
      });

      ranker.addPreferences([pref(ITEM_A, ITEM_B, 0.7), pref(ITEM_B, ITEM_C, 0.7)]);

      let rankings = ranker.run();

      expect(score(rankings, ITEM_A)).toBeCloseTo(0.4068951041201312);
      expect(score(rankings, ITEM_B)).toBeCloseTo(0.4166002074347627);
      expect(score(rankings, ITEM_C)).toBeCloseTo(0.17650468844510636);

      ranker.addPreferences([pref(ITEM_A, ITEM_C, 0.7)]);
      rankings = ranker.run();

      expect(score(rankings, ITEM_A)).toBeCloseTo(0.48552824664847594);
      expect(score(rankings, ITEM_B)).toBeCloseTo(0.30516609377264914);
      expect(score(rankings, ITEM_C)).toBeCloseTo(0.20930565957887504);
    });

    test('ranks with complex preferences', () => {
      const ranker = new PowerRanker({
        items: makeItems(ITEM_A, ITEM_B, ITEM_C),
        options: { k: K },
      });

      ranker.addPreferences([pref(ITEM_A, ITEM_B, 1), pref(ITEM_C, ITEM_B, 1)]);

      const rankings = ranker.run();

      expect(score(rankings, ITEM_A)).toBeCloseTo(0.45208724954750107);
      expect(score(rankings, ITEM_B)).toBeCloseTo(0.09582550090499836);
      expect(score(rankings, ITEM_C)).toBeCloseTo(0.45208724954750096);
    });

    test('handles circular preferences', () => {
      const ranker = new PowerRanker({
        items: makeItems(ITEM_A, ITEM_B, ITEM_C),
        options: { k: K },
      });

      ranker.addPreferences([
        pref(ITEM_A, ITEM_B, 1),
        pref(ITEM_B, ITEM_C, 1),
        pref(ITEM_C, ITEM_A, 1),
      ]);

      const rankings = ranker.run();

      expect(score(rankings, ITEM_A)).toBeCloseTo(1 / 3);
      expect(score(rankings, ITEM_B)).toBeCloseTo(1 / 3);
      expect(score(rankings, ITEM_C)).toBeCloseTo(1 / 3);
    });

    test('rankings shift when preferences change', () => {
      let ranker = new PowerRanker({
        items: makeItems(ITEM_A, ITEM_B, ITEM_C),
        options: { k: K },
      });
      ranker.addPreferences([pref(ITEM_A, ITEM_B, 1), pref(ITEM_B, ITEM_C, 1)]);
      let rankings = ranker.run();
      expect(score(rankings, ITEM_A)).toBeCloseTo(0.6504044299518104);

      ranker = new PowerRanker({
        items: makeItems(ITEM_A, ITEM_B, ITEM_C),
        options: { k: K },
      });
      ranker.addPreferences([pref(ITEM_A, ITEM_B, 0.7), pref(ITEM_B, ITEM_C, 1)]);
      rankings = ranker.run();
      expect(score(rankings, ITEM_A)).toBeCloseTo(0.43753649364391556);
      expect(score(rankings, ITEM_B)).toBeCloseTo(0.4780745171818418);

      ranker = new PowerRanker({
        items: makeItems(ITEM_A, ITEM_B, ITEM_C),
        options: { k: K },
      });
      ranker.addPreferences([pref(ITEM_A, ITEM_B, 0.7), pref(ITEM_B, ITEM_C, 0.7)]);
      rankings = ranker.run();
      expect(score(rankings, ITEM_A)).toBeCloseTo(0.4068951041201312);
      expect(score(rankings, ITEM_B)).toBeCloseTo(0.4166002074347627);
    });
  });

  describe('without pseudocounts', () => {
    test('strong preferences converge sharply without k', () => {
      const ranker = new PowerRanker({
        items: makeItems(ITEM_A, ITEM_B, ITEM_C),
      });

      ranker.addPreferences([pref(ITEM_A, ITEM_B, 1), pref(ITEM_B, ITEM_C, 1)]);

      const rankings = ranker.run();

      expect(score(rankings, ITEM_A)).toBeCloseTo(0.99951171875, 10);
      expect(score(rankings, ITEM_B)).toBeCloseTo(0.00048828125, 10);
      expect(score(rankings, ITEM_C)).toBeCloseTo(0, 10);
    });
  });
});

describe('PowerRanker (unidirectional flow)', () => {
  test('only records dominant direction', () => {
    const ranker = new PowerRanker({
      items: makeItems(ITEM_A, ITEM_B, ITEM_C),
      options: { k: K, flow: 'unidirectional' },
    });

    ranker.addPreferences([pref(ITEM_A, ITEM_B, 1), pref(ITEM_B, ITEM_C, 1)]);

    const rankings = ranker.run();

    // Unidirectional produces different values than bidirectional
    // A should still rank highest, C lowest
    expect(score(rankings, ITEM_A)).toBeGreaterThan(score(rankings, ITEM_B));
    expect(score(rankings, ITEM_B)).toBeGreaterThan(score(rankings, ITEM_C));
  });

  test('mild preferences differ from bidirectional', () => {
    const biRanker = new PowerRanker({
      items: makeItems(ITEM_A, ITEM_B, ITEM_C),
      options: { k: K, flow: 'bidirectional' },
    });
    biRanker.addPreferences([pref(ITEM_A, ITEM_B, 0.7), pref(ITEM_B, ITEM_C, 0.7)]);
    const biRankings = biRanker.run();

    const uniRanker = new PowerRanker({
      items: makeItems(ITEM_A, ITEM_B, ITEM_C),
      options: { k: K, flow: 'unidirectional' },
    });
    uniRanker.addPreferences([pref(ITEM_A, ITEM_B, 0.7), pref(ITEM_B, ITEM_C, 0.7)]);
    const uniRankings = uniRanker.run();

    // The rankings should differ because unidirectional discards reverse flow
    expect(score(uniRankings, ITEM_A)).not.toBeCloseTo(score(biRankings, ITEM_A), 3);
  });

  test('handles circular preferences', () => {
    const ranker = new PowerRanker({
      items: makeItems(ITEM_A, ITEM_B, ITEM_C),
      options: { k: K, flow: 'unidirectional' },
    });

    ranker.addPreferences([
      pref(ITEM_A, ITEM_B, 1),
      pref(ITEM_B, ITEM_C, 1),
      pref(ITEM_C, ITEM_A, 1),
    ]);

    const rankings = ranker.run();

    expect(score(rankings, ITEM_A)).toBeCloseTo(1 / 3);
    expect(score(rankings, ITEM_B)).toBeCloseTo(1 / 3);
    expect(score(rankings, ITEM_C)).toBeCloseTo(1 / 3);
  });
});

describe('activeSelect', () => {
  test('returns all pairs when num is omitted', () => {
    const ranker = new PowerRanker({ items: makeItems(ITEM_A, ITEM_B, ITEM_C) });
    const pairs = ranker.activeSelect();
    expect(pairs).toHaveLength(3);
  });

  test('selects the requested number of pairs', () => {
    const ranker = new PowerRanker({ items: makeItems(ITEM_A, ITEM_B, ITEM_C) });
    const pairs = ranker.activeSelect({ num: 2 });
    expect(pairs).toHaveLength(2);
  });

  test('excludes specified pairs', () => {
    const ranker = new PowerRanker({ items: makeItems(ITEM_A, ITEM_B, ITEM_C) });
    const exclude = new Set([pairKey(String(ITEM_A), String(ITEM_B))]);
    const pairs = ranker.activeSelect({ num: 10, exclude });
    expect(pairs).toHaveLength(2);
    const keys = pairs.map((p) => pairKey(p.alpha, p.beta));
    expect(keys).not.toContain(pairKey(String(ITEM_A), String(ITEM_B)));
  });

  test('with no data, all pairs have positive weight', () => {
    const ranker = new PowerRanker({
      items: makeItems(ITEM_A, ITEM_B, ITEM_C),
      options: { k: K },
    });
    const pairs = ranker.activeSelect();
    for (const p of pairs) {
      expect(p.weight).toBeGreaterThan(0);
    }
  });

  test('coverage prioritizes unobserved entries', () => {
    const ranker = new PowerRanker({
      items: new Set(['a', 'b', 'c', 'd']),
      options: { k: K },
    });

    for (let i = 0; i < 10; i++) {
      ranker.addPreferences([{ target: 'a', source: 'b', value: 1 }]);
    }

    const pairs = ranker.activeSelect({ terms: ['coverage'] });
    const cd = pairs.find((p) => p.alpha === 'c' && p.beta === 'd')!;
    const ab = pairs.find((p) => p.alpha === 'a' && p.beta === 'b')!;

    expect(cd.weight).toBeGreaterThan(ab.weight);
  });

  test('proximity prioritizes close-ranked pairs', () => {
    const ranker = new PowerRanker({
      items: new Set(['a', 'b', 'c', 'd']),
      options: { k: K },
    });

    ranker.addPreferences([
      { target: 'a', source: 'b', value: 1 },
      { target: 'b', source: 'c', value: 1 },
      { target: 'c', source: 'd', value: 1 },
    ]);

    const pairs = ranker.activeSelect({ terms: ['proximity'] });
    const adjacent = pairs.find((p) => p.alpha === 'a' && p.beta === 'b')!;
    const distant = pairs.find((p) => p.alpha === 'a' && p.beta === 'd')!;

    expect(adjacent.weight).toBeGreaterThan(distant.weight);
  });

  test('position prioritizes high-ranked pairs', () => {
    const ranker = new PowerRanker({
      items: new Set(['a', 'b', 'c', 'd']),
      options: { k: K },
    });

    ranker.addPreferences([
      { target: 'a', source: 'b', value: 1 },
      { target: 'b', source: 'c', value: 1 },
      { target: 'c', source: 'd', value: 1 },
    ]);

    const pairs = ranker.activeSelect({ terms: ['position'] });
    const top = pairs.find((p) => p.alpha === 'a' && p.beta === 'b')!;
    const bottom = pairs.find((p) => p.alpha === 'c' && p.beta === 'd')!;

    expect(top.weight).toBeGreaterThan(bottom.weight);
  });

  test('r=0 produces uniform weights', () => {
    const ranker = new PowerRanker({
      items: new Set(['a', 'b', 'c', 'd']),
      options: { k: K },
    });

    for (let i = 0; i < 10; i++) {
      ranker.addPreferences([{ target: 'a', source: 'b', value: 1 }]);
    }

    const pairs = ranker.activeSelect({ r: 0 });
    for (const p of pairs) {
      expect(p.weight).toBeCloseTo(1);
    }
  });

  test('r<1 compresses weights toward uniform', () => {
    const ranker = new PowerRanker({
      items: new Set(['a', 'b', 'c', 'd']),
      options: { k: K },
    });

    for (let i = 0; i < 10; i++) {
      ranker.addPreferences([{ target: 'a', source: 'b', value: 1 }]);
    }

    const fullPairs = ranker.activeSelect({ r: 1 });
    const halfPairs = ranker.activeSelect({ r: 0.5 });

    const ratio = (pairs: typeof fullPairs) => {
      const ws = pairs.map((p) => p.weight);
      return Math.max(...ws) / Math.min(...ws);
    };
    expect(ratio(halfPairs)).toBeLessThan(ratio(fullPairs));
    expect(ratio(halfPairs)).toBeGreaterThan(1);
  });
});

describe('pairKey', () => {
  test('returns canonical sorted key', () => {
    expect(pairKey('a', 'b')).toBe('a:b');
    expect(pairKey('b', 'a')).toBe('a:b');
    expect(pairKey('10', '2')).toBe('10:2');
  });
});
