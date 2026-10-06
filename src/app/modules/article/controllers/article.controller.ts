import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ArticleCategoryService } from '../article-category.service';
import { ArticleService } from '../article.service';

@Controller('articles')
export class ArticleController {
  constructor(
    private readonly articleService: ArticleService,
    private readonly articleCategoryService: ArticleCategoryService,
  ) {}

  @Get()
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.articleService.listPublished({
      page,
      limit,
      search,
      categorySlug: category,
    });
  }

  @Get('sitemap')
  sitemap() {
    return this.articleService.listPublishedSlugs();
  }

  @Get('categories')
  listCategories() {
    return this.articleCategoryService.listPublic();
  }

  @Get('categories/sitemap')
  categoriesSitemap() {
    return this.articleCategoryService.listPublicSlugs();
  }

  @Get('categories/:slug')
  findCategoryBySlug(@Param('slug') slug: string) {
    return this.articleCategoryService.findPublishedBySlug(slug);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.articleService.findPublishedBySlug(slug);
  }
}
