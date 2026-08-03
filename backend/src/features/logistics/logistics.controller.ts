import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { LogisticsService } from './logistics.service';
import { CreateMovementDto, InventoryResetDto, SimulateSaleDto } from './dto/logistics.dto';
import { PurgeSimulatedSalesDto, StartSimulationRunDto } from './dto/simulation-run.dto';

@ApiTags('Logistics')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.logistic')
@Controller('logistics')
export class LogisticsController {
  private readonly logger = new Logger(LogisticsController.name);

  constructor(private readonly service: LogisticsService) {}

  @Get(':spaceId/stock')
  @ApiOperation({
    summary:
      "Stock attendu de l'espace : espace/configs + référentiel d'items par élément (PDV/Storage, noms résolus côté serveur) + StockLevel (mouvements manuels) + consommation ventes dérivée depuis la dernière réconciliation. Attendu affiché = level − consumption (casse de pack au rendu). Réponse auto-suffisante : le front n'a plus besoin du catalogue complet (menu items/ingredients/market prices).",
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiQuery({ name: 'configId', required: false, description: 'Configuration à lire (prioritaire)' })
  @ApiQuery({ name: 'eventId', required: false, description: 'Event dont la config résout la configuration si configId absent (deep-link Event Predict)' })
  async getStock(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
    @Query('configId') configId?: string,
    @Query('eventId') eventId?: string,
  ) {
    this.logger.log(`GET /logistics/${spaceId}/stock configId=${configId ?? '(auto)'}`);
    return this.service.getStock(spaceId, user.tenantId, configId || undefined, eventId || undefined);
  }

  @Get(':spaceId/market-prices')
  @ApiOperation({
    summary:
      "Market prices candidats pour le dropdown du popup +/− d'une denrée donnée — évite de charger le catalogue complet côté front.",
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiQuery({ name: 'itemKey', required: true, description: 'Nom de la denrée (référentiel Logistic)' })
  async getMarketPrices(
    @Param('spaceId') spaceId: string,
    @Query('itemKey') itemKey: string,
    @CurrentUser() user: any,
  ) {
    return this.service.getMarketPricesForItem(spaceId, user.tenantId, itemKey);
  }

  @Post('movements')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      "Mouvement de stock manuel (ajout/suppression avec raison). Un transfert crée atomiquement le mouvement miroir sur la contrepartie et met à jour les deux niveaux.",
  })
  @ApiResponse({ status: 201, description: 'Mouvement créé — renvoie { movement, level, counterpartyLevel }' })
  async createMovement(@Body() dto: CreateMovementDto, @CurrentUser() user: any) {
    this.logger.log(
      `POST /logistics/movements element=${dto.elementId} item="${dto.itemKey}" ${dto.direction} reason=${dto.reason}`,
    );
    return this.service.createMovement(dto, user.tenantId, user.id);
  }

  @Get('element/:elementId/history')
  @ApiOperation({
    summary:
      "Historique d'un PDV/storage : mouvements manuels paginés (cursor) + ventes agrégées par event (une ligne par event).",
  })
  @ApiParam({ name: 'elementId', description: 'ID du SpaceElement' })
  async getHistory(
    @Param('elementId') elementId: string,
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    this.logger.log(`GET /logistics/element/${elementId}/history`);
    const parsedLimit = Number(limit);
    return this.service.getHistory(
      elementId,
      user.tenantId,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
      cursor || undefined,
    );
  }

  @Post(':spaceId/reset')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('front.fb.logisticReconcile')
  @ApiOperation({
    summary:
      "Inventory Reset : fige les écarts attendu vs compté dans une réconciliation (nouvelle ancre des ventes), pose les mouvements d'ajustement et remplace les niveaux par les valeurs comptées.",
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  async reset(@Param('spaceId') spaceId: string, @Body() dto: InventoryResetDto, @CurrentUser() user: any) {
    this.logger.log(`POST /logistics/${spaceId}/reset (${dto.lines?.length ?? 0} lignes)`);
    return this.service.reset(spaceId, dto, user.tenantId, user.id);
  }

  @Get(':spaceId/reconciliations')
  @RequirePermissions('front.fb.logisticReconcile')
  @ApiOperation({ summary: "Liste des réconciliations de l'espace (section Réconciliation)" })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  async listReconciliations(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    return this.service.listReconciliations(spaceId, user.tenantId);
  }

  @Get('reconciliations/:id')
  @RequirePermissions('front.fb.logisticReconcile')
  @ApiOperation({ summary: "Détail d'une réconciliation (lignes d'écart)" })
  @ApiParam({ name: 'id', description: 'ID de la réconciliation' })
  async getReconciliation(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.getReconciliation(id, user.tenantId);
  }

  @Get('reconciliations/:id/export')
  @RequirePermissions('front.fb.logisticReconcile')
  @ApiOperation({ summary: "Export CSV des écarts d'une réconciliation" })
  @ApiParam({ name: 'id', description: 'ID de la réconciliation' })
  async exportReconciliation(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res() reply: FastifyReply,
  ) {
    const { reco, csv } = await this.service.exportReconciliationCsv(id, user.tenantId);
    const day = reco.createdAt.toISOString().slice(0, 10);
    const slug = (reco.eventName ?? 'inventaire').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase();
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="reconciliation-${day}-${slug}.csv"`)
      .send(csv);
  }

  @Post(':spaceId/simulate-sale')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('front.fb.logisticReconcile')
  @ApiOperation({
    summary:
      "QA — simule une vente Weezevent (transaction + items synthétiques marqués isSimulated dans les mêmes tables que le pipeline réel) pour tester la déduction de stock sans attendre une vraie vente. PDV et menu items doivent déjà être mappés à Weezevent. ⚠️ Visible aussi dans les dashboards revenus/analytics tant que non purgée (DELETE simulate-sale).",
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  async simulateSale(@Param('spaceId') spaceId: string, @Body() dto: SimulateSaleDto, @CurrentUser() user: any) {
    this.logger.log(`POST /logistics/${spaceId}/simulate-sale element=${dto.elementId} (${dto.lines?.length ?? 0} lignes)${dto.realMode ? ' [realMode]' : ''}${dto.ensureLiveEvent ? ' [ensureLiveEvent]' : ''}`);
    return this.service.simulateSale(spaceId, dto.elementId, dto.lines, user.tenantId, user.id, dto.realMode, dto.ensureLiveEvent);
  }

  @Delete(':spaceId/simulate-sale')
  @RequirePermissions('front.fb.logisticReconcile')
  @ApiOperation({ summary: "QA — purge les ventes simulées (isSimulated) d'un PDV, nettoyage post-test." })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiQuery({ name: 'elementId', required: true, description: 'PDV concerné' })
  async purgeSimulatedSales(
    @Param('spaceId') spaceId: string,
    @Query('elementId') elementId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`DELETE /logistics/${spaceId}/simulate-sale element=${elementId}`);
    return this.service.purgeSimulatedSales(spaceId, elementId, user.tenantId);
  }

  @Post(':spaceId/simulation-runs')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('front.fb.logisticReconcile')
  @ApiOperation({
    summary:
      "QA — démarre un run d'auto-simulation côté serveur (BullMQ Job Scheduler) : tire au hasard un PDV/menu item simulable et appelle simulateSale à intervalle régulier, indépendamment de tout onglet navigateur ouvert. Idempotent : renvoie le run déjà actif s'il y en a un pour cet espace.",
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  async startSimulationRun(
    @Param('spaceId') spaceId: string,
    @Body() dto: StartSimulationRunDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /logistics/${spaceId}/simulation-runs intervalMs=${dto.intervalMs}`);
    return this.service.startSimulationRun(spaceId, user.tenantId, user.id, dto);
  }

  @Post(':spaceId/simulation-runs/:runId/stop')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('front.fb.logisticReconcile')
  @ApiOperation({ summary: "QA — arrête un run d'auto-simulation actif (retire le Job Scheduler BullMQ)." })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiParam({ name: 'runId', description: 'ID du SimulationRun' })
  async stopSimulationRun(
    @Param('spaceId') spaceId: string,
    @Param('runId') runId: string,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /logistics/${spaceId}/simulation-runs/${runId}/stop`);
    return this.service.stopSimulationRun(spaceId, runId, user.tenantId, user.id);
  }

  @Get(':spaceId/simulation-runs/active')
  @RequirePermissions('front.fb.logisticReconcile')
  @ApiOperation({ summary: "QA — run d'auto-simulation actif de l'espace, s'il y en a un (survit au reload/fermeture d'onglet)." })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  async getActiveSimulationRun(@Param('spaceId') spaceId: string, @CurrentUser() user: any) {
    return this.service.getActiveSimulationRun(spaceId, user.tenantId);
  }

  @Get(':spaceId/simulation-runs')
  @RequirePermissions('front.fb.logisticReconcile')
  @ApiOperation({ summary: "QA — historique des runs d'auto-simulation de l'espace (actifs, arrêtés, échoués)." })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiQuery({ name: 'limit', required: false })
  async listSimulationRuns(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    return this.service.listSimulationRuns(spaceId, user.tenantId, Number(limit) || 20);
  }

  @Get(':spaceId/simulated-sales')
  @RequirePermissions('front.fb.logisticReconcile')
  @ApiOperation({ summary: "QA — historique paginé des ventes simulées de l'espace, tous PDV confondus." })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  async listSimulatedSales(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.listSimulatedSales(spaceId, user.tenantId, Number(limit) || 50, cursor || undefined);
  }

  @Post(':spaceId/simulated-sales/purge')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('front.fb.logisticReconcile')
  @ApiOperation({ summary: 'QA — purge sélective de ventes simulées par id de transaction (history dialog).' })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  async purgeSimulatedSalesByIds(
    @Param('spaceId') spaceId: string,
    @Body() dto: PurgeSimulatedSalesDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /logistics/${spaceId}/simulated-sales/purge (${dto.transactionIds?.length ?? 0} ids)`);
    return this.service.purgeSimulatedSalesByIds(spaceId, user.tenantId, dto.transactionIds);
  }
}
