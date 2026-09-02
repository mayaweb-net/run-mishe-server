import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HardwareKind,
  Prisma,
  RequirementTier,
} from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { buildPaginatedResult } from '@/app/common/types/paginated-result';
import { slugifyHardwareName } from '@/app/common/hardware/normalize-hardware-name';
import { ListGameQueryDto } from './dto/list-game-query.dto';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { ApplyRequirementMatchesDto } from './dto/apply-requirement-matches.dto';
import { GameRequirementInputDto } from './dto/game-requirement.dto';
import { GameRequirementMatcherService } from './game-requirement-matcher.service';
import {
  gameDetailSelect,
  gameListSelect,
  mapGameListItem,
  type GameListItem,
} from './game.types';
import {
  type UnmatchedRequirementGameRef,
  type UnmatchedRequirementItem,
  type UnmatchedRequirementsReport,
} from './game-unmatched-report.types';
import { isGenericRequirementText } from './requirement-text.utils';

export type GameDetail = Prisma.GameGetPayload<{ select: typeof gameDetailSelect }>;

@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requirementMatcher: GameRequirementMatcherService,
  ) {}

  async list(query: ListGameQueryDto) {
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.game.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        select: gameListSelect,
      }),
      this.prisma.game.count({ where }),
    ]);

    const items: GameListItem[] = rows.map(mapGameListItem);

    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findById(id: string): Promise<GameDetail> {
    const game = await this.prisma.game.findUnique({
      where: { id },
      select: gameDetailSelect,
    });

    if (!game) {
      throw new NotFoundException(`Game with id "${id}" not found`);
    }

    return game;
  }

  async create(dto: CreateGameDto): Promise<GameDetail> {
    const { requirements, ...gameDto } = dto;
    const slug = gameDto.slug?.trim() || slugifyHardwareName(gameDto.name);

    await this.validateRequirementHardwareIds(requirements);

    const game = await this.prisma.game.create({
      data: {
        name: gameDto.name,
        slug,
        nameFa: gameDto.nameFa,
        releaseDate: gameDto.releaseDate ? new Date(gameDto.releaseDate) : undefined,
        engine: gameDto.engine,
        developer: gameDto.developer,
        publisher: gameDto.publisher,
        genres: gameDto.genres ?? [],
        coverUrl: gameDto.coverUrl,
        description: gameDto.description,
        steamAppId: gameDto.steamAppId,
        igdbId: gameDto.igdbId,
        demandTier: gameDto.demandTier,
        isPopular: gameDto.isPopular,
        popularity: gameDto.popularity,
        isPublished: gameDto.isPublished,
        quality: gameDto.quality,
        sourceName: gameDto.sourceName,
        sourceUrl: gameDto.sourceUrl,
      },
      select: { id: true },
    });

    await this.syncRequirements(game.id, requirements);

    return this.findById(game.id);
  }

  async update(id: string, dto: UpdateGameDto): Promise<GameDetail> {
    await this.findById(id);

    const { requirements, releaseDate, name, slug, ...rest } = dto;

    await this.validateRequirementHardwareIds(requirements);

    const data: Prisma.GameUpdateInput = {
      ...rest,
      releaseDate:
        releaseDate === undefined
          ? undefined
          : releaseDate
            ? new Date(releaseDate)
            : null,
    };

    if (name !== undefined) {
      data.name = name;
    }

    if (slug !== undefined) {
      data.slug = slug;
    } else if (name !== undefined) {
      data.slug = slugifyHardwareName(name);
    }

    await this.prisma.game.update({
      where: { id },
      data,
    });

    await this.syncRequirements(id, requirements);

    return this.findById(id);
  }

  async remove(id: string): Promise<{ id: string }> {
    await this.findById(id);
    await this.prisma.game.delete({ where: { id } });
    return { id };
  }

  suggestRequirementMatches(gameId: string) {
    return this.requirementMatcher.suggestForGame(gameId);
  }

  async getUnmatchedRequirementsReport(): Promise<UnmatchedRequirementsReport> {
    const requirements = await this.prisma.gameRequirement.findMany({
      where: {
        tier: {
          in: [RequirementTier.MINIMUM, RequirementTier.RECOMMENDED],
        },
        OR: [
          {
            rawCpuText: { not: null },
            NOT: {
              options: {
                some: {
                  kind: HardwareKind.CPU,
                  cpuId: { not: null },
                },
              },
            },
          },
          {
            rawGpuText: { not: null },
            NOT: {
              options: {
                some: {
                  kind: HardwareKind.GPU,
                  gpuId: { not: null },
                },
              },
            },
          },
        ],
      },
      select: {
        tier: true,
        rawCpuText: true,
        rawGpuText: true,
        game: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
        options: {
          select: {
            kind: true,
            cpuId: true,
            gpuId: true,
          },
        },
      },
    });

    const grouped = new Map<
      string,
      Omit<UnmatchedRequirementItem, 'gameCount' | 'minimumCount' | 'recommendedCount'> & {
        minimumCount: number;
        recommendedCount: number;
      }
    >();

    for (const requirement of requirements) {
      const tier =
        requirement.tier === RequirementTier.MINIMUM ||
        requirement.tier === RequirementTier.RECOMMENDED
          ? requirement.tier
          : null;
      if (!tier) continue;

      const hasLinkedCpu = requirement.options.some(
        (option) => option.kind === HardwareKind.CPU && option.cpuId != null,
      );
      const hasLinkedGpu = requirement.options.some(
        (option) => option.kind === HardwareKind.GPU && option.gpuId != null,
      );

      const fields: Array<[HardwareKind, string | null]> = [
        [HardwareKind.CPU, requirement.rawCpuText],
        [HardwareKind.GPU, requirement.rawGpuText],
      ];

      for (const [kind, rawText] of fields) {
        const trimmed = rawText?.trim();
        if (!trimmed) continue;

        const isLinked =
          kind === HardwareKind.CPU ? hasLinkedCpu : hasLinkedGpu;
        if (isLinked) continue;

        const key = `${kind}:${trimmed}`;
        const gameRef: UnmatchedRequirementGameRef = {
          id: requirement.game.id,
          slug: requirement.game.slug,
          name: requirement.game.name,
          tier,
        };

        const existing = grouped.get(key);
        if (existing) {
          if (tier === RequirementTier.MINIMUM) {
            existing.minimumCount += 1;
          } else {
            existing.recommendedCount += 1;
          }
          existing.games.push(gameRef);
          continue;
        }

        grouped.set(key, {
          kind,
          rawText: trimmed,
          isGeneric: isGenericRequirementText(trimmed),
          minimumCount: tier === RequirementTier.MINIMUM ? 1 : 0,
          recommendedCount: tier === RequirementTier.RECOMMENDED ? 1 : 0,
          games: [gameRef],
        });
      }
    }

    const items: UnmatchedRequirementItem[] = [...grouped.values()]
      .map((item) => ({
        kind: item.kind,
        rawText: item.rawText,
        isGeneric: item.isGeneric,
        minimumCount: item.minimumCount,
        recommendedCount: item.recommendedCount,
        gameCount: item.games.length,
        games: item.games.sort(
          (left, right) =>
            left.name.localeCompare(right.name) ||
            left.tier.localeCompare(right.tier),
        ),
      }))
      .sort(
        (left, right) =>
          Number(left.isGeneric) - Number(right.isGeneric) ||
          right.gameCount - left.gameCount ||
          left.kind.localeCompare(right.kind) ||
          left.rawText.localeCompare(right.rawText),
      );

    const affectedGameIds = new Set<string>();
    for (const item of items) {
      for (const game of item.games) {
        affectedGameIds.add(game.id);
      }
    }

    const cpuItems = items.filter((item) => item.kind === HardwareKind.CPU);
    const gpuItems = items.filter((item) => item.kind === HardwareKind.GPU);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalUnmatchedFields: items.reduce((sum, item) => sum + item.gameCount, 0),
        uniqueCpuTexts: cpuItems.length,
        uniqueGpuTexts: gpuItems.length,
        actionableCpuTexts: cpuItems.filter((item) => !item.isGeneric).length,
        actionableGpuTexts: gpuItems.filter((item) => !item.isGeneric).length,
        affectedGames: affectedGameIds.size,
      },
      items,
    };
  }

  async applyRequirementMatches(
    gameId: string,
    dto: ApplyRequirementMatchesDto,
  ): Promise<GameDetail> {
    await this.findById(gameId);

    const cpuIds = dto.matches
      .filter((match) => match.kind === HardwareKind.CPU)
      .map((match) => match.hardwareId);
    const gpuIds = dto.matches
      .filter((match) => match.kind === HardwareKind.GPU)
      .map((match) => match.hardwareId);

    await this.validateHardwareIds(cpuIds, gpuIds);

    for (const match of dto.matches) {
      if (!this.isEditableRequirementTier(match.tier)) continue;

      const requirement = await this.prisma.gameRequirement.findUnique({
        where: {
          gameId_tier: {
            gameId,
            tier: match.tier,
          },
        },
        select: { id: true },
      });

      if (!requirement) continue;

      await this.prisma.gameRequirementOption.deleteMany({
        where: {
          requirementId: requirement.id,
          kind: match.kind,
          OR: [
            { matchedText: { startsWith: 'unresolved:' } },
            { needsReview: true, cpuId: null, gpuId: null },
          ],
        },
      });

      await this.syncAdminHardwareOption(
        requirement.id,
        match.kind,
        match.hardwareId,
      );
    }

    return this.findById(gameId);
  }

  private buildWhere(query: ListGameQueryDto): Prisma.GameWhereInput {
    const where: Prisma.GameWhereInput = {};

    if (query.demandTier) {
      where.demandTier = query.demandTier;
    }

    if (query.isPopular !== undefined) {
      where.isPopular = query.isPopular;
    }

    if (query.isPublished !== undefined) {
      where.isPublished = query.isPublished;
    }

    if (query.quality) {
      where.quality = query.quality;
    }

    const unmatchedCpu: Prisma.GameRequirementWhereInput = {
      rawCpuText: { not: null },
      options: {
        none: {
          kind: HardwareKind.CPU,
          cpuId: { not: null },
        },
      },
    };
    const unmatchedGpu: Prisma.GameRequirementWhereInput = {
      rawGpuText: { not: null },
      options: {
        none: {
          kind: HardwareKind.GPU,
          gpuId: { not: null },
        },
      },
    };

    switch (query.reviewStatus) {
      case 'NEEDS_REVIEW':
        where.requirements = {
          some: { options: { some: { needsReview: true } } },
        };
        break;
      case 'UNMATCHED_CPU':
        where.requirements = { some: unmatchedCpu };
        break;
      case 'UNMATCHED_GPU':
        where.requirements = { some: unmatchedGpu };
        break;
      case 'UNMATCHED_ANY':
        where.OR = [
          { requirements: { some: unmatchedCpu } },
          { requirements: { some: unmatchedGpu } },
        ];
        break;
    }

    const search = query.q?.trim();
    if (search) {
      const searchWhere: Prisma.GameWhereInput = {
        OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { nameFa: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { developer: { contains: search, mode: 'insensitive' } },
        { publisher: { contains: search, mode: 'insensitive' } },
        ],
      };
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        searchWhere,
      ];
    }

    return where;
  }

  private buildOrderBy(
    query: ListGameQueryDto,
  ): Prisma.GameOrderByWithRelationInput {
    const direction = query.sortOrder;

    switch (query.sortBy) {
      case 'releaseDate':
        return { releaseDate: direction };
      case 'popularity':
        return { popularity: direction };
      case 'createdAt':
        return { createdAt: direction };
      default:
        return { name: direction };
    }
  }

  private async syncRequirements(
    gameId: string,
    requirements: GameRequirementInputDto[] | undefined,
  ): Promise<void> {
    if (!requirements) return;

    for (const requirement of requirements) {
      if (!this.isEditableRequirementTier(requirement.tier)) continue;

      if (this.isEmptyRequirement(requirement)) {
        await this.prisma.gameRequirement.deleteMany({
          where: { gameId, tier: requirement.tier },
        });
        continue;
      }

      const data = this.toRequirementData(requirement);
      const {
        rawCpuText: _rawCpuText,
        rawGpuText: _rawGpuText,
        ...updateData
      } = data;

      await this.prisma.gameRequirement.upsert({
        where: {
          gameId_tier: {
            gameId,
            tier: requirement.tier,
          },
        },
        create: {
          gameId,
          tier: requirement.tier,
          ...data,
          sourceName: 'Admin',
        },
        update: updateData,
      });

      const persisted = await this.prisma.gameRequirement.findUniqueOrThrow({
        where: {
          gameId_tier: {
            gameId,
            tier: requirement.tier,
          },
        },
        select: { id: true },
      });

      await this.syncAdminRequirementOptions(persisted.id, requirement);
    }
  }

  private async syncAdminRequirementOptions(
    requirementId: string,
    requirement: GameRequirementInputDto,
  ): Promise<void> {
    await this.syncAdminHardwareOption(
      requirementId,
      HardwareKind.CPU,
      requirement.cpuId,
    );
    await this.syncAdminHardwareOption(
      requirementId,
      HardwareKind.GPU,
      requirement.gpuId,
    );
  }

  private async syncAdminHardwareOption(
    requirementId: string,
    kind: HardwareKind,
    hardwareId: string | null | undefined,
  ): Promise<void> {
    const adminPrefix = 'admin:';

    await this.prisma.gameRequirementOption.deleteMany({
      where: {
        requirementId,
        kind,
        matchedText: { startsWith: adminPrefix },
      },
    });

    if (!hardwareId) return;

    if (kind === HardwareKind.CPU) {
      const cpu = await this.prisma.cpu.findUnique({
        where: { id: hardwareId },
        select: { id: true },
      });
      if (!cpu) {
        throw new BadRequestException(`CPU with id "${hardwareId}" not found`);
      }

      await this.prisma.gameRequirementOption.create({
        data: {
          requirementId,
          kind,
          matchedText: `${adminPrefix}${cpu.id}`,
          cpuId: cpu.id,
          matchScore: 1,
          needsReview: false,
        },
      });
      return;
    }

    const gpu = await this.prisma.gpu.findUnique({
      where: { id: hardwareId },
      select: { id: true },
    });
    if (!gpu) {
      throw new BadRequestException(`GPU with id "${hardwareId}" not found`);
    }

    await this.prisma.gameRequirementOption.create({
      data: {
        requirementId,
        kind,
        matchedText: `${adminPrefix}${gpu.id}`,
        gpuId: gpu.id,
        matchScore: 1,
        needsReview: false,
      },
    });
  }

  private async validateRequirementHardwareIds(
    requirements: GameRequirementInputDto[] | undefined,
  ): Promise<void> {
    if (!requirements) return;

    const cpuIds = [
      ...new Set(
        requirements
          .map((requirement) => requirement.cpuId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const gpuIds = [
      ...new Set(
        requirements
          .map((requirement) => requirement.gpuId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    await this.validateHardwareIds(cpuIds, gpuIds);
  }

  private async validateHardwareIds(
    cpuIds: string[],
    gpuIds: string[],
  ): Promise<void> {
    const [cpus, gpus] = await Promise.all([
      cpuIds.length
        ? this.prisma.cpu.findMany({
            where: { id: { in: cpuIds } },
            select: { id: true },
          })
        : Promise.resolve([]),
      gpuIds.length
        ? this.prisma.gpu.findMany({
            where: { id: { in: gpuIds } },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    const foundCpuIds = new Set(cpus.map((cpu) => cpu.id));
    const foundGpuIds = new Set(gpus.map((gpu) => gpu.id));
    const missingCpuIds = cpuIds.filter((id) => !foundCpuIds.has(id));
    const missingGpuIds = gpuIds.filter((id) => !foundGpuIds.has(id));

    if (missingCpuIds.length || missingGpuIds.length) {
      throw new BadRequestException({
        message: 'Some requirement hardware references do not exist',
        missingCpuIds,
        missingGpuIds,
      });
    }
  }

  private isEditableRequirementTier(
    tier: RequirementTier,
  ): tier is RequirementTier.MINIMUM | RequirementTier.RECOMMENDED {
    return (
      tier === RequirementTier.MINIMUM || tier === RequirementTier.RECOMMENDED
    );
  }

  private isEmptyRequirement(requirement: GameRequirementInputDto): boolean {
    return (
      !requirement.cpuId &&
      !requirement.gpuId &&
      !requirement.rawCpuText?.trim() &&
      !requirement.rawGpuText?.trim() &&
      !requirement.os?.trim() &&
      requirement.ramGb == null &&
      requirement.vramGb == null &&
      requirement.storageGb == null &&
      !requirement.directX?.trim() &&
      !requirement.notes?.trim() &&
      !requirement.needsSsd
    );
  }

  private toRequirementData(
    requirement: GameRequirementInputDto,
  ): Prisma.GameRequirementUpdateWithoutGameInput {
    return {
      rawCpuText: requirement.rawCpuText?.trim() || null,
      rawGpuText: requirement.rawGpuText?.trim() || null,
      os: requirement.os?.trim() || null,
      ramGb: requirement.ramGb ?? null,
      vramGb: requirement.vramGb ?? null,
      storageGb: requirement.storageGb ?? null,
      directX: requirement.directX?.trim() || null,
      needsSsd: requirement.needsSsd ?? false,
      notes: requirement.notes?.trim() || null,
    };
  }
}
