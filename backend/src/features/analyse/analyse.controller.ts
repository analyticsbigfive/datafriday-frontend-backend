import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { AnalyseService } from './analyse.service';

@ApiTags('Analyse')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('analyse')
export class AnalyseController {
  constructor(private readonly analyseService: AnalyseService) {}

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
    return this.analyseService.getDashboard(req.user.tenantId, spaceId || undefined);
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
    return this.analyseService.getEventKpis(req.user.tenantId, spaceId || undefined);
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
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('shopId') shopId?: string,
    @Query('menuItemId') menuItemId?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
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
}
