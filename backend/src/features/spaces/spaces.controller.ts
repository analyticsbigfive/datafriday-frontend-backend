import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus, ForbiddenException } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';
import { QuerySpaceDto } from './dto/query-space.dto';
import { UpdateSpaceImageDto } from './dto/update-space-image.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { SpaceIdParam } from '../../core/auth/decorators/space-id-param.decorator';
import { SpaceAccessGrantService } from './services/space-access-grant.service';
import { SpaceConfigurationService } from './services/space-configuration.service';
import { SpaceCrudService } from './services/space-crud.service';

@ApiTags('Spaces')
@ApiBearerAuth('supabase-jwt')
@Controller('spaces')
// Ce contrôleur expose `/spaces/:id` → indique au SpaceAccessGuard que l'id d'espace
// est porté par le param `id` (et non `spaceId`).
@SpaceIdParam('id')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class SpacesController {
  constructor(
    private readonly spaceAccessGrantService: SpaceAccessGrantService,
    private readonly spaceConfigurationService: SpaceConfigurationService,
    private readonly spaceCrudService: SpaceCrudService,
  ) {}

  /**
   * Create a new space
   */
  @Post()
  @RequirePermissions('space.edit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un nouvel espace/établissement',
    description:
      'Crée un nouvel espace pour l\'organisation. Réservé aux ADMIN et MANAGER.',
  })
  @ApiBody({ type: CreateSpaceDto })
  @ApiResponse({
    status: 201,
    description: 'Espace créé avec succès',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'space-abc123' },
        name: { type: 'string', example: 'Restaurant Le Gourmet' },
        image: { type: 'string', nullable: true },
        tenantId: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        tenant: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès refusé - rôle insuffisant' })
  async create(@CurrentUser() user: any, @Body() dto: CreateSpaceDto) {
    return this.spaceCrudService.create(user.tenantId, dto);
  }

  /**
   * Get all spaces for current tenant
   */
  @Get()
  @ApiOperation({
    summary: 'Lister tous les espaces de l\'organisation',
    description: 'Retourne la liste paginée des espaces de l\'organisation.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Recherche par nom' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Liste des espaces avec pagination',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              image: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              _count: {
                type: 'object',
                properties: {
                  configs: { type: 'number' },
                  pinnedByUsers: { type: 'number' },
                },
              },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
            totalPages: { type: 'number' },
          },
        },
      },
    },
  })
  async findAll(@CurrentUser() user: any, @Query() query: QuerySpaceDto) {
    if (!user.tenantId) {
      throw new ForbiddenException('Organisation requise. Veuillez compléter l\'onboarding.');
    }
    return this.spaceCrudService.findAll(user.tenantId, query, user);
  }

  /**
   * Lightweight space list for selects & wizards (id + name only).
   * Redis-cached — typical response < 10ms on cache hit.
   */
  @Get('light')
  @ApiOperation({
    summary: 'Liste légère des espaces (id + name)',
    description: 'Retourne uniquement id et name, mis en cache Redis (60s). Idéal pour les selects et wizards.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
  })
  async getSpacesLight(@CurrentUser() user: any) {
    if (!user.tenantId) {
      throw new ForbiddenException('Organisation requise. Veuillez compléter l\'onboarding.');
    }
    return this.spaceCrudService.getSpacesLight(user.tenantId, user);
  }

  /**
   * Get space statistics
   */
  @Get('statistics')
  @RequirePermissions('space.edit')
  @ApiOperation({
    summary: 'Statistiques des espaces',
    description: 'Retourne les statistiques globales sur les espaces.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques',
    schema: {
      type: 'object',
      properties: {
        totalSpaces: { type: 'number', example: 5 },
        totalConfigs: { type: 'number', example: 12 },
        recentSpaces: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              image: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  async getStatistics(@CurrentUser() user: any) {
    return this.spaceCrudService.getStatistics(user.tenantId);
  }

  /**
   * Get pinned spaces for current user
   */
  @Get('pinned')
  @ApiOperation({
    summary: 'Obtenir les espaces épinglés',
    description: 'Retourne la liste des espaces favoris/épinglés par l\'utilisateur.',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des espaces épinglés',
  })
  async getPinned(@CurrentUser() user: any) {
    return this.spaceAccessGrantService.getPinned(user.id, user.tenantId, user);
  }

  /**
   * Get space by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtenir un espace par ID',
    description: 'Retourne les détails complets d\'un espace.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiQuery({ name: 'light', required: false, type: Boolean, description: 'Mode léger (sans image)' })
  @ApiResponse({
    status: 200,
    description: 'Détails de l\'espace',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        image: { type: 'string', nullable: true },
        tenantId: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        tenant: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
          },
        },
        configs: {
          type: 'array',
          description: 'Liste complète des configurations avec leurs données (floors, forecourt, externalMerch)',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              spaceId: { type: 'string' },
              capacity: { type: 'number', nullable: true },
              data: { 
                type: 'object', 
                nullable: true,
                description: 'Données complètes de la configuration (floors, forecourt, externalMerch)',
                properties: {
                  floors: { type: 'array', description: 'Liste des étages avec leurs éléments' },
                  forecourt: { type: 'object', nullable: true, description: 'Configuration du parvis' },
                  externalMerch: { type: 'object', nullable: true, description: 'Configuration merchandising externe' },
                },
              },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        _count: {
          type: 'object',
          properties: {
            pinnedByUsers: { type: 'number' },
            userAccess: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async findOne(
    @Param('id') id: string, 
    @CurrentUser() user: any,
    @Query('light') light?: string,
  ) {
    const space = await this.spaceCrudService.findOne(id, user.tenantId, user);
    
    // In light mode, exclude heavy data like images
    if (light === 'true') {
      const { image: _image, ...lightSpace } = space;
      return lightSpace;
    }
    
    return space;
  }

  /**
   * Update a space
   */
  @Patch(':id')
  @RequirePermissions('space.edit')
  @ApiOperation({
    summary: 'Mettre à jour un espace',
    description: 'Modifie les informations d\'un espace. Réservé aux ADMIN et MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Espace mis à jour' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateSpaceDto,
  ) {
    return this.spaceCrudService.update(id, user.tenantId, dto);
  }

  /**
   * Update space image
   */
  @Put(':id/image')
  @RequirePermissions('space.edit')
  @ApiOperation({
    summary: 'Mettre à jour l\'image d\'un espace',
    description: 'Met à jour l\'image d\'un espace. Réservé aux ADMIN et MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiBody({ type: UpdateSpaceImageDto })
  @ApiResponse({ status: 200, description: 'Image mise à jour' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async updateImage(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: UpdateSpaceImageDto,
  ) {
    return this.spaceCrudService.updateImage(id, user.tenantId, body.image);
  }

  /**
   * Get configurations for a space
   */
  @Get(':id/configurations')
  @ApiOperation({
    summary: 'Obtenir les configurations d\'un espace',
    description: 'Retourne la liste des configurations associées à un espace.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({
    status: 200,
    description: 'Liste des configurations',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          spaceId: { type: 'string' },
          capacity: { type: 'number', nullable: true },
          data: { type: 'object', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          _count: {
            type: 'object',
            properties: {
              floors: { type: 'number' },
              stations: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async getConfigurations(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spaceConfigurationService.getConfigurations(id, user.tenantId);
  }

  /**
   * Delete a space
   */
  @Delete(':id')
  @RequirePermissions('space.edit')
  @ApiOperation({
    summary: 'Supprimer un espace',
    description: 'Supprime définitivement un espace. Réservé aux ADMIN uniquement.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Espace supprimé' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spaceCrudService.remove(id, user.tenantId);
  }

  /**
   * Pin a space
   */
  @Post(':id/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Épingler un espace',
    description: 'Ajoute l\'espace aux favoris de l\'utilisateur.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Espace épinglé' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async pin(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spaceAccessGrantService.pin(id, user.id, user.tenantId);
  }

  /**
   * Unpin a space
   */
  @Delete(':id/pin')
  @ApiOperation({
    summary: 'Désépingler un espace',
    description: 'Retire l\'espace des favoris de l\'utilisateur.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Espace désépinglé' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé ou non épinglé' })
  async unpin(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spaceAccessGrantService.unpin(id, user.id, user.tenantId);
  }

}

