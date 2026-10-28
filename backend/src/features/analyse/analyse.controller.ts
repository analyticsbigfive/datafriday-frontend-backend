import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { AnalyseService } from './analyse.service';
import { AnalyseGetTimelineQueryDto } from './dto/analyse.query.dto';
import { ArticleDimensionsQueryDto, EventCostsQueryDto, EventValuationQueryDto, StockValuationQueryDto } from './dto/analyse-rendement.query.dto';
import { ArticleDimensionsService } from './article-dimensions.service';
import { StockValuationService } from './stock-valuation.service';
import { EventValuationService } from './event-valuation.service';
import { EventCostsService } from './event-costs.service';
import { ReportLayoutService } from './report-layout/report-layout.service';
import { SaveReportLayoutDto } from './report-layout/report-layout.dto';

@ApiTags('Analyse')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('analyse')
export class AnalyseController {
  constructor(
    private readonly analyseService: AnalyseService,
    private readonly articleDimensions: ArticleDimensionsService,
    private readonly stockValuation: StockValuationService,
    private readonly eventValuation: EventValuationService,
    private readonly eventCosts: EventCostsService,
    private readonly reportLayouts: ReportLayoutService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('front.fb.analyse')
  @ApiOperation({
    summary: 'Compteurs d\'entités du tenant (dashboard analytique)',
    description:
      'Retourne les compteurs d\'entités du tenant : menu items, composants, ingrédients, ' +
      'fournisseurs, événements et espaces. `spaceId` (optionnel) scope le compteur ' +
      'd\'événements sur cet espace — les autres compteurs sont des référentiels tenant-level. ' +
      'Pour les KPIs financiers (CA, marge), voir GET /analyse/kpis/events et /analyse/kpis/menu.',
  })
  @ApiQuery({ name: 'spaceId', required: false, description: 'Scoper le compteur d\'événements sur cet espace' })
  @ApiResponse({
    status: 200,
    description: 'Compteurs d\'entités',
    schema: {
      type: 'object',
      properties: {
        menuItems: { type: 'number', example: 42 },
        components: { type: 'number', example: 17 },
        ingredients: { type: 'number', example: 120 },
        suppliers: { type: 'number', example: 6 },
        events: { type: 'number', example: 8 },
        spaces: { type: 'number', example: 2 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getDashboard(@Req() req, @Query('spaceId') spaceId?: string) {
    return this.analyseService.getDashboard(req.user.tenantId, spaceId || undefined, req.user);
  }

  @Get('kpis/menu')
  @RequirePermissions('front.fb.analyse')
  @ApiOperation({
    summary: 'KPIs agrégés du catalogue menu du tenant',
    description: 'Retourne les KPIs agrégés du catalogue : total items, prix/coût/marge moyens, items à marge faible/haute, répartition par type.',
  })
  @ApiResponse({
    status: 200,
    description: 'KPIs agrégés du catalogue menu',
    schema: {
      type: 'object',
      properties: {
        totalItems: { type: 'number', example: 42 },
        avgPrice: { type: 'number', example: 8.5 },
        avgCost: { type: 'number', example: 3.2 },
        avgMargin: { type: 'number', example: 61.6, description: 'Marge moyenne en %' },
        lowMarginItems: { type: 'number', description: 'Items avec 0 < marge < 30%' },
        highMarginItems: { type: 'number', description: 'Items avec marge >= 60%' },
        byType: { type: 'object', additionalProperties: { type: 'number' }, description: 'Compteur d\'items par typeId (« unclassified » si non typé)' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getMenuKpis(@Req() req) {
    return this.analyseService.getMenuKpis(req.user.tenantId);
  }

  @Get('kpis/events')
  @RequirePermissions('front.fb.analyse')
  @ApiOperation({
    summary: 'KPIs agrégés des événements du tenant',
    description:
      'Retourne les KPIs agrégés des événements : total, CA total/moyen, transactions, ' +
      'à venir, terminés. `spaceId` (optionnel) scope l\'agrégat sur cet espace.',
  })
  @ApiQuery({ name: 'spaceId', required: false, description: 'Scoper les KPIs sur cet espace' })
  @ApiResponse({
    status: 200,
    description: 'KPIs agrégés des événements',
    schema: {
      type: 'object',
      properties: {
        totalEvents: { type: 'number', example: 8 },
        totalRevenue: { type: 'number', example: 12500.5 },
        avgRevenue: { type: 'number', example: 1562.56 },
        totalTransactions: { type: 'number', example: 4200 },
        upcoming: { type: 'number', description: 'Événements à date future' },
        completed: { type: 'number', description: 'Événements status success/completed' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getEventKpis(@Req() req, @Query('spaceId') spaceId?: string) {
    return this.analyseService.getEventKpis(req.user.tenantId, spaceId || undefined, req.user);
  }

  @Get('timeline/:eventId')
  @RequirePermissions('front.fb.analyse')
  @ApiOperation({
    summary: 'Timeline minute par minute d\'un événement (via WeezeventEvent.id)',
    description:
      'Agrège les ventes par minute × merchant × article. eventId = WeezeventEvent.id. ' +
      'Paramètres optionnels : startTime/endTime (HH:MM), shopId (merchantId), menuItemId, limit (défaut 1000, max 5000).',
  })
  @ApiParam({ name: 'eventId', description: 'WeezeventEvent.id' })
  @ApiQuery({ name: 'startTime', required: false, description: 'Heure de début HH:MM' })
  @ApiQuery({ name: 'endTime', required: false, description: 'Heure de fin HH:MM' })
  @ApiQuery({ name: 'shopId', required: false, description: 'Filtrer par merchantId Weezevent' })
  @ApiQuery({ name: 'menuItemId', required: false, description: 'Filtrer par menuItemId mappé' })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre max de lignes (défaut 1000, max 5000)' })
  @ApiResponse({
    status: 200,
    description: 'Enregistrements timeline',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          shopId: { type: 'string', nullable: true },
          shopName: { type: 'string', nullable: true },
          menuItemId: { type: 'string', nullable: true },
          menuItemName: { type: 'string', nullable: true },
          hour: { type: 'number' },
          minute: { type: 'string', example: '19:42' },
          quantity: { type: 'integer' },
          transactionCount: { type: 'integer' },
          revenue: { type: 'number' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getTimeline(
    @Param('eventId') eventId: string,
    @Query() params: AnalyseGetTimelineQueryDto,
    @Req() req?: any,
  ) {
    const { startTime, endTime, shopId, menuItemId, limit } = params;
    return this.analyseService.getTimeline(eventId, req.user.tenantId, {
      startTime,
      endTime,
      shopId,
      menuItemId,
      limit: limit ? Math.min(parseInt(limit, 10), 5000) : undefined,
    });
  }

  @Get('cost-breakdown')
  @RequirePermissions('back.fb.costTracking')
  @ApiOperation({
    summary: 'Articles à plus faible marge (top 20)',
    description: 'Retourne les 20 articles du tenant à plus faible marge, avec prix, coût total, type et catégorie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Top 20 articles par marge croissante',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          basePrice: { type: 'number' },
          totalCost: { type: 'number' },
          margin: { type: 'number', description: 'Marge en %' },
          type: { type: 'string', description: 'Nom du type produit (« N/A » si absent)' },
          category: { type: 'string', description: 'Nom de la catégorie (« N/A » si absente)' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getCostBreakdown(@Req() req) {
    return this.analyseService.getCostBreakdown(req.user.tenantId);
  }
  @Get('article-dimensions')
  @RequirePermissions('front.fb.analyse')
  @ApiOperation({
    summary: 'Dimensions des articles (marque, industriel, fournisseur, promotion, combo)',
    description:
      'Par menuItemId : marque, parts par industriel (prorata du coût de recette), coût par unité vendue et par ' +
      'fournisseur, promotion active et poids des enfants d\'un combo. `spaceId` (optionnel) restreint aux articles ' +
      'vendus dans l\'espace (et aux enfants de leurs combos) et applique le prix propre à l\'espace.',
  })
  @ApiQuery({ name: 'spaceId', required: false })
  @ApiResponse({ status: 200, description: '{ items: ArticleDimension[] }' })
  getArticleDimensions(@Req() req, @Query() query: ArticleDimensionsQueryDto) {
    return this.articleDimensions.getDimensions(req.user.tenantId, query.spaceId || undefined, req.user);
  }

  @Get('stock-valuation')
  @RequirePermissions('front.fb.analyse')
  @ApiOperation({
    summary: 'Valorisation du stock Logistique actuel d\'un espace',
    description:
      'Σ (packedUnits × unitsPerPack + looseUnits) × coût unitaire résolu par kind. Lignes sans coût comptées à part, ' +
      'jamais valorisées à 0. Filtres CSV optionnels : shopIds, shopTypes, shopAreas, industrialIds, supplierIds. ' +
      'Les stockages sont exclus dès qu\'un filtre PdV / type / zone est actif.',
  })
  @ApiQuery({ name: 'spaceId', required: true })
  @ApiQuery({ name: 'shopIds', required: false, description: 'CSV d\'ids de PdV (SpaceElement.id)' })
  @ApiQuery({ name: 'shopTypes', required: false, description: 'CSV de sous-types de PdV' })
  @ApiQuery({ name: 'shopAreas', required: false, description: 'CSV de zones (SpaceElement.area)' })
  @ApiQuery({ name: 'industrialIds', required: false })
  @ApiQuery({ name: 'supplierIds', required: false })
  getStockValuation(@Req() req, @Query() query: StockValuationQueryDto) {
    return this.stockValuation.getValuation(req.user.tenantId, query, req.user);
  }

  @Get('event-valuation')
  @RequirePermissions('front.fb.analyse')
  @ApiOperation({
    summary: 'Valorisation de la dernière feuille post-event de chaque match',
    description:
      'Par event : Σ countedUnits × unitCost de la dernière StockReconciliation kind=post-event (brouillon ou finale). ' +
      'Lignes sans unitCost revalorisées au coût actuel. Event sans feuille : value null, reason no-post-event-sheet.',
  })
  @ApiQuery({ name: 'spaceId', required: true })
  @ApiQuery({ name: 'eventIds', required: true, description: 'CSV d\'Event.id' })
  @ApiQuery({ name: 'shopIds', required: false, description: 'CSV d\'ids de PdV (elementId des lignes)' })
  getEventValuation(@Req() req, @Query() query: EventValuationQueryDto) {
    return this.eventValuation.getValuations(req.user.tenantId, query, req.user);
  }

  @Get(':spaceId/event-costs')
  @RequirePermissions('front.fb.analyse')
  @ApiOperation({
    summary: 'Coût des articles à la date de chaque event',
    description:
      'Par event : carte menuItemId vers le coût de fournée (totalCost, même sémantique que menuItemCostMap), lu dans ' +
      'l\'historique de coûts à l\'instant de référence de l\'event (portes ouvertes, sinon minuit local). Article sans ' +
      'snapshot : coût courant de MenuItem (source current). 100 events maximum.',
  })
  @ApiParam({ name: 'spaceId' })
  @ApiQuery({ name: 'eventIds', required: true, description: 'CSV d\'Event.id (100 max)' })
  getEventCosts(@Req() req, @Param('spaceId') spaceId: string, @Query() query: EventCostsQueryDto) {
    return this.eventCosts.getEventCosts(req.user.tenantId, spaceId, query.eventIds, req.user);
  }

  @Get(':spaceId/report-layouts/:kind')
  @RequirePermissions('front.fb.analyse')
  @ApiOperation({
    summary: 'Mise en page d\'un rapport pour l\'espace',
    description: 'Retourne { layout, version }. Sans mise en page enregistrée : layout vide { version: 1, slots: [] } et version 0. Kind accepté : j1-page2.',
  })
  @ApiParam({ name: 'spaceId' })
  @ApiParam({ name: 'kind', example: 'j1-page2' })
  getReportLayout(@Req() req, @Param('spaceId') spaceId: string, @Param('kind') kind: string) {
    return this.reportLayouts.get(req.user.tenantId, spaceId, kind, req.user);
  }

  @Put(':spaceId/report-layouts/:kind')
  @RequirePermissions('front.fb.analyse')
  @ApiOperation({
    summary: 'Enregistre la mise en page d\'un rapport pour l\'espace',
    description: 'Upsert avec verrou optimiste : 409 si `version` ne correspond pas à celle en base. Incrémente la version et retourne { layout, version }. 400 si le layout est invalide.',
  })
  @ApiParam({ name: 'spaceId' })
  @ApiParam({ name: 'kind', example: 'j1-page2' })
  saveReportLayout(@Req() req, @Param('spaceId') spaceId: string, @Param('kind') kind: string, @Body() body: SaveReportLayoutDto) {
    return this.reportLayouts.save(req.user.tenantId, spaceId, kind, body.layout, body.version, req.user);
  }
}
