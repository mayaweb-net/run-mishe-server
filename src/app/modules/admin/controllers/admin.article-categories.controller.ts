import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ArticleCategoryService } from '@/app/modules/article/article-category.service';
import {
  CreateArticleCategoryDto,
  UpdateArticleCategoryDto,
} from '@/app/modules/article/dto/article-category.dto';

@Controller('admin/article-categories')
export class AdminArticleCategoriesController {
  constructor(
    private readonly articleCategoryService: ArticleCategoryService,
  ) {}

  @Get()
  list() {
    return this.articleCategoryService.listAdmin();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.articleCategoryService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateArticleCategoryDto) {
    return this.articleCategoryService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleCategoryDto,
  ) {
    return this.articleCategoryService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.articleCategoryService.remove(id);
  }
}
