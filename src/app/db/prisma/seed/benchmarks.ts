import { HardwareKind, type PrismaClient } from '../../generated/prisma/client';
import { BENCHMARK_DEFINITIONS } from '@/app/modules/benchmark/domain/definitions';

export async function seedBenchmarks(prisma: PrismaClient): Promise<void> {
  for (const definition of BENCHMARK_DEFINITIONS) {
    const data = {
      name: definition.name,
      vendor: definition.vendor,
      target: definition.target === 'CPU' ? HardwareKind.CPU : HardwareKind.GPU,
      category: definition.category,
      unit: definition.unit,
      higherIsBetter: definition.higherIsBetter,
      weightInIndex: 0,
      isActive: true,
      description: definition.description,
      sourceUrl: definition.sourceUrl,
    };
    await prisma.benchmark.upsert({
      where: { slug: definition.slug },
      create: { slug: definition.slug, ...data },
      update: data,
    });
  }
  console.log(
    `Benchmark definition seed complete: ${BENCHMARK_DEFINITIONS.length} definitions.`,
  );
}
