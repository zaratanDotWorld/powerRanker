import { describe, test, expect } from '@jest/globals';
import { pearson, spearman, kendallTau, weightError, spreadRatio, rankArray } from './metrics.js';

describe('metrics', () => {
  describe('pearson', () => {
    test('perfect positive correlation', () => {
      expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    });

    test('perfect negative correlation', () => {
      expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1);
    });

    test('no correlation', () => {
      expect(pearson([1, 2, 3], [1, 3, 2])).toBeCloseTo(0.5);
    });

    test('identical arrays', () => {
      expect(pearson([5, 5, 5], [5, 5, 5])).toBeCloseTo(0);
    });
  });

  describe('rankArray', () => {
    test('assigns ranks by descending value', () => {
      expect(rankArray([10, 30, 20])).toEqual([3, 1, 2]);
    });
  });

  describe('spearman', () => {
    test('perfect agreement', () => {
      expect(spearman([1, 2, 3], [10, 20, 30])).toBeCloseTo(1);
    });

    test('perfect disagreement', () => {
      expect(spearman([1, 2, 3], [30, 20, 10])).toBeCloseTo(-1);
    });

    test('partial agreement', () => {
      const result = spearman([1, 2, 3, 4], [1, 3, 2, 4]);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });
  });

  describe('kendallTau', () => {
    test('perfect concordance', () => {
      expect(kendallTau([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    });

    test('perfect discordance', () => {
      expect(kendallTau([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
    });

    test('one swap from perfect', () => {
      // [1,2,3,4] vs [1,3,2,4]: one discordant pair (2,3)
      // concordant=5, discordant=1, tau = 4/6 = 2/3
      expect(kendallTau([1, 2, 3, 4], [1, 3, 2, 4])).toBeCloseTo(2 / 3);
    });
  });

  describe('weightError', () => {
    test('identical vectors', () => {
      expect(weightError([0.5, 0.3, 0.2], [0.5, 0.3, 0.2])).toBeCloseTo(0);
    });

    test('known L2 distance', () => {
      expect(weightError([1, 0, 0], [0, 1, 0])).toBeCloseTo(Math.sqrt(2));
    });
  });

  describe('spreadRatio', () => {
    test('identical spread', () => {
      expect(spreadRatio([1, 2, 4], [2, 4, 8])).toBeCloseTo(1);
    });

    test('double spread', () => {
      // truth spread = 4/1 = 4, recovered spread = 16/1 = 16, ratio = 4
      expect(spreadRatio([1, 2, 4], [1, 4, 16])).toBeCloseTo(4);
    });
  });
});
