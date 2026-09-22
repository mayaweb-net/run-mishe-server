import { describe, expect, it } from 'vitest';
import {
  HardwareResolver,
  safeShortName,
  stripVramToken,
} from '@/app/modules/benchmark/domain/hardware-resolver';
import type { CatalogHardware } from '@/app/modules/benchmark/domain/types';
import { normalizeNotebookcheckGpuName } from './normalize-gpu-name';

describe('normalizeNotebookcheckGpuName', () => {
  it('strips Desktop/Laptop hints and expands G VRAM', () => {
    expect(
      normalizeNotebookcheckGpuName('NVIDIA GeForce RTX 2060 Super (Desktop)'),
    ).toBe('NVIDIA GeForce RTX 2060 Super');
    expect(normalizeNotebookcheckGpuName('NVIDIA GeForce RTX 4060 Ti 8G')).toBe(
      'NVIDIA GeForce RTX 4060 Ti 8 GB',
    );
    expect(
      normalizeNotebookcheckGpuName('NVIDIA GeForce RTX 4060 Ti 16G'),
    ).toBe('NVIDIA GeForce RTX 4060 Ti 16 GB');
  });
});

describe('HardwareResolver default-vram', () => {
  const catalog: CatalogHardware[] = [
    {
      slug: 'nvidia-geforce-rtx-3060-12-gb',
      name: 'NVIDIA GeForce RTX 3060 12 GB',
      normalizedName: 'nvidia geforce rtx 3060 12gb',
      target: 'GPU',
      preferenceRank: -12,
      gamingIndex: 25,
    },
    {
      slug: 'nvidia-geforce-rtx-3060-8-gb',
      name: 'NVIDIA GeForce RTX 3060 8 GB',
      normalizedName: 'nvidia geforce rtx 3060 8gb',
      target: 'GPU',
      preferenceRank: -8,
      gamingIndex: 24,
    },
    {
      slug: 'nvidia-geforce-rtx-4060-ti-8-gb',
      name: 'NVIDIA GeForce RTX 4060 Ti 8 GB',
      normalizedName: 'nvidia geforce rtx 4060 ti 8gb',
      target: 'GPU',
      preferenceRank: -8,
      gamingIndex: 30,
    },
  ];

  it('picks the popular SKU when VRAM is omitted', () => {
    const resolver = new HardwareResolver(catalog, 'GPU');
    const result = resolver.resolve('NVIDIA GeForce RTX 3060');
    expect(result.status).toBe('resolved');
    expect(result.method).toBe('default-vram');
    expect(result.hardware?.slug).toBe('nvidia-geforce-rtx-3060-12-gb');
  });

  it('matches expanded 8G names exactly', () => {
    const resolver = new HardwareResolver(catalog, 'GPU');
    const cleaned = normalizeNotebookcheckGpuName(
      'NVIDIA GeForce RTX 4060 Ti 8G',
    );
    const result = resolver.resolve(cleaned);
    expect(result.hardware?.slug).toBe('nvidia-geforce-rtx-4060-ti-8-gb');
    expect(stripVramToken(safeShortName(cleaned, 'GPU'))).toBe('rtx 4060 ti');
  });
});
