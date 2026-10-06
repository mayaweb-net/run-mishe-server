import { Module } from '@nestjs/common';
import { ArticleCategoryService } from './article-category.service';
import { ArticleController } from './controllers/article.controller';
import { ArticleService } from './article.service';

@Module({
  controllers: [ArticleController],
  providers: [ArticleService, ArticleCategoryService],
  exports: [ArticleService, ArticleCategoryService],
})
export class ArticleModule {}
