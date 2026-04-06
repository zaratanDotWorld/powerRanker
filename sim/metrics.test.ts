import { describe, test, expect } from '@jest/globals';
import { spearman, weightError, l1Error, rmse, rankArray } from './metrics.js';

describe('metrics', () => {
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

  describe('weightError (L2)', () => {
    test('identical vectors', () => {
      expect(weightError([0.5, 0.3, 0.2], [0.5, 0.3, 0.2])).toBeCloseTo(0);
    });

    test('known L2 distance', () => {
      expect(weightError([1, 0, 0], [0, 1, 0])).toBeCloseTo(Math.sqrt(2));
    });
  });

  describe('l1Error', () => {
    test('identical vectors', () => {
      expect(l1Error([0.5, 0.3, 0.2], [0.5, 0.3, 0.2])).toBeCloseTo(0);
    });

    test('known L1 distance', () => {
      expect(l1Error([1, 0, 0], [0, 1, 0])).toBeCloseTo(2);
    });
  });

  describe('rmse', () => {
    test('identical vectors', () => {
      expect(rmse([0.5, 0.3, 0.2], [0.5, 0.3, 0.2])).toBeCloseTo(0);
    });

    test('known RMSE', () => {
      // errors: [1, -1, 0], sumSq = 2, RMSE = sqrt(2/3)
      expect(rmse([1, 0, 0], [0, 1, 0])).toBeCloseTo(Math.sqrt(2 / 3));
    });

    test('RMSE equals L2 / sqrt(n)', () => {
      const a = [0.5, 0.3, 0.2];
      const b = [0.4, 0.35, 0.25];
      const l2 = weightError(a, b);
      expect(rmse(a, b)).toBeCloseTo(l2 / Math.sqrt(a.length));
    });
  });
});
