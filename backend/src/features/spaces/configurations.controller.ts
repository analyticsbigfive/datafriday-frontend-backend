import { Controller, Get, Post, Patch, Body, Param, UseGuards, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateSpaceElementDto } from './dto/update-space-element.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { SpaceConfigurationService } from './services/space-configuration.service';
import { SpaceElementService } from './services/space-element.service';
import { SpaceConfigurationSaveService } from './services/space-configuration-save.service';

/**
 * Configurations d'un espace : création, mise à jour et éléments de configuration.
 */
@ApiTags('Configurations')
@ApiBearerAuth('supabase-jwt')
@Controller('configurations')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class ConfigurationsController {
  private readonly logger = new Logger(ConfigurationsController.name);

  constructor(
    private readonly spaceConfigurationSaveService: SpaceConfigurationSaveService,
    private readonly spaceConfigurationService: SpaceConfigurationService,
    private readonly spaceElementService: SpaceElementService,
  ) {}

  /**
   * Create or update a configuration
   */
  @Post()
  @RequirePermissions('space.edit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer ou mettre à jour une configuration',
    description:
      'Crée une nouvelle configuration ou met à jour une configuration existante pour un espace.',
  })
  @ApiBody({ type: CreateConfigDto })
  @ApiResponse({
    status: 201,
    description: 'Configuration créée ou mise à jour avec succès',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'config-1234567890' },
        name: { type: 'string', example: 'Main Configuration' },
        spaceId: { type: 'string', example: 'space-abc123' },
        capacity: { type: 'number', nullable: true, example: 5000 },
        data: {
          type: 'object',
          nullable: true,
          description: 'Configuration data (floors, forecourt, etc.)',
        },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async saveConfiguration(
    @Body() dto: CreateConfigDto,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`POST /configurations - Tenant: ${tenantId}, SpaceId: ${dto.spaceId}, ConfigName: ${dto.name}`);
    return this.spaceConfigurationSaveService.saveConfiguration(dto, tenantId);
  }

  /**
   * Get a configuration by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtenir une configuration par ID',
    description: 'Retourne les détails complets d\'une configuration.',
  })
  @ApiParam({ name: 'id', description: 'ID de la configuration' })
  @ApiResponse({
    status: 200,
    description: 'Configuration trouvée',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        spaceId: { type: 'string' },
        capacity: { type: 'number', nullable: true },
        data: { type: 'object', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Configuration non trouvée' })
  async getConfiguration(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.spaceConfigurationService.getConfiguration(id, tenantId, user);
  }

  /**
   * Update a shop (SpaceElement) — image, name, type, shopTypes
   */
  @Patch('elements/:elementId')
  @RequirePermissions('space.edit')
  @ApiOperation({
    summary: 'Modifier un shop (SpaceElement)',
    description: 'Met à jour le nom, l\'image, le type principal et/ou les sous-types d\'un SpaceElement (shop). Vérifie que l\'élément appartient bien au tenant avant modification.',
  })
  @ApiParam({ name: 'elementId', description: 'ID du SpaceElement (shop)' })
  @ApiBody({ type: UpdateSpaceElementDto })
  @ApiResponse({
    status: 200,
    description: 'Shop mis à jour',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string', example: 'fnb_food' },
        shopTypes: { type: 'array', items: { type: 'string' }, example: ['Food', 'Beverages'] },
        image: { type: 'string', nullable: true },
        notes: { type: 'string', nullable: true },
        floorId: { type: 'string', nullable: true },
        forecourtId: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Shop n\'appartient pas au tenant' })
  @ApiResponse({ status: 404, description: 'Shop non trouvé' })
  async updateSpaceElement(
    @Param('elementId') elementId: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateSpaceElementDto,
    @CurrentUser() user: any,
  ) {
    return this.spaceElementService.updateSpaceElement(elementId, tenantId, dto, user);
  }
}
