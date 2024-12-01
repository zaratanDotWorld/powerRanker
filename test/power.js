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
    const powerRanker = new PowerRanker({ items, numParticipants });
    const rankings = powerRanker.run({ d });

    expect(rankings.get(a)).to.be.almost(0.3333333333333333);
    expect(rankings.get(b)).to.be.almost(0.3333333333333333);
    expect(rankings.get(c)).to.be.almost(0.3333333333333333);
  });

  it('can use preferences to determine rankings', async () => {
    const powerRanker = new PowerRanker({ items, numParticipants });

    powerRanker.addPreferences([
      { target: a, source: b, value: 1 },
      { target: b, source: c, value: 1 },
    ]);

    const rankings = powerRanker.run({ d });

    expect(rankings.get(a)).to.be.almost(0.5038945471248252);
    expect(rankings.get(b)).to.be.almost(0.31132043857597014);
    expect(rankings.get(c)).to.be.almost(0.18478501429920438);
  });

  it('can dampen rankings', async () => {
    const powerRanker = new PowerRanker({ items, numParticipants });

    // Same preferences as above
    powerRanker.addPreferences([
      { target: a, source: b, value: 1 },
      { target: b, source: c, value: 1 },
    ]);

    const rankings = powerRanker.run({ d: 0.5 });

    expect(rankings.get(a)).to.be.almost(0.39569727579752584);
    expect(rankings.get(b)).to.be.almost(0.3425397745768228);
    expect(rankings.get(c)).to.be.almost(0.26176294962565094);
  });

  it('can use preferences to determine mild rankings', async () => {
    const powerRanker = new PowerRanker({ items, numParticipants });

    powerRanker.addPreferences([
      { target: a, source: b, value: 0.7 },
      { target: b, source: c, value: 0.7 },
    ]);

    const rankings = powerRanker.run({ d });

    expect(rankings.get(a)).to.be.almost(0.4670116340772533);
    expect(rankings.get(b)).to.be.almost(0.31890095736170976);
    expect(rankings.get(c)).to.be.almost(0.21408740856103664);
  });

  it('can use preferences to determine complex rankings', async () => {
    const powerRanker = new PowerRanker({ items, numParticipants });

    powerRanker.addPreferences([
      { target: a, source: b, value: 0.7 },
      { target: a, source: c, value: 0.3 },
      { target: b, source: c, value: 0.3 },
    ]);

    const rankings = powerRanker.run({ d });

    expect(rankings.get(a)).to.be.almost(0.25572135860019535);
    expect(rankings.get(b)).to.be.almost(0.1411003954995132);
    expect(rankings.get(c)).to.be.almost(0.6031782459002907);
  });

  it('can handle circular rankings', async () => {
    const powerRanker = new PowerRanker({ items, numParticipants });

    powerRanker.addPreferences([
      { target: a, source: b, value: 1 },
      { target: b, source: c, value: 1 },
      { target: c, source: a, value: 1 },
    ]);

    const rankings = powerRanker.run({ d });

    expect(rankings.get(a)).to.be.almost(0.3333333333333333);
    expect(rankings.get(b)).to.be.almost(0.3333333333333333);
    expect(rankings.get(c)).to.be.almost(0.3333333333333333);
  });
});
