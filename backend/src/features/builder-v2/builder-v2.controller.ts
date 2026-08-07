// Contrôleur Builder v2 — contrat docs/REFONTE_3D_BUILDER_V2.md §3.
// Préfixe /builder-v2 le temps de la COHABITATION avec le builder v1 : les chemins nus
// (PATCH/DELETE /configurations/:id) sont déjà pris par le contrôleur v1 (save-blob) —
// la bascule sur les chemins nus se fera en P4, à la dépose des routes v1.
import {
  Controller, Get, Post, Patch, Put, Delete, Body, Param, Query, Headers,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { BuilderV2Service } from './builder-v2.service';
import {
  CreateZoneDto, UpdateZoneDto, ReorderZonesDto, CreateElementDto, UpdateElementDto,
  BatchElementsDto, DuplicateElementDto, PutPerformanceDto, PutStaffDto, PutInventoryDto,
  CreateConfigurationDto, RenameConfigurationDto, DeleteConfigurationQueryDto,
  DeleteElementQueryDto, DeleteZoneQueryDto, PutMenuItemSalesInputDto,
} from './dto/builder-v2.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { SpaceIdParam } from '../../core/auth/decorators/space-id-param.decorator';

@ApiTags('Builder v2')
@ApiBearerAuth('supabase-jwt')
@Controller('builder-v2')
@SpaceIdParam('spaceId')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class BuilderV2Controller {
  constructor(private readonly service: BuilderV2Service) {}

  // ─── Bootstrap ──────────────────────────────────────────────────────────────

  @Get('spaces/:spaceId/state')
  @ApiOperation({
    summary: 'État complet du builder en 1 round-trip',
    description: 'space + zones (avec éléments) + configurations + adhésions + usage (mapping Weezevent, menus).',
  })
  @ApiParam({ name: 'spaceId', description: 'ID de l\'espace' })
  async getBuilderState(@Param('spaceId') spaceId: string, @CurrentTenant() tenantId: string) {
    return this.service.getBuilderState(spaceId, tenantId);
  }

  // ─── Zones ──────────────────────────────────────────────────────────────────

  @Post('spaces/:spaceId/zones')
  @RequirePermissions('space.edit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une zone (étage / parvis / espace externe)' })
  async createZone(
    @Param('spaceId') spaceId: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateZoneDto,
  ) {
    return this.service.createZone(spaceId, tenantId, dto);
  }

  // ⚠️ Déclarée AVANT zones/:id pour que « reorder » ne soit pas capturé comme un id.
  @Patch('zones/reorder')
  @RequirePermissions('space.edit')
  @ApiOperation({ summary: 'Réordonner les zones d\'un espace (sortIndex)' })
  async reorderZones(@CurrentTenant() tenantId: string, @Body() dto: ReorderZonesDto) {
    return this.service.reorderZones(dto.spaceId, tenantId, dto.orderedIds);
  }

  @Patch('zones/:id')
  @RequirePermissions('space.edit')
  @ApiOperation({ summary: 'Modifier une zone (nom, dimensions, geometry — hole/cornerRadius)' })
  async updateZone(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateZoneDto,
    @CurrentUser() user: any,
  ) {
    return this.service.updateZone(id, tenantId, dto, user);
  }

  @Delete('zones/:id')
  @RequirePermissions('space.edit')
  @ApiOperation({ summary: 'Supprimer une zone — 409 { blockers } si éléments utilisés, ?force=true après confirmation' })
  @ApiQuery({ name: 'force', required: false, enum: ['true', 'false'] })
  async deleteZone(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Query() query: DeleteZoneQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.service.deleteZone(id, tenantId, query.force === 'true', user);
  }

  @Post('zones/:id/duplicate')
  @RequirePermissions('space.edit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Dupliquer un étage (zone + éléments + adhésions, PAS les mappings)' })
  async duplicateZone(@Param('id') id: string, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.service.duplicateZone(id, tenantId, user);
  }

  // ─── Éléments ───────────────────────────────────────────────────────────────

  @Post('zones/:zoneId/elements')
  @RequirePermissions('space.edit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un élément — l\'id serveur revient dans la réponse (jamais d\'id temporaire)' })
  async createElement(
    @Param('zoneId') zoneId: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateElementDto,
    @CurrentUser() user: any,
  ) {
    return this.service.createElement(zoneId, tenantId, dto, user);
  }

  // ⚠️ Déclarée AVANT elements/:id (sinon « batch » serait pris pour un id).
  @Patch('elements/batch')
  @RequirePermissions('space.edit')
  @ApiOperation({ summary: 'Patch géométrique de plusieurs éléments en une transaction' })
  async patchElementsBatch(@CurrentTenant() tenantId: string, @Body() dto: BatchElementsDto, @CurrentUser() user: any) {
    return this.service.patchElementsBatch(tenantId, dto, user);
  }

  @Patch('elements/:id')
  @RequirePermissions('space.edit')
  @ApiOperation({ summary: 'PATCH partiel d\'un élément (verrou optimiste par élément)' })
  @ApiHeader({ name: 'If-Match', required: false, description: 'Version attendue — 409 si obsolète' })
  async patchElement(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateElementDto,
    @CurrentUser() user: any,
    @Headers('if-match') ifMatch?: string,
  ) {
    const expectedVersion = ifMatch !== undefined && ifMatch !== '' ? Number(ifMatch) : undefined;
    return this.service.patchElement(
      id,
      tenantId,
      dto,
      Number.isNaN(expectedVersion as number) ? undefined : expectedVersion,
      user,
    );
  }

  @Post('elements/:id/duplicate')
  @RequirePermissions('space.edit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Dupliquer un élément (copie adhésions + perf/staff/inventaire, PAS les mappings)' })
  async duplicateElement(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: DuplicateElementDto,
    @CurrentUser() user: any,
  ) {
    return this.service.duplicateElement(id, tenantId, dto, user);
  }

  @Delete('elements/:id')
  @RequirePermissions('space.edit')
  @ApiOperation({ summary: 'Supprimer un élément — 409 { reasons } si utilisé, ?force=true après confirmation' })
  @ApiQuery({ name: 'force', required: false, enum: ['true', 'false'] })
  async deleteElement(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Query() query: DeleteElementQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.service.deleteElement(id, tenantId, query.force === 'true', user);
  }

  @Put('elements/:id/performance')
  @RequirePermissions('space.edit')
  @ApiOperation({ summary: 'Remplacer les métriques de performance de l\'élément (scopé config : ?configId=, défaut 1re adhésion)' })
  async putPerformance(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: PutPerformanceDto,
    @CurrentUser() user: any,
    @Query('configId') configId?: string,
  ) {
    return this.service.putPerformance(id, tenantId, dto, configId || undefined, user);
  }

  @Put('elements/:id/staff')
  @RequirePermissions('space.edit')
  @ApiOperation({ summary: 'Remplacer la liste des postes staff de l\'élément (scopé config : ?configId=, défaut 1re adhésion)' })
  async putStaff(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: PutStaffDto,
    @CurrentUser() user: any,
    @Query('configId') configId?: string,
  ) {
    return this.service.putStaff(id, tenantId, dto, configId || undefined, user);
  }

  @Get('elements/:id/staff-suggestions')
  @ApiOperation({
    summary:
      "Postes obligatoires selon les sous-types F&B de l'élément + les règles Sinking RH du tenant (scopé config : ?configId=)",
    description:
      'Auto-remplissage de la section Staff (2026-07-30). Les règles Sinking avec condition ' +
      "d'équipement ne matchent jamais ici (aucun champ Builder ne renseigne encore ces attributs).",
  })
  async getStaffSuggestions(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query('configId') configId?: string,
  ) {
    return this.service.getStaffSuggestions(id, tenantId, configId || undefined, user);
  }

  @Get('elements/:id/menu-item-sales-input')
  @ApiOperation({
    summary: "Saisie manuelle 'vendu/prévu' par Menu Item pour ce shop (scopé config : ?configId=)",
    description: '11_RH_STAFFING.md §11.16 — source des associations Rôle↔MenuItem (HrRoleMenuItemRatio).',
  })
  async getMenuItemSalesInput(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query('configId') configId?: string,
  ) {
    return this.service.getMenuItemSalesInput(id, tenantId, configId || undefined, user);
  }

  @Put('elements/:id/menu-item-sales-input')
  @RequirePermissions('space.edit')
  @ApiOperation({ summary: "Remplacer la saisie 'vendu/prévu' par Menu Item de l'élément (scopé config : ?configId=)" })
  async putMenuItemSalesInput(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: PutMenuItemSalesInputDto,
    @CurrentUser() user: any,
    @Query('configId') configId?: string,
  ) {
    return this.service.putMenuItemSalesInput(id, tenantId, dto, configId || undefined, user);
  }

  @Put('elements/:id/inventory')
  @RequirePermissions('space.edit')
  @ApiOperation({ summary: 'Remplacer l\'inventaire de l\'élément (scopé config : ?configId=, défaut 1re adhésion)' })
  async putInventory(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: PutInventoryDto,
    @CurrentUser() user: any,
    @Query('configId') configId?: string,
  ) {
    return this.service.putInventory(id, tenantId, dto, configId || undefined, user);
  }

  // ─── Adhésions élément ↔ configuration ─────────────────────────────────────

  @Post('configurations/:configId/elements/:elementId')
  @RequirePermissions('space.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cocher : ajouter l\'élément à la configuration (idempotent)' })
  async addMembership(
    @Param('configId') configId: string,
    @Param('elementId') elementId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.addMembership(configId, elementId, tenantId, user);
  }

  @Delete('configurations/:configId/elements/:elementId')
  @RequirePermissions('space.edit')
  @ApiOperation({ summary: 'Décocher : retirer l\'adhésion — 409 si c\'est la dernière de l\'élément' })
  async removeMembership(
    @Param('configId') configId: string,
    @Param('elementId') elementId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.removeMembership(configId, elementId, tenantId, user);
  }

  // ─── Configurations ─────────────────────────────────────────────────────────

  @Post('spaces/:spaceId/configurations')
  @RequirePermissions('space.edit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une configuration — cloneFromConfigId = copie des adhésions (instantané)' })
  async createConfiguration(
    @Param('spaceId') spaceId: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateConfigurationDto,
    @CurrentUser() user: any,
  ) {
    return this.service.createConfiguration(spaceId, tenantId, dto, user);
  }

  @Patch('configurations/:id')
  @RequirePermissions('space.edit')
  @ApiOperation({ summary: 'Renommer une configuration — 404 stricte (pas d\'upsert)' })
  async renameConfiguration(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: RenameConfigurationDto,
    @CurrentUser() user: any,
  ) {
    return this.service.renameConfiguration(id, tenantId, dto.name, user);
  }

  @Delete('configurations/:id')
  @RequirePermissions('space.edit')
  @ApiOperation({
    summary: 'Supprimer une configuration — 409 { orphanCount } si des éléments seraient orphelins',
  })
  @ApiQuery({ name: 'orphanPolicy', required: false, enum: ['reassign', 'delete'] })
  @ApiQuery({ name: 'reassignToConfigId', required: false })
  async deleteConfiguration(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Query() query: DeleteConfigurationQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.service.deleteConfiguration(id, tenantId, {
      orphanPolicy: query.orphanPolicy,
      reassignToConfigId: query.reassignToConfigId,
    }, user);
  }
}
