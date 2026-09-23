import { hasConcreteHardwareToken, isGenericRequirementText } from './requirement-text.utils';

describe('requirement-text.utils', () => {
  it('keeps concrete Steam models out of the generic bucket', () => {
    expect(
      isGenericRequirementText(
        'Intel Core 2 Quad CPU Q6600 @ 2.40GHz (4 CPUs) / AMD Phenom 9850 Quad-Core Processor (4 CPUs) @ 2.5GHz',
      ),
    ).toBe(false);
    expect(
      isGenericRequirementText(
        'Video card must be 128 MB or more and with support for Pixel Shader 2.0b (ATI Radeon X800 or higher / NVIDIA GeForce 7600 or higher / Intel HD Graphics 2000 or higher).',
      ),
    ).toBe(false);
    expect(
      isGenericRequirementText(
        '256MB Nvidia 7900 / 256MB ATI X1900',
      ),
    ).toBe(false);
  });

  it('still flags frequency-only and VRAM-only blurbs as generic', () => {
    expect(isGenericRequirementText('Dual Core 2.4 GHz')).toBe(true);
    expect(isGenericRequirementText('2 GB Dedicated Video Card or Greater')).toBe(
      true,
    );
    expect(isGenericRequirementText('1GB VRAM / DirectX 10+ support')).toBe(true);
  });

  it('detects concrete tokens', () => {
    expect(hasConcreteHardwareToken('Ryzen 5 5600')).toBe(true);
    expect(hasConcreteHardwareToken('Dual Core 2.4 GHz')).toBe(false);
  });
});
