import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@/app/db/generated/prisma/client';
import { ArticleStatus } from '@/app/db/generated/prisma/client';
import { PrismaService } from '@/app/db/prisma/prisma.service';
import { ArticleCategoryService } from './article-category.service';
import type { CreateArticleDto, UpdateArticleDto } from './dto/article.dto';

export type ListArticlesParams = {
  page: number;
  limit: number;
  search?: string;
  categorySlug?: string;
};

const publicCategorySelect = {
  id: true,
  name: true,
  slug: true,
} as const;

const adminCategorySelect = {
  id: true,
  name: true,
  slug: true,
} as const;

function slugifyTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `article-${Date.now()}`;
}

function emptyToNull(value?: string | null) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class ArticleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articleCategoryService: ArticleCategoryService,
  ) {}

  async list(query: ListArticlesParams) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const search = query.search?.trim();

    const where: Prisma.ArticleWhereInput = search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, items] = await this.prisma.$transaction([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: adminCategorySelect },
        },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        category: { select: adminCategorySelect },
      },
    });
    if (!article) {
      throw new NotFoundException('مقاله یافت نشد');
    }
    return { article };
  }

  async listPublished(query: ListArticlesParams) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const search = query.search?.trim();
    const categorySlug = query.categorySlug?.trim();

    const where: Prisma.ArticleWhereInput = {
      status: ArticleStatus.PUBLISHED,
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { excerpt: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          coverPath: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          authorName: true,
          category: { select: publicCategorySelect },
        },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findPublishedBySlug(slug: string) {
    const article = await this.prisma.article.findFirst({
      where: {
        slug,
        status: ArticleStatus.PUBLISHED,
      },
      include: {
        category: { select: publicCategorySelect },
      },
    });
    if (!article) {
      throw new NotFoundException('مقاله یافت نشد');
    }
    return { article };
  }

  async listPublishedSlugs() {
    return this.prisma.article.findMany({
      where: {
        status: ArticleStatus.PUBLISHED,
        noIndex: false,
      },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async create(dto: CreateArticleDto) {
    const slug = await this.resolveUniqueSlug(
      dto.slug?.trim() || slugifyTitle(dto.title),
    );
    const status = dto.status ?? ArticleStatus.DRAFT;
    const categoryId = emptyToNull(dto.categoryId);
    if (categoryId) {
      await this.articleCategoryService.assertExists(categoryId);
    }

    const article = await this.prisma.article.create({
      data: {
        ...(dto.id ? { id: dto.id } : {}),
        title: dto.title.trim(),
        slug,
        content: dto.content ?? '',
        excerpt: emptyToNull(dto.excerpt),
        coverPath: emptyToNull(dto.coverPath),
        status,
        authorName: emptyToNull(dto.authorName),
        metaTitle: emptyToNull(dto.metaTitle),
        metaDescription: emptyToNull(dto.metaDescription),
        canonicalUrl: emptyToNull(dto.canonicalUrl),
        noIndex: dto.noIndex ?? false,
        publishedAt: status === ArticleStatus.PUBLISHED ? new Date() : null,
        ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
      },
      include: {
        category: { select: adminCategorySelect },
      },
    });

    return { article };
  }

  async update(id: string, dto: UpdateArticleDto) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('مقاله یافت نشد');
    }

    const data: Prisma.ArticleUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.excerpt !== undefined) data.excerpt = emptyToNull(dto.excerpt);
    if (dto.coverPath !== undefined) data.coverPath = emptyToNull(dto.coverPath);
    if (dto.authorName !== undefined) {
      data.authorName = emptyToNull(dto.authorName);
    }
    if (dto.metaTitle !== undefined) data.metaTitle = emptyToNull(dto.metaTitle);
    if (dto.metaDescription !== undefined) {
      data.metaDescription = emptyToNull(dto.metaDescription);
    }
    if (dto.canonicalUrl !== undefined) {
      data.canonicalUrl = emptyToNull(dto.canonicalUrl);
    }
    if (dto.noIndex !== undefined) data.noIndex = dto.noIndex;

    if (dto.categoryId !== undefined) {
      const categoryId = emptyToNull(dto.categoryId);
      if (categoryId) {
        await this.articleCategoryService.assertExists(categoryId);
        data.category = { connect: { id: categoryId } };
      } else {
        data.category = { disconnect: true };
      }
    }

    if (dto.slug !== undefined) {
      const nextSlug = dto.slug.trim();
      if (nextSlug !== existing.slug) {
        data.slug = await this.resolveUniqueSlug(nextSlug, id);
      }
    }

    if (dto.status !== undefined) {
      data.status = dto.status;
      if (
        dto.status === ArticleStatus.PUBLISHED &&
        existing.status !== ArticleStatus.PUBLISHED
      ) {
        data.publishedAt = new Date();
      }
      if (
        dto.status === ArticleStatus.DRAFT &&
        existing.status === ArticleStatus.PUBLISHED
      ) {
        data.publishedAt = null;
      }
    }

    const article = await this.prisma.article.update({
      where: { id },
      data,
      include: {
        category: { select: adminCategorySelect },
      },
    });

    return { article };
  }

  async remove(id: string) {
    const existing = await this.prisma.article.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('مقاله یافت نشد');
    }

    await this.prisma.article.delete({ where: { id } });
    return { success: true as const };
  }

  private async resolveUniqueSlug(base: string, excludeId?: string) {
    let candidate = base;
    let n = 0;
    while (true) {
      const found = await this.prisma.article.findUnique({
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
