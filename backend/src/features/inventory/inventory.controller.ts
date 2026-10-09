import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser, CurrentUserData } from '../../core/auth/decorators/current-user.decorator';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { CreatePostEventReconciliationDto } from './dto/create-post-event-reconciliation.dto';
import { CreatePreEventReconciliationDto } from './dto/create-pre-event-reconciliation.dto';
import { RecountElementDto } from './dto/recount-element.dto';
import { PostEventContextDto } from './dto/post-event-context.dto';
import { PostEventDraftService } from './post-event-draft.service';
import { PushToLogisticDto } from './dto/push-to-logistic.dto';
import { RegeneratePreEventReconciliationDto } from './dto/regenerate-pre-event-reconciliation.dto';
import { PreEventInventoryFlowService } from './pre-event-inventory-flow.service';
import { InventoryBaselineService } from './services/inventory-baseline.service';
import { InventoryCountService } from './services/inventory-count.service';
import { InventoryLogisticPushService } from './services/inventory-logistic-push.service';
import { InventoryReconciliationService } from './services/inventory-reconciliation.service';

@ApiTags('Inventory')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.spaceInventory')
@Controller('inventory')
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(
    private readonly inventoryBaselineService: InventoryBaselineService,
    private readonly inventoryCountService: InventoryCountService,
    private readonly inventoryLogisticPushService: InventoryLogisticPushService,
    private readonly inventoryReconciliationService: InventoryReconciliationService,
    private readonly preEventFlow: PreEventInventoryFlowService,
    private readonly postEventDraft: PostEventDraftService,
  ) {}

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
    return this.inventoryCountService.getLatestBySpace(spaceId, user.tenantId);
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
    return this.inventoryReconciliationService.listInventoryReconciliations(
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
    return this.inventoryReconciliationService.deleteInventoryReconciliation(spaceId, id, user.tenantId);
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
    return this.inventoryBaselineService.getPreEventBaseline(spaceId, eventId, user.tenantId);
  }

  // Indice de référence du Post-event Inventory. MÊME permission dédiée que le
  // pre-event : sans le décorateur méthode, `getAllAndOverride` retomberait sur le
  // `front.fb.spaceInventory` de la classe et tout compteur recevrait les attendus
  // — la fuite que BUG-233 a fermée.
  //
  // Route DÉDIÉE plutôt qu'un `?phase=` sur pre-event-baseline : un backend
  // antérieur 404 sur une route inconnue (le front dégrade en « — »), alors qu'il
  // IGNORE un query param inconnu et renverrait les attendus pre-event sur l'écran
  // post-event — des chiffres faux sans aucun signal (famille BUG-228).
  // Déclarée avant le catch-all `@Get(':spaceId/:eventId')` par convention de ce
  // contrôleur ; aucun conflit Fastify possible ici (3 segments vs 2).
  @Get(':spaceId/post-event-baseline/:eventId')
  @RequirePermissions('front.fb.preInventoryExpected')
  @ApiOperation({
    summary:
      'Indice attendu du Post-event Inventory (pre-event du même match + mouvements de la fenêtre − ventes) — permission dédiée',
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiParam({ name: 'eventId', description: "ID de l'événement compté" })
  @ApiResponse({
    status: 200,
    description:
      "baseline/expected null si l'événement n'a pas de comptage pre-event ; expectedUnits peut être négatif (incohérence de sources, jamais clampé)",
  })
  async getPostEventBaseline(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`GET /inventory/${spaceId}/post-event-baseline/${eventId}`);
    return this.inventoryBaselineService.getPostEventBaseline(spaceId, eventId, user.tenantId);
  }

  // Mise à jour de Logistic : responsable logistique ou administrateur du site seulement
  // (règle Bertrand 2026-09-29), comme les quatre actions ci-dessous.
  @Post(':spaceId/pre-event-reconciliations')
  @RequirePermissions('front.fb.logisticReconcile')
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
    // Même chemin que les générations automatiques (UNE feuille par match, lignes
    // déjà poussées reprises, push Logistic incrémental) : le Save manuel ne crée
    // plus une feuille de plus à côté de celle du flux.
    const result = await this.preEventFlow.regenerate(
      spaceId,
      dto.eventId,
      user.tenantId,
      user.id,
      'manual',
      {},
      { predictedUnits: dto.predictedUnits ?? null, canSeeExpected: this.canSeeExpected(user) },
    );
    if (!result.ok) {
      throw new BadRequestException(
        result.reason === 'no-counts'
          ? 'Aucun comptage pour cet événement'
          : `Réconciliation non générée (${result.reason})`,
      );
    }
    return result.document;
  }

  @Get(':spaceId/pre-event-window/:eventId')
  @ApiOperation({
    summary:
      "État de la fenêtre d'édition pre-event (source unique, instants UTC) : heure d'ouverture des portes " +
      "(sessions.doorsOpening, fuseau du space), fin des 30 min d'édition, phase, passage portes ouvertes déjà fait.",
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiParam({ name: 'eventId', description: "ID de l'événement" })
  @ApiResponse({
    status: 200,
    description: "{ phase: 'no-doors-open'|'before'|'editing'|'locked', doorsOpenAt, editDeadline, doorsOpenDone }",
  })
  async getPreEventWindow(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    return this.preEventFlow.getWindowState(spaceId, eventId, user.tenantId);
  }

  @Post(':spaceId/pre-event-doors-open')
  @RequirePermissions('front.fb.logisticReconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Passage « portes ouvertes » manuel : clôt la fenêtre PIN pre-event, génère la feuille et pousse l'incrément " +
      "vers Logistic. Idempotent (already-initialized si déjà passé, par le cron ou à la main).",
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiResponse({ status: 200, description: '{ ok, reconciliationId, lineCount } ou { ok: false, reason }' })
  async triggerPreEventDoorsOpen(
    @Param('spaceId') spaceId: string,
    @Body() dto: RegeneratePreEventReconciliationDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /inventory/${spaceId}/pre-event-doors-open eventId=${dto.eventId}`);
    const event = await this.preEventFlow.findEvent(spaceId, dto.eventId, user.tenantId);
    if (!event) throw new NotFoundException(`Event ${dto.eventId} not found in space ${spaceId}`);
    return this.preEventFlow.runDoorsOpen(event, user.id ? `user:${user.id}` : 'manual-doors-open');
  }

  @Post(':spaceId/pre-event-reconciliations/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "(Re)génère LA feuille pre-event du match depuis les comptages vivants et recale la Logistique. " +
      "Appelé par l'écran quand tous les articles d'un PDV sont comptés (le serveur ne connaît pas la liste explosée).",
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiResponse({ status: 200, description: '{ ok, reconciliationId, lineCount } ou { ok: false, reason }' })
  async regeneratePreEventReconciliation(
    @Param('spaceId') spaceId: string,
    @Body() dto: RegeneratePreEventReconciliationDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `POST /inventory/${spaceId}/pre-event-reconciliations/regenerate eventId=${dto.eventId} element=${dto.elementId ?? '-'}`,
    );
    // Feuille + Logistic, avant comme après les portes (D1, document Bertrand 2026-10-06).
    return this.preEventFlow.regenerateOnPdvComplete(
      spaceId,
      dto.eventId,
      user.tenantId,
      user.id,
      dto.elementId,
      dto.predictedUnits ?? null,
    );
  }

  @Get(':spaceId/event-consumption/:eventId')
  @ApiOperation({
    summary:
      "Ventes de l'événement explosées en consommation d'ingrédients (cascade Logistic) — source « Vendu » de la réconciliation post-event (Q35 Option 1). Les ventes non rattachables (PdV non mappé, produit sans mapping) sortent dans `unjoined`, jamais écartées en silence.",
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiParam({ name: 'eventId', description: "ID de l'événement (fenêtre eventDate → fin+1j)" })
  @ApiResponse({ status: 200, description: '{ lines: [{elementId, itemKey, quantity}], unjoined }' })
  @ApiResponse({ status: 404, description: 'Espace ou événement inconnu pour ce tenant' })
  async getEventSalesConsumption(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`GET /inventory/${spaceId}/event-consumption/${eventId}`);
    return this.inventoryBaselineService.getEventSalesConsumption(spaceId, eventId, user.tenantId);
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
    return this.inventoryBaselineService.getPreEventInventory(spaceId, eventId, user.tenantId);
  }

  // Génère la réconciliation post-event, pousse le comptage vers Logistic et CLÔT le
  // post-event (fenêtre PIN invité comprise).
  @Post(':spaceId/reconciliations')
  @RequirePermissions('front.fb.logisticReconcile')
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
    return this.inventoryReconciliationService.createPostEventReconciliation(spaceId, dto, user.tenantId, user.id);
  }

  // Brouillon de la feuille post-event (PDV complet, recomptage) : ne touche ni Logistic
  // ni la fenêtre PIN, ouvert à tous ceux qui comptent (permission de classe).
  @Post(':spaceId/reconciliations/draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Régénère la feuille post-event du match en brouillon (sans Logistic ni clôture)' })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  async createPostEventReconciliationDraft(
    @Param('spaceId') spaceId: string,
    @Body() dto: CreatePostEventReconciliationDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /inventory/${spaceId}/reconciliations/draft eventId=${dto.eventId}`);
    return this.inventoryReconciliationService.createPostEventReconciliation(spaceId, dto, user.tenantId, user.id, {
      draft: true,
    });
  }

  // Contexte de la réconciliation post-event (prédit, coût, unité calculés par l'écran) :
  // le serveur tient le document et le reconstruit aussitôt (lot 4b, 2026-10-06).
  @Post(':spaceId/post-event-context')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Contexte de l'écran pour la réconciliation post-event, puis brouillon reconstruit" })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  async savePostEventContext(
    @Param('spaceId') spaceId: string,
    @Body() dto: PostEventContextDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    this.logger.log(`POST /inventory/${spaceId}/post-event-context eventId=${dto.eventId} lines=${dto.lines?.length ?? 0}`);
    return this.postEventDraft.saveContext(spaceId, dto, user.tenantId!, user.id);
  }

  @Post(':spaceId/recount-element')
  @RequirePermissions('front.fb.logisticReconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '« Recompter » un point de vente en post-event : articles remis à compter' })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  async recountElement(
    @Param('spaceId') spaceId: string,
    @Body() dto: RecountElementDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /inventory/${spaceId}/recount-element eventId=${dto.eventId} element=${dto.elementId}`);
    return this.inventoryCountService.resetElementForRecount(spaceId, dto.eventId, dto.elementId, user.tenantId, user.id);
  }

  @Post(':spaceId/push-to-logistic')
  @RequirePermissions('front.fb.logisticReconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Bouton \"Update Logistic\" — pousse manuellement le comptage courant (Pre ou Post-event) vers le registre Logistic (StockLevel), sans créer de document de réconciliation.",
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiResponse({ status: 200, description: 'Registre Logistic mis à jour' })
  async pushToLogistic(
    @Param('spaceId') spaceId: string,
    @Body() dto: PushToLogisticDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(
      `POST /inventory/${spaceId}/push-to-logistic eventId=${dto.eventId} phase=${dto.phase} element=${dto.elementId ?? '-'}`,
    );
    // Pre-event, un PDV : la feuille pre-event est régénérée (écarts à jour), seul ce PDV
    // part vers le registre.
    if (dto.phase === 'pre-event' && dto.elementId) {
      const result = await this.preEventFlow.pushElementToLogistic(
        spaceId,
        dto.eventId,
        user.tenantId,
        user.id,
        dto.elementId,
      );
      const push = result.logisticPush;
      if (!result.ok || !push?.ok) {
        const reason = result.ok ? push?.reason : result.reason;
        throw new BadRequestException(
          reason === 'no-counts' || reason === 'no-addressable-lines'
            ? 'Aucun item compté à pousser vers Logistic pour ce point de vente'
            : reason === 'nothing-new'
              ? 'Registre Logistic déjà à jour pour ce point de vente'
              : 'Échec de la mise à jour du registre Logistic',
        );
      }
      return { ok: true, lineCount: push.lineCount };
    }
    return this.inventoryLogisticPushService.pushCurrentCountToLogistic(
      spaceId,
      dto.eventId,
      user.tenantId,
      dto.phase,
      user.id,
      dto.elementId,
    );
  }

  @Get(':spaceId/:eventId')
  @ApiOperation({ summary: "Dernier snapshot d'inventaire pour un espace+événement" })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiParam({ name: 'eventId', description: "ID de l'événement" })
  @ApiQuery({
    name: 'phase',
    required: false,
    enum: ['pre-event', 'post-event'],
    description:
      "Phase du comptage demandé (BUG-237). 'post-event' : les lignes figées avant la clôture du " +
      'Pre-event sont renvoyées comme proposition (valeurs conservées, isCounted=false) — sans ce ' +
      "paramètre, comportement historique inchangé.",
  })
  @ApiResponse({ status: 200, description: 'Snapshot avec inventoryCounts' })
  @ApiResponse({ status: 404, description: 'Aucun snapshot trouvé' })
  async getBySpaceAndEvent(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
    @Query('phase') phase?: string,
  ) {
    this.logger.log(`GET /inventory/${spaceId}/${eventId} phase=${phase ?? 'none'}`);
    const validPhase = phase === 'pre-event' || phase === 'post-event' ? phase : undefined;
    return this.inventoryCountService.getBySpaceAndEvent(spaceId, eventId, user.tenantId, validPhase);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Enregistrer un snapshot d'inventaire (append-only)" })
  @ApiResponse({ status: 200, description: 'Snapshot créé' })
  async upsertInventory(@Body() dto: CreateInventoryDto, @CurrentUser() user: any) {
    this.logger.log(`POST /inventory spaceId=${dto.spaceId}`);
    return this.inventoryCountService.upsertInventory(dto, user.tenantId, user.id);
  }
}

@ApiTags('Inventory')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.spaceInventory')
@Controller('inventory-counts')
export class InventoryCountsController {
  private readonly logger = new Logger(InventoryCountsController.name);

  constructor(private readonly preEventFlow: PreEventInventoryFlowService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Upsert un comptage unitaire (par space+event+shop+item). En phase pre-event : verrou 30 min après ' +
      "l'ouverture des portes (403) et marquage de la feuille à régénérer.",
  })
  @ApiResponse({ status: 200, description: 'Comptage upserted' })
  async saveInventoryCounts(@Body() dto: CreateInventoryCountDto, @CurrentUser() user: any) {
    this.logger.log(`POST /inventory-counts itemId=${dto.itemId} phase=${dto.phase ?? '-'}`);
    return this.preEventFlow.saveCount(dto, user.tenantId, user.id);
  }
}
