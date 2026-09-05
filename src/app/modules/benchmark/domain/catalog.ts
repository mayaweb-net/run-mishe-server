import { normalizeHardwareName } from '@/app/common/hardware/normalize-hardware-name';
import { CPU_SEED } from '@/app/db/prisma/seed/hardware/cpu-data';
import { GPU_SEED } from '@/app/db/prisma/seed/hardware/gpu-data';
import type { CatalogHardware, HardwareTarget } from './types';

export function loadSeedCatalog(
  target: HardwareTarget,
  limit?: number,
): CatalogHardware[] {
  const rows: CatalogHardware[] =
    target === 'CPU'
      ? CPU_SEED.map((cpu) => ({
          slug: cpu.slug,
          name: cpu.name,
          normalizedName: normalizeHardwareName(cpu.name),
          target,
          aliases: [
            cpu.name.replace(/^AMD\s+/i, ''),
            cpu.name.replace(/^Intel\s+Core\s+/i, ''),
            cpu.name.replace(/\bCore\s+/i, ''),
          ],
        }))
      : GPU_SEED.map((gpu) => ({
          slug: gpu.slug,
          name: gpu.name,
          normalizedName: normalizeHardwareName(gpu.name),
          target,
          aliases:
            gpu.formFactor === 'LAPTOP'
              ? []
              : [
                  gpu.name.replace(/^(?:NVIDIA|AMD|Intel)\s+/i, ''),
                  gpu.name.replace(
                    /^(?:(?:NVIDIA|AMD|Intel)\s+)?(?:GeForce|Radeon)\s+/i,
                    '',
                  ),
                ],
        }));

  return limit == null ? rows : rows.slice(0, limit);
}
