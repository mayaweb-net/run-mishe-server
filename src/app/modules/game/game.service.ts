import { Injectable, NotFoundException } from '@nestjs/common';
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
import { GameRequirementInputDto } from './dto/game-requirement.dto';
import {
  gameDetailSelect,
  gameListSelect,
  mapGameListItem,
  type GameListItem,
} from './game.types';

export type GameDetail = Prisma.GameGetPayload<{ select: typeof gameDetailSelect }>;

@Injectable()
export class GameService {
  constructor(private readonly prisma: PrismaService) {}

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

    const search = query.q?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nameFa: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { developer: { contains: search, mode: 'insensitive' } },
        { publisher: { contains: search, mode: 'insensitive' } },
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
        },
        update: data,
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
      if (!cpu) return;

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
    if (!gpu) return;

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
  ): Prisma.GameRequirementCreateWithoutGameInput {
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
      sourceName: 'Admin',
    };
  }
}
