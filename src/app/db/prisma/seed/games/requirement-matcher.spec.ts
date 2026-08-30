import {
  matchRequirementHardware,
  type RequirementAlias,
} from './requirement-matcher';

const aliases: RequirementAlias[] = [
  {
    kind: 'CPU',
    alias: 'intel i5 750',
    cpuId: 'i5-750',
    gpuId: null,
    weight: 1,
  },
  {
    kind: 'CPU',
    alias: 'amd ryzen 5 5600x',
    cpuId: 'ryzen-5600x',
    gpuId: null,
    weight: 1,
  },
  {
    kind: 'GPU',
    alias: 'rtx 4070',
    cpuId: null,
    gpuId: 'rtx-4070',
    weight: 1,
  },
  {
    kind: 'GPU',
    alias: 'rtx 4070 ti',
    cpuId: null,
    gpuId: 'rtx-4070-ti',
    weight: 1,
  },
];

describe('matchRequirementHardware', () => {
  it('matches CPU alternatives and preserves source spelling', () => {
    const matches = matchRequirementHardware(
      'Intel® Core™ i5 750 or AMD Ryzen 5 5600X',
      'CPU',
      aliases,
    );

    expect(matches).toMatchObject([
      { cpuId: 'i5-750', matchedText: 'Intel® Core™ i5 750' },
      { cpuId: 'ryzen-5600x', matchedText: 'AMD Ryzen 5 5600X' },
    ]);
  });

  it('prefers the longest alias', () => {
    const matches = matchRequirementHardware(
      'NVIDIA GeForce RTX 4070 Ti',
      'GPU',
      aliases,
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      gpuId: 'rtx-4070-ti',
      matchedText: 'RTX 4070 Ti',
    });
  });

  it('does not map an unknown suffixed model to its base model', () => {
    const withoutTi = aliases.filter((alias) => alias.gpuId !== 'rtx-4070-ti');

    expect(
      matchRequirementHardware('RTX 4070 Ti', 'GPU', withoutTi),
    ).toEqual([]);
  });

  it('does not use fuzzy matching for unknown hardware', () => {
    expect(
      matchRequirementHardware('Intel Core i5-7600K', 'CPU', aliases),
    ).toEqual([]);
  });
});
