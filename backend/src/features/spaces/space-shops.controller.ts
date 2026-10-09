import { Controller, Get, Post, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AssignElementsToFloorDto } from './dto/assign-floor.dto';
import { QuickCreateElementDto } from './dto/quick-create-element.dto';
import { BulkQuickElementsDto } from './dto/bulk-quick-elements.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { SpaceIdParam } from '../../core/auth/decorators/space-id-param.decorator';
import { SpacesGetShopDetailsQueryDto } from './dto/spaces.query.dto';
import { SpaceElementService } from './services/space-element.service';
import { SpaceElementPlacementService } from './services/space-element-placement.service';
import { SpaceShopsService } from './services/space-shops.service';

/**
 * Shops d'un espace : liste, détails, création rapide d'éléments, affectation à un étage.
 */
@ApiTags('Spaces')
@ApiBearerAuth('supabase-jwt')
@Controller('spaces')
// Ce contrôleur expose `/spaces/:id` → indique au SpaceAccessGuard que l'id d'espace
// est porté par le param `id` (et non `spaceId`).
@SpaceIdParam('id')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class SpaceShopsController {
  constructor(
    private readonly spaceElementService: SpaceElementService,
    private readonly spaceElementPlacementService: SpaceElementPlacementService,
    private readonly spaceShopsService: SpaceShopsService,
  ) {}

  /**
   * Get shops list only — lightweight, no transaction data (used by SpaceMenuView)
   */
  @Get(':id/shops')
  @ApiOperation({
    summary: 'Lister les shops (SpaceElements) d\'un espace — version légère',
    description:
      'Retourne tous les SpaceElements de type shop (floors + forecourt) de cet espace, sans données de transaction Weezevent agrégées (utiliser /shop-details pour cela).',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiQuery({ name: 'configId', required: false, type: String, description: 'Filtre sur les shops de cette configuration uniquement (sinon toutes les configs de l\'espace)' })
  @ApiResponse({
    status: 200,
    description: 'Liste des shops',
    schema: {
      type: 'object',
      properties: {
        shops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'ID du SpaceElement (shop)' },
              name: { type: 'string', description: 'Nom du shop' },
              type: { type: 'string', description: 'Type Prisma (shop, fnb_food, fnb_beverages, fnb_bar, fnb_snack, fnb_icecream, merchshop)' },
              shopTypes: { type: 'array', items: { type: 'string' }, description: 'Tags de sous-type utilisés par le filtre du 3D Builder (food, beverages, beer, gppremium, temporary, drinkee)' },
              attributes: { type: 'object', nullable: true },
              image: { type: 'string', nullable: true },
              notes: { type: 'string', nullable: true },
              configId: { type: 'string', nullable: true },
              configName: { type: 'string', nullable: true },
              locationId: { type: 'string', nullable: true, description: 'ID du floor ou forecourt' },
              locationName: { type: 'string', nullable: true, description: 'Nom du floor ou forecourt' },
              floorLevel: {
                oneOf: [{ type: 'integer' }, { type: 'string', enum: ['forecourt'] }, { type: 'null' }],
                description: 'Niveau du floor (0 = RDC, négatif = sous-sol, positif = étage), "forecourt" si l\'élément est sur le parvis ("Parvis"), ou null si non rattaché',
              },
              weezeventLocationId: { type: 'string', nullable: true },
              isMappedToWeezevent: { type: 'boolean' },
              menuItemsCount: { type: 'number' },
              isOpen: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async getSpaceShops(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('configId') configId?: string,
  ) {
    return this.spaceShopsService.getSpaceShops(id, user.tenantId, configId);
  }

  /**
   * Get shop details for a space (all shops created in configurations)
   */
  @Get(':id/shop-details')
  @ApiOperation({
    summary: 'Obtenir tous les shops (points de vente) d\'un espace',
    description:
      'Retourne tous les SpaceElements de type shop créés dans les configurations de cet espace, avec leurs données de vente agrégées si mappés à Weezevent.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({
    status: 200,
    description: 'Liste des shops avec leurs détails et données de vente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          shopId: { type: 'string', description: 'ID du SpaceElement (shop)' },
          shopName: { type: 'string', description: 'Nom du shop' },
          shopType: { type: 'string', description: 'Type du shop (fnb-food, fnb-bar, merchshop, etc.)' },
          shopSubTypes: { type: 'array', items: { type: 'string' }, description: 'Sous-types spécifiques' },
          configId: { type: 'string', description: 'ID de la configuration' },
          configName: { type: 'string', description: 'Nom de la configuration' },
          locationId: { type: 'string', description: 'ID du floor ou forecourt' },
          locationName: { type: 'string', description: 'Nom du floor ou forecourt' },
          locationType: { type: 'string', enum: ['floor', 'forecourt'], description: 'Type de localisation' },
          revenue: { type: 'number', description: 'Revenu total HT (si mappé à Weezevent)' },
          transactionCount: { type: 'number', description: 'Nombre de transactions (si mappé à Weezevent)' },
          itemsCount: { type: 'number', description: 'Nombre d\'items vendus (si mappé à Weezevent)' },
          isMappedToWeezevent: { type: 'boolean', description: 'Indique si le shop est mappé à un merchant Weezevent' },
          weezeventMerchantId: { type: 'string', nullable: true, description: 'ID du merchant Weezevent mappé' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async getShopDetails(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query() params: SpacesGetShopDetailsQueryDto,
  ) {
    const { page = '1', limit = '20', granular = '0' } = params;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
    const includeGranular = granular === '1' || granular === 'true';
    return this.spaceShopsService.getShopDetails(id, user.tenantId, pageNum, limitNum, includeGranular, user);
  }

  /**
   * Quick-create a shop element for a space (from Weezevent import flow)
   */
  @Post(':id/quick-element')
  @RequirePermissions('space.edit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer rapidement un shop dans un espace (import Weezevent)',
    description:
      'Crée un SpaceElement dans la configuration utilisateur de l\'espace (celle de l\'étape 1 / du 3D Builder, la plus ancienne non-système). ' +
      'Aucune configuration "Weezevent Import" n\'est créée tant qu\'une config utilisateur existe. ' +
      'Dimensions par défaut : floor 200m × 200m × 4m si aucun floor n\'existe encore, shop 2m × 2m × 2m. ' +
      'Pour un `type` F&B (fnb-food, fnb-beverages, fnb-bar, fnb-snack, fnb-icecream), `shopTypes` est ' +
      'automatiquement renseigné (food/beverages/beer) pour le filtre du 3D Builder.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiBody({ type: QuickCreateElementDto })
  @ApiResponse({
    status: 201,
    description: 'Shop créé',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string' },
        configName: { type: 'string' },
        areaName: { type: 'string' },
      },
    },
  })
  async quickCreateElement(
    @Param('id') spaceId: string,
    @CurrentUser() user: any,
    @Body() body: QuickCreateElementDto,
  ) {
    return this.spaceElementService.quickCreateElement(spaceId, user.tenantId, body, user);
  }

  /**
   * Bulk create & map shops for the Weezevent import flow (step 2)
   */
  @Post(':id/quick-elements/bulk')
  @RequirePermissions('space.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Créer et mapper des shops en masse (étape 2 import Weezevent)',
    description:
      'Remplace la boucle unitaire quick-element + location-shop du front. ' +
      'Item avec `elementId` → mapping seul vers l\'élément existant (rien n\'est créé) ; ' +
      'item sans `elementId` → création d\'un SpaceElement (zone RDC niveau 0, 2×2×2 m, grille) puis mapping. ' +
      'Config cible et zone résolues une fois, créations et upserts de mappings en transaction, ' +
      'une seule invalidation de cache.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiBody({ type: BulkQuickElementsDto })
  @ApiResponse({
    status: 200,
    description: 'Résultat du bulk',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        createdCount: { type: 'number' },
        mappedCount: { type: 'number' },
        failed: { type: 'number' },
        errors: { type: 'array', items: { type: 'object' } },
        configName: { type: 'string', nullable: true },
        areaName: { type: 'string', nullable: true },
        floorLevel: { type: 'number', nullable: true },
        mapped: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async bulkQuickCreateAndMap(
    @Param('id') spaceId: string,
    @CurrentUser() user: any,
    @Body() body: BulkQuickElementsDto,
  ) {
    return this.spaceElementService.bulkQuickCreateAndMap(spaceId, user.tenantId, body);
  }

  /**
   * Assign a list of SpaceElements to a floor level (creates the floor if needed)
   */
  @Post(':id/assign-floor')
  @RequirePermissions('space.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assigner des shops à un étage, au parvis ou à la zone External Merch' })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiBody({ type: AssignElementsToFloorDto })
  @ApiResponse({ status: 200, description: 'Shops assignés à l\'étage / parvis / external merch' })
  async assignElementsToFloor(
    @Param('id') spaceId: string,
    @CurrentTenant() tenantId: string,
    @Body() body: AssignElementsToFloorDto,
  ) {
    return this.spaceElementPlacementService.assignElementsToFloorLevel(spaceId, tenantId, body.elementIds, body.level, {
      configId: body.configId,
      width: body.width,
      length: body.length,
      height: body.height,
      zoneName: body.zoneName,
      position: body.position,
      shopDimensions: body.shopDimensions,
    });
  }

  /**
   * Lightweight floor/zone options for the step-2 "Assign floor" dialog
   */
  @Get(':id/floor-options')
  @ApiOperation({
    summary: 'Lister les zones/étages disponibles (dialogue « Assigner un étage », étape 2)',
    description:
      'Version LÉGÈRE : zones v2 (table Zone, source de vérité — retournées même vides) + ' +
      'floors legacy v1 (Floor relationnel + JSON config.data) pour les levels sans Zone v2. ' +
      'Éléments réduits à {id, name, x, y, width, depth} pour le minimap. ' +
      'Remplace la lecture getConfiguration (fusion complète) qui masquait les zones vides.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiQuery({ name: 'configId', required: false, description: 'Configuration cible (nécessaire pour le repli legacy v1)' })
  @ApiResponse({
    status: 200,
    description: 'Zones/étages de l\'espace',
    schema: {
      type: 'object',
      properties: {
        managedByV2: { type: 'boolean' },
        floors: { type: 'array', items: { type: 'object' } },
        forecourt: { type: 'object', nullable: true },
        externalMerch: { type: 'object', nullable: true },
      },
    },
  })
  async getFloorOptions(
    @Param('id') spaceId: string,
    @CurrentTenant() tenantId: string,
    @Query('configId') configId?: string,
  ) {
    return this.spaceElementService.getFloorOptions(spaceId, tenantId, configId);
  }
}
