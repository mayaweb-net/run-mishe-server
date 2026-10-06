import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@/app/db/generated/prisma/client';
import { ArticleStatus } from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import type {
  CreateArticleCategoryDto,
  UpdateArticleCategoryDto,
} from './dto/article-category.dto';

function slugifyName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `category-${Date.now()}`;
}

function emptyToNull(value?: string | null) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class ArticleCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin() {
    const items = await this.prisma.articleCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { articles: true } },
      },
    });
    return { items };
  }

  async findOne(id: string) {
    const category = await this.prisma.articleCategory.findUnique({
      where: { id },
      include: {
        _count: { select: { articles: true } },
      },
    });
    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }
    return { category };
  }

  async listPublic() {
    const items = await this.prisma.articleCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        _count: {
          select: {
            articles: { where: { status: ArticleStatus.PUBLISHED } },
          },
        },
      },
    });

    return {
      items: items
        .filter((item) => item._count.articles > 0)
        .map(({ _count, ...item }) => ({
          ...item,
          articleCount: _count.articles,
        })),
    };
  }

  async findPublishedBySlug(slug: string) {
    const category = await this.prisma.articleCategory.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        metaTitle: true,
        metaDescription: true,
        noIndex: true,
        updatedAt: true,
      },
    });
    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }
    return { category };
  }

  async listPublicSlugs() {
    return this.prisma.articleCategory.findMany({
      where: {
        noIndex: false,
        articles: { some: { status: ArticleStatus.PUBLISHED } },
      },
      select: {
        slug: true,
        updatedAt: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateArticleCategoryDto) {
    const slug = await this.resolveUniqueSlug(
      dto.slug?.trim() || slugifyName(dto.name),
    );

    const category = await this.prisma.articleCategory.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: emptyToNull(dto.description),
        metaTitle: emptyToNull(dto.metaTitle),
        metaDescription: emptyToNull(dto.metaDescription),
        noIndex: dto.noIndex ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    return { category };
  }

  async update(id: string, dto: UpdateArticleCategoryDto) {
    const existing = await this.prisma.articleCategory.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    const data: Prisma.ArticleCategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) {
      data.description = emptyToNull(dto.description);
    }
    if (dto.metaTitle !== undefined) data.metaTitle = emptyToNull(dto.metaTitle);
    if (dto.metaDescription !== undefined) {
      data.metaDescription = emptyToNull(dto.metaDescription);
    }
    if (dto.noIndex !== undefined) data.noIndex = dto.noIndex;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    if (dto.slug !== undefined) {
      const nextSlug = dto.slug.trim();
      if (nextSlug !== existing.slug) {
        data.slug = await this.resolveUniqueSlug(nextSlug, id);
      }
    }

    const category = await this.prisma.articleCategory.update({
      where: { id },
      data,
    });

    return { category };
  }

  async remove(id: string) {
    const existing = await this.prisma.articleCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    await this.prisma.articleCategory.delete({ where: { id } });
    return { success: true as const };
  }

  async assertExists(id: string) {
    const category = await this.prisma.articleCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }
  }

  private async resolveUniqueSlug(base: string, excludeId?: string) {
    let candidate = base;
    let n = 0;
    while (true) {
      const found = await this.prisma.articleCategory.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!found || found.id === excludeId) {
        return candidate;
      }
      n += 1;
      candidate = `${base}-${n}`;
      if (n > 100) {
        throw new ConflictException('امکان تولید اسلاگ یکتا وجود ندارد');
      }
    }
  }
}
