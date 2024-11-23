const { expect } = require('chai');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiAlmost = require('chai-almost');

chai.use(chaiAsPromised);
chai.use(chaiAlmost());

const PowerRanker = require('../src/power');

describe('PowerRanker', () => {
  const [ a, b, c ] = [ 'a', 'b', 'c' ];
  const items = new Set([ a, b, c ]);
  const numParticipants = 3;
  const d = 0.99;

  it('can return uniform rankings implicitly', async () => {
    const preferences = [];

    const powerRanker = new PowerRanker({ items, numParticipants, preferences });
    const rankings = powerRanker.run({ d });

    expect(rankings.get(a)).to.be.almost(0.3333333333333333);
    expect(rankings.get(b)).to.be.almost(0.3333333333333333);
    expect(rankings.get(c)).to.be.almost(0.3333333333333333);
  });

  it('can use preferences to determine rankings', async () => {
    const preferences = [
      { alpha: a, beta: b, value: 1 },
      { alpha: b, beta: c, value: 1 },
    ];

    const powerRanker = new PowerRanker({ items, numParticipants, preferences });
    const rankings = powerRanker.run({ d });

    expect(rankings.get(a)).to.be.almost(0.5038945471248252);
    expect(rankings.get(b)).to.be.almost(0.31132043857597014);
    expect(rankings.get(c)).to.be.almost(0.18478501429920438);
  });

  it('can use preferences to determine mild rankings', async () => {
    const preferences = [
      { alpha: a, beta: b, value: 0.7 },
      { alpha: b, beta: c, value: 0.7 },
    ];

    const powerRanker = new PowerRanker({ items, numParticipants, preferences });
    const rankings = powerRanker.run({ d });

    expect(rankings.get(a)).to.be.almost(0.4670116340772533);
    expect(rankings.get(b)).to.be.almost(0.31890095736170976);
    expect(rankings.get(c)).to.be.almost(0.21408740856103664);
  });

  it('can use preferences to determine complex rankings', async () => {
    const preferences = [
      { alpha: a, beta: b, value: 1 },
      { alpha: c, beta: b, value: 1 },
    ];

    const powerRanker = new PowerRanker({ items, numParticipants, preferences });
    const rankings = powerRanker.run({ d });

    expect(rankings.get(a)).to.be.almost(0.43135897930403255);
    expect(rankings.get(b)).to.be.almost(0.13728204139193492);
    expect(rankings.get(c)).to.be.almost(0.43135897930403255);
  });

  it('can handle circular rankings', async () => {
    const preferences = [
      { alpha: a, beta: b, value: 1 },
      { alpha: b, beta: c, value: 1 },
      { alpha: c, beta: a, value: 1 },
    ];

    const powerRanker = new PowerRanker({ items, numParticipants, preferences });
    const rankings = powerRanker.run({ d });

    expect(rankings.get(a)).to.be.almost(0.3333333333333333);
    expect(rankings.get(b)).to.be.almost(0.3333333333333333);
    expect(rankings.get(c)).to.be.almost(0.3333333333333333);
  });
});
