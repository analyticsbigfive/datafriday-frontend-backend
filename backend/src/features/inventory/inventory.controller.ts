import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { CreatePostEventReconciliationDto } from './dto/create-post-event-reconciliation.dto';
import { CreatePreEventReconciliationDto } from './dto/create-pre-event-reconciliation.dto';

@ApiTags('Inventory')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.spaceInventory')
@Controller('inventory')
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(private readonly inventoryService: InventoryService) {}

  /** BUG-233 — l'appelant a-t-il le droit de VOIR les quantités attendues ?
   *  Même logique que PermissionsGuard (ADMIN systemKey = tout, sinon OR sur
   *  `user.role.permissions`) : sans ce droit, les lignes pre-event des
   *  réconciliations sont expurgées côté service (le POST reste autorisé —
   *  le flux « Sauvegarder → réconciliation » d'un compteur ne casse pas). */
  private canSeeExpected(user: any): boolean {
    return (
      user?.role?.systemKey === 'ADMIN' ||
      ((user?.role?.permissions ?? []) as string[]).includes('front.fb.preInventoryExpected')
    );
  }

  // ':spaceId/latest' MUST come before ':spaceId/:eventId' — otherwise Fastify
  // would route GET /inventory/abc/latest to the /:eventId handler with eventId='latest'.
  @Get(':spaceId/latest')
  @ApiOperation({ summary: "Dernier snapshot d'inventaire d'un espace (tous events)" })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiResponse({
    status: 200,
    description: 'Snapshot le plus récent — contient inventoryCounts + eventId',
  })
  @ApiResponse({ status: 404, description: 'Aucun snapshot trouvé' })
  async getLatestBySpace(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    this.logger.log(`GET /inventory/${spaceId}/latest`);
    return this.inventoryService.getLatestBySpace(spaceId, user.tenantId);
  }

  // ⚠️ Comme ':spaceId/latest' : toute route statique à 2 segments DOIT être
  // déclarée avant ':spaceId/:eventId', sinon Fastify router 'reconciliations'
  // comme un eventId.
  @Get(':spaceId/reconciliations')
  @ApiOperation({
    summary: 'Documents de réconciliation pre + post-événement du space (lines et kind inclus)',
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiResponse({ status: 200, description: 'Liste commune triée du plus récent au plus ancien' })
  async listInventoryReconciliations(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    this.logger.log(`GET /inventory/${spaceId}/reconciliations`);
    return this.inventoryService.listInventoryReconciliations(
      spaceId,
      user.tenantId,
      this.canSeeExpected(user),
    );
  }

  // Suppression d'un document pre/post-event (« repartir de zéro » : delete puis
  // regénérer). Segment statique à 3 niveaux — pas de conflit avec ':spaceId/:eventId'.
  @Delete(':spaceId/reconciliations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer un document de réconciliation pre/post-event' })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiParam({ name: 'id', description: 'ID du document (kind pre/post-event uniquement)' })
  @ApiResponse({ status: 200, description: 'Document supprimé' })
  @ApiResponse({ status: 404, description: 'Document inconnu ou hors périmètre (resets logistiques exclus)' })
  async deleteInventoryReconciliation(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`DELETE /inventory/${spaceId}/reconciliations/${id}`);
    return this.inventoryService.deleteInventoryReconciliation(spaceId, id, user.tenantId);
  }

  // Quantités ATTENDUES du Pre-event Inventory — gating par PERMISSION DÉDIÉE
  // (décorateur méthode : getAllAndOverride → remplace le spaceInventory de la
  // classe, même pattern que logisticReconcile côté logistics).
  @Get(':spaceId/pre-event-baseline/:eventId')
  @RequirePermissions('front.fb.preInventoryExpected')
  @ApiOperation({
    summary:
      'Quantités attendues du Pre-event Inventory (post-event précédent + mouvements Logistic) — permission dédiée',
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiParam({ name: 'eventId', description: "ID de l'événement FUTUR compté" })
  @ApiResponse({ status: 200, description: 'baseline null si aucun post-event précédent' })
  async getPreEventBaseline(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`GET /inventory/${spaceId}/pre-event-baseline/${eventId}`);
    return this.inventoryService.getPreEventBaseline(spaceId, eventId, user.tenantId);
  }

  @Post(':spaceId/pre-event-reconciliations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Créer la réconciliation PRE-event (attendu vs compté) — lignes construites côté serveur',
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiResponse({ status: 200, description: 'Document créé (kind=pre-event)' })
  async createPreEventReconciliation(
    @Param('spaceId') spaceId: string,
    @Body() dto: CreatePreEventReconciliationDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /inventory/${spaceId}/pre-event-reconciliations eventId=${dto.eventId}`);
    return this.inventoryService.createPreEventReconciliation(
      spaceId,
      dto.eventId,
      user.tenantId,
      user.id,
      this.canSeeExpected(user),
    );
  }

  @Get(':spaceId/pre-event/:eventId')
  @ApiOperation({
    summary: "Inventaire de référence pré-événement (dernier snapshot antérieur au jour de l'event)",
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiParam({ name: 'eventId', description: "ID de l'événement" })
  @ApiResponse({ status: 200, description: 'Snapshot ou null (jamais 404 pour « pas de pré-inventaire »)' })
  async getPreEventInventory(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`GET /inventory/${spaceId}/pre-event/${eventId}`);
    return this.inventoryService.getPreEventInventory(spaceId, eventId, user.tenantId);
  }

  @Post(':spaceId/reconciliations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Créer un document de réconciliation post-événement (kind=post-event)' })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiResponse({ status: 200, description: 'Document créé' })
  async createPostEventReconciliation(
    @Param('spaceId') spaceId: string,
    @Body() dto: CreatePostEventReconciliationDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /inventory/${spaceId}/reconciliations eventId=${dto.eventId}`);
    return this.inventoryService.createPostEventReconciliation(spaceId, dto, user.tenantId, user.id);
  }

  @Get(':spaceId/:eventId')
  @ApiOperation({ summary: "Dernier snapshot d'inventaire pour un espace+événement" })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiParam({ name: 'eventId', description: "ID de l'événement" })
  @ApiResponse({ status: 200, description: 'Snapshot avec inventoryCounts' })
  @ApiResponse({ status: 404, description: 'Aucun snapshot trouvé' })
  async getBySpaceAndEvent(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`GET /inventory/${spaceId}/${eventId}`);
    return this.inventoryService.getBySpaceAndEvent(spaceId, eventId, user.tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Enregistrer un snapshot d'inventaire (append-only)" })
  @ApiResponse({ status: 200, description: 'Snapshot créé' })
  async upsertInventory(@Body() dto: CreateInventoryDto, @CurrentUser() user: any) {
    this.logger.log(`POST /inventory spaceId=${dto.spaceId}`);
    return this.inventoryService.upsertInventory(dto, user.tenantId, user.id);
  }
}

@ApiTags('Inventory')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.spaceInventory')
@Controller('inventory-counts')
export class InventoryCountsController {
  private readonly logger = new Logger(InventoryCountsController.name);

  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upsert un comptage unitaire (par space+event+shop+item)' })
  @ApiResponse({ status: 200, description: 'Comptage upserted' })
  async saveInventoryCounts(@Body() dto: CreateInventoryCountDto, @CurrentUser() user: any) {
    this.logger.log(`POST /inventory-counts itemId=${dto.itemId}`);
    return this.inventoryService.saveInventoryCounts(dto, user.tenantId, user.id);
  }
}
