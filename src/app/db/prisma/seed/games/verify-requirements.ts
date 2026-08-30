import { prepareCpus } from '../hardware/cpu';
import { prepareGpus } from '../hardware/gpu';
import { GAME_SEED } from './game-data';
import {
  matchRequirementHardware,
  type MatchKind,
  type RequirementAlias,
} from './requirement-matcher';

interface Coverage {
  fields: number;
  matchedFields: number;
  options: number;
  unmatched: Array<{ game: string; tier: string; text: string }>;
}

function seedAliases(): RequirementAlias[] {
  const cpus = prepareCpus().flatMap(({ data, aliases }) =>
    aliases.map((alias) => ({
      kind: 'CPU' as const,
      alias,
      cpuId: data.slug,
      gpuId: null,
      weight: 1,
    })),
  );
  const gpus = prepareGpus().flatMap(({ data, aliases }) =>
    aliases.map((alias) => ({
      kind: 'GPU' as const,
      alias,
      cpuId: null,
      gpuId: data.slug,
      weight: 1,
    })),
  );
  return [...cpus, ...gpus];
}

function emptyCoverage(): Coverage {
  return { fields: 0, matchedFields: 0, options: 0, unmatched: [] };
}

const aliases = seedAliases();
const coverage: Record<MatchKind, Coverage> = {
  CPU: emptyCoverage(),
  GPU: emptyCoverage(),
};

for (const game of GAME_SEED) {
  for (const requirement of game.requirements) {
    const fields: ReadonlyArray<[MatchKind, string | null]> = [
      ['CPU', requirement.rawCpuText],
      ['GPU', requirement.rawGpuText],
    ];

    for (const [kind, text] of fields) {
      if (!text) continue;
      coverage[kind].fields += 1;

      const matches = matchRequirementHardware(text, kind, aliases);
      coverage[kind].options += matches.length;
      if (matches.length > 0) {
        coverage[kind].matchedFields += 1;
      } else {
        coverage[kind].unmatched.push({
          game: game.name,
          tier: requirement.tier,
          text,
        });
      }
    }
  }
}

for (const kind of ['CPU', 'GPU'] as const) {
  const result = coverage[kind];
  const percentage =
    result.fields === 0
      ? 0
      : Math.round((result.matchedFields / result.fields) * 1_000) / 10;

  console.log(
    `${kind}: ${result.matchedFields}/${result.fields} fields (${percentage}%), ` +
      `${result.options} options`,
  );
  console.log(`Unmatched ${kind} samples:`);
  for (const item of result.unmatched.slice(0, 20)) {
    console.log(`- ${item.game} [${item.tier}]: ${item.text}`);
  }
}
