import { describe, expect, it } from 'vitest';
import {
  compareIndex,
  compareRam,
  compareVram,
  performanceCopy,
  resolveVerdict,
  tierPasses,
  verdictStatusLabelFa,
} from './run-check';

describe('run-check pure logic', () => {
  it('compares indexes and ram', () => {
    expect(
      compareIndex({ userIndex: 40, requiredIndex: 20 }),
    ).toBe('pass');
    expect(
      compareIndex({ userIndex: 10, requiredIndex: 20 }),
    ).toBe('fail');
    expect(
      compareIndex({ userIndex: null, requiredIndex: 20 }),
    ).toBe('unknown');
    expect(compareRam({ userValue: 16, required: 16 })).toBe('pass');
    expect(compareRam({ userValue: 8, required: 16 })).toBe('fail');
  });

  it('soft-fails VRAM with warn band', () => {
    expect(compareVram({ userValue: 12, required: 10 })).toBe('pass');
    expect(compareVram({ userValue: 8, required: 10 })).toBe('warn');
    expect(compareVram({ userValue: 4, required: 10 })).toBe('fail');
  });

  it('resolves verdicts', () => {
    expect(
      resolveVerdict({ minimumPass: false, recommendedPass: false }),
    ).toBe('BELOW_MINIMUM');
    expect(
      resolveVerdict({ minimumPass: true, recommendedPass: false }),
    ).toBe('MEETS_MINIMUM');
    expect(
      resolveVerdict({ minimumPass: true, recommendedPass: true }),
    ).toBe('ABOVE_RECOMMENDED');
    expect(
      tierPasses({ cpu: 'pass', gpu: 'unknown', ram: 'pass' }),
    ).toBe(true);
    expect(
      tierPasses({ cpu: 'pass', gpu: 'fail', ram: 'pass' }),
    ).toBe(false);
  });

  it('builds Persian labels', () => {
    expect(verdictStatusLabelFa('ABOVE_RECOMMENDED')).toContain('ران میشه');
    expect(performanceCopy({ verdict: 'BELOW_MINIMUM', fps1080High: null }).summary)
      .toMatch(/بعید/);
  });
});
