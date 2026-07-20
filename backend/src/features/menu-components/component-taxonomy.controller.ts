import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { ComponentTaxonomyService } from './component-taxonomy.service';
import { CreateComponentTypeDto } from './dto/create-component-type.dto';
import { UpdateComponentTypeDto } from './dto/update-component-type.dto';
import { CreateComponentCategoryDto } from './dto/create-component-category.dto';
import { UpdateComponentCategoryDto } from './dto/update-component-category.dto';

@ApiTags('Component Types')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('component-types')
export class ComponentTypesController {
  private readonly logger = new Logger(ComponentTypesController.name);

  constructor(private readonly taxonomyService: ComponentTaxonomyService) {}

  @Get()
  @ApiOperation({ summary: 'Lister tous les Component Types' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page (défaut: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Résultats par page (défaut: 200)', example: 200 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Filtre sur le nom (contains, insensible à la casse)' })
  @ApiResponse({ status: 200, description: 'Liste paginée des Component Types' })
  findAll(
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    this.logger.log(`GET /component-types - User: ${user?.id}`);
    return this.taxonomyService.getTypes(tenantId, page ? +page : 1, limit ? +limit : 200, search);
  }

  @RequirePermissions('menu.fb.components')
  @Post()
  @ApiOperation({ summary: 'Créer un Component Type' })
  @ApiResponse({ status: 201, description: 'Component Type créé' })
  create(@Body() body: CreateComponentTypeDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /component-types - User: ${user?.id}`);
    return this.taxonomyService.createType(body.name, tenantId);
  }

  @RequirePermissions('menu.fb.components')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un Component Type' })
  @ApiResponse({ status: 200, description: 'Component Type mis à jour' })
  @ApiResponse({ status: 404, description: 'Component Type non trouvé' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateComponentTypeDto,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`PATCH /component-types/${id} - User: ${user?.id}`);
    return this.taxonomyService.updateType(id, body.name, tenantId);
  }

  @RequirePermissions('menu.fb.components')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un Component Type' })
  @ApiResponse({ status: 200, description: 'Component Type supprimé' })
  @ApiResponse({ status: 404, description: 'Component Type non trouvé' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /component-types/${id} - User: ${user?.id}`);
    return this.taxonomyService.deleteType(id, tenantId);
  }
}

@ApiTags('Component Categories')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('component-categories')
export class ComponentCategoriesController {
  private readonly logger = new Logger(ComponentCategoriesController.name);

  constructor(private readonly taxonomyService: ComponentTaxonomyService) {}

  @Get()
  @ApiOperation({ summary: 'Lister toutes les Component Categories' })
  @ApiQuery({ name: 'typeId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page (défaut: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Résultats par page (défaut: 200)', example: 200 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Filtre sur le nom (contains, insensible à la casse)' })
  @ApiResponse({ status: 200, description: 'Liste paginée des Component Categories' })
  findAll(
    @Query('typeId') typeId: string,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    this.logger.log(`GET /component-categories - User: ${user?.id}`);
    return this.taxonomyService.getCategories(tenantId, typeId, page ? +page : 1, limit ? +limit : 200, search);
  }

  @RequirePermissions('menu.fb.components')
  @Post()
  @ApiOperation({ summary: 'Créer une Component Category' })
  @ApiResponse({ status: 201, description: 'Component Category créée' })
  create(@Body() body: CreateComponentCategoryDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /component-categories - User: ${user?.id}`);
    return this.taxonomyService.createCategory(body.name, body.typeId ?? body.componentTypeId, tenantId);
  }

  @RequirePermissions('menu.fb.components')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une Component Category' })
  @ApiResponse({ status: 200, description: 'Component Category mise à jour' })
  @ApiResponse({ status: 404, description: 'Component Category non trouvée' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateComponentCategoryDto,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`PATCH /component-categories/${id} - User: ${user?.id}`);
    return this.taxonomyService.updateCategory(
      id,
      { name: body.name, typeId: body.typeId ?? body.componentTypeId },
      tenantId,
    );
  }

  @RequirePermissions('menu.fb.components')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une Component Category' })
  @ApiResponse({ status: 200, description: 'Component Category supprimée' })
  @ApiResponse({ status: 404, description: 'Component Category non trouvée' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /component-categories/${id} - User: ${user?.id}`);
    return this.taxonomyService.deleteCategory(id, tenantId);
  }
}
