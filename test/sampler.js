const { expect } = require('chai');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiAlmost = require('chai-almost');

chai.use(chaiAsPromised);
chai.use(chaiAlmost());

const randomstring = require('randomstring');

const PowerRanker = require('../src/power');
const AdaptiveSampler = require('../src/sampler');

describe('AdaptiveSampler', () => {
  const a = randomstring.generate();
  const b = randomstring.generate();
  const c = randomstring.generate();
  const items = new Set([ a, b, c ]);

  describe('suggesting pairs', () => {
    it('can correctly calculate cumulative variance', async () => {
      const powerRanker = new PowerRanker({ items });
      const adaptiveSampler = new AdaptiveSampler({ variances: powerRanker.getVariances() });

      expect(adaptiveSampler.variances.slice(-1)[0].cumSumVariance)
        .to.equal(adaptiveSampler.sumVariance);
    });

    it('can sample pairs', async () => {
      const powerRanker = new PowerRanker({ items });
      const adaptiveSampler = new AdaptiveSampler({ variances: powerRanker.getVariances() });

      // Not an ideal test, function is probabilistic
      for (let i = 0; i < 3; i++) {
        const sample = adaptiveSampler.samplePair();

        expect(sample.alpha).to.be.oneOf([ a, b, c ]);
        expect(sample.beta).to.be.oneOf([ a, b, c ]);
        expect(sample.cumSumVariance).to.be.lte(adaptiveSampler.sumVariance);
      }
    });
  });
});
