import { Injectable } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/app/db/prisma/prisma.service';

const gameSelect = {
  id: true,
  slug: true,
  name: true,
  nameFa: true,
} as const;

const hardwareSelect = {
  id: true,
  slug: true,
  name: true,
  vendor: true,
} as const;

@Injectable()
export class CuratedService {
  constructor(private readonly prisma: PrismaService) {}

  async listTopGames() {
    const items = await this.prisma.curatedTopGame.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { game: { select: gameSelect } },
    });
    return { items };
  }

  async listTopCpus() {
    const items = await this.prisma.curatedTopCpu.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { cpu: { select: hardwareSelect } },
    });
    return { items };
  }

  async listTopGpus() {
    const items = await this.prisma.curatedTopGpu.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { gpu: { select: hardwareSelect } },
    });
    return { items };
  }

  async addTopGame(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: gameSelect,
    });
    if (!game) {
      throw new NotFoundException(`Game with id "${gameId}" not found`);
    }

    const existing = await this.prisma.curatedTopGame.findUnique({
      where: { gameId },
    });
    if (existing) {
      throw new ConflictException(`Game "${gameId}" is already in the top list`);
    }

    const max = await this.prisma.curatedTopGame.aggregate({
      _max: { sortOrder: true },
    });
    const sortOrder = (max._max.sortOrder ?? -1) + 1;

    return this.prisma.curatedTopGame.create({
      data: { gameId, sortOrder },
      include: { game: { select: gameSelect } },
    });
  }

  async addTopCpu(cpuId: string) {
    const cpu = await this.prisma.cpu.findUnique({
      where: { id: cpuId },
      select: hardwareSelect,
    });
    if (!cpu) {
      throw new NotFoundException(`CPU with id "${cpuId}" not found`);
    }

    const existing = await this.prisma.curatedTopCpu.findUnique({
      where: { cpuId },
    });
    if (existing) {
      throw new ConflictException(`CPU "${cpuId}" is already in the top list`);
    }

    const max = await this.prisma.curatedTopCpu.aggregate({
      _max: { sortOrder: true },
    });
    const sortOrder = (max._max.sortOrder ?? -1) + 1;

    return this.prisma.curatedTopCpu.create({
      data: { cpuId, sortOrder },
      include: { cpu: { select: hardwareSelect } },
    });
  }

  async addTopGpu(gpuId: string) {
    const gpu = await this.prisma.gpu.findUnique({
      where: { id: gpuId },
      select: hardwareSelect,
    });
    if (!gpu) {
      throw new NotFoundException(`GPU with id "${gpuId}" not found`);
    }

    const existing = await this.prisma.curatedTopGpu.findUnique({
      where: { gpuId },
    });
    if (existing) {
      throw new ConflictException(`GPU "${gpuId}" is already in the top list`);
    }

    const max = await this.prisma.curatedTopGpu.aggregate({
      _max: { sortOrder: true },
    });
    const sortOrder = (max._max.sortOrder ?? -1) + 1;

    return this.prisma.curatedTopGpu.create({
      data: { gpuId, sortOrder },
      include: { gpu: { select: hardwareSelect } },
    });
  }

  async removeTopGame(gameId: string) {
    const existing = await this.prisma.curatedTopGame.findUnique({
      where: { gameId },
    });
    if (!existing) {
      throw new NotFoundException(`Game "${gameId}" is not in the top list`);
    }

    await this.prisma.curatedTopGame.delete({ where: { gameId } });
    await this.compactSortOrders('game');
    return { ok: true as const };
  }

  async removeTopCpu(cpuId: string) {
    const existing = await this.prisma.curatedTopCpu.findUnique({
      where: { cpuId },
    });
    if (!existing) {
      throw new NotFoundException(`CPU "${cpuId}" is not in the top list`);
    }

    await this.prisma.curatedTopCpu.delete({ where: { cpuId } });
    await this.compactSortOrders('cpu');
    return { ok: true as const };
  }

  async removeTopGpu(gpuId: string) {
    const existing = await this.prisma.curatedTopGpu.findUnique({
      where: { gpuId },
    });
    if (!existing) {
      throw new NotFoundException(`GPU "${gpuId}" is not in the top list`);
    }

    await this.prisma.curatedTopGpu.delete({ where: { gpuId } });
    await this.compactSortOrders('gpu');
    return { ok: true as const };
  }

  async reorderTopGames(orderedIds: string[]) {
    await this.applyOrder('game', orderedIds);
    return this.listTopGames();
  }

  async reorderTopCpus(orderedIds: string[]) {
    await this.applyOrder('cpu', orderedIds);
    return this.listTopCpus();
  }

  async reorderTopGpus(orderedIds: string[]) {
    await this.applyOrder('gpu', orderedIds);
    return this.listTopGpus();
  }

  private async compactSortOrders(kind: 'game' | 'cpu' | 'gpu') {
    if (kind === 'game') {
      const rows = await this.prisma.curatedTopGame.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true },
      });
      await this.prisma.$transaction(
        rows.map((row, index) =>
          this.prisma.curatedTopGame.update({
            where: { id: row.id },
            data: { sortOrder: index },
          }),
        ),
      );
      return;
    }

    if (kind === 'cpu') {
      const rows = await this.prisma.curatedTopCpu.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true },
      });
      await this.prisma.$transaction(
        rows.map((row, index) =>
          this.prisma.curatedTopCpu.update({
            where: { id: row.id },
            data: { sortOrder: index },
          }),
        ),
      );
      return;
    }

    const rows = await this.prisma.curatedTopGpu.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });
    await this.prisma.$transaction(
      rows.map((row, index) =>
        this.prisma.curatedTopGpu.update({
          where: { id: row.id },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  private async applyOrder(kind: 'game' | 'cpu' | 'gpu', orderedIds: string[]) {
    if (kind === 'game') {
      const existing = await this.prisma.curatedTopGame.findMany({
        select: { id: true, gameId: true },
      });
      this.assertExactOrder(orderedIds, existing.map((r) => r.gameId), 'game');
      const byGameId = new Map(existing.map((r) => [r.gameId, r.id]));
      await this.prisma.$transaction(
        orderedIds.map((gameId, index) =>
          this.prisma.curatedTopGame.update({
            where: { id: byGameId.get(gameId)! },
            data: { sortOrder: index },
          }),
        ),
      );
      return;
    }

    if (kind === 'cpu') {
      const existing = await this.prisma.curatedTopCpu.findMany({
        select: { id: true, cpuId: true },
      });
      this.assertExactOrder(orderedIds, existing.map((r) => r.cpuId), 'cpu');
      const byCpuId = new Map(existing.map((r) => [r.cpuId, r.id]));
      await this.prisma.$transaction(
        orderedIds.map((cpuId, index) =>
          this.prisma.curatedTopCpu.update({
            where: { id: byCpuId.get(cpuId)! },
            data: { sortOrder: index },
          }),
        ),
      );
      return;
    }

    const existing = await this.prisma.curatedTopGpu.findMany({
      select: { id: true, gpuId: true },
    });
    this.assertExactOrder(orderedIds, existing.map((r) => r.gpuId), 'gpu');
    const byGpuId = new Map(existing.map((r) => [r.gpuId, r.id]));
    await this.prisma.$transaction(
      orderedIds.map((gpuId, index) =>
        this.prisma.curatedTopGpu.update({
          where: { id: byGpuId.get(gpuId)! },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  private assertExactOrder(
    orderedIds: string[],
    existingIds: string[],
    kind: string,
  ) {
    if (orderedIds.length !== existingIds.length) {
      throw new BadRequestException(
        `orderedIds must include exactly ${existingIds.length} items`,
      );
    }

    const existingSet = new Set(existingIds);
    const seen = new Set<string>();
    for (const id of orderedIds) {
      if (!existingSet.has(id)) {
        throw new BadRequestException(
          `${kind} "${id}" is not in the top list`,
        );
      }
      if (seen.has(id)) {
        throw new BadRequestException(`Duplicate id in orderedIds: ${id}`);
      }
      seen.add(id);
    }
  }
}
