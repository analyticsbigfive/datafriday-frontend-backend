import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { CostTrackingHistoryQueryDto, CostTrackingOptionsQueryDto, CostTrackingSeriesQueryDto } from './dto/cost-tracking.query.dto';
import { CostTrackingBrickScopeService } from './services/cost-tracking-brick-scope.service';
import { CostTrackingEventsService } from './services/cost-tracking-events.service';
import { CostTrackingCatalogService } from './services/cost-tracking-catalog.service';
import { CostTrackingHistoryService } from './services/cost-tracking-history.service';
import { CostTrackingSeriesService } from './services/cost-tracking-series.service';

@ApiTags('Cost tracking')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('cost-tracking')
export class CostTrackingController {
  constructor(
    private readonly spaceAccess: SpaceAccessService,
    private readonly series: CostTrackingSeriesService,
    private readonly catalog: CostTrackingCatalogService,
    private readonly history: CostTrackingHistoryService,
    private readonly brickScope: CostTrackingBrickScopeService,
    private readonly events: CostTrackingEventsService,
  ) {}

  @Get(':spaceId/series')
  @RequirePermissions('front.fb.costTracking')
  @ApiOperation({ summary: 'Séries en escalier du coût par pièce et du prix, par article, catégorie ou type' })
  async getSeries(@Req() req, @Param('spaceId') spaceId: string, @Query() query: CostTrackingSeriesQueryDto) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, req.user.tenantId, req.user);
    return this.series.getSeries(req.user.tenantId, spaceId, query);
  }

  @Get(':spaceId/catalog')
  @RequirePermissions('front.fb.costTracking')
  @ApiOperation({ summary: 'Hiérarchie Type, Catégorie, Article du Space Menu' })
  async getCatalog(@Req() req, @Param('spaceId') spaceId: string) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, req.user.tenantId, req.user);
    return this.catalog.getCatalog(req.user.tenantId, spaceId);
  }

  @Get(':spaceId/options')
  @RequirePermissions('front.fb.costTracking')
  @ApiOperation({ summary: 'Fournisseurs actifs sur la période et composants disponibles dans le périmètre Type, Catégorie, Article (menus déroulants)' })
  async getOptions(@Req() req, @Param('spaceId') spaceId: string, @Query() query: CostTrackingOptionsQueryDto) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, req.user.tenantId, req.user);
    const [articles, period] = await Promise.all([
      this.catalog.listArticles(req.user.tenantId, spaceId, query),
      this.events.resolvePeriod(req.user.tenantId, spaceId, query.from, query.to),
    ]);
    return this.brickScope.getOptions(req.user.tenantId, spaceId, articles, period.from, period.toExclusive);
  }

  @Get(':spaceId/articles/:id/ingredients')
  @RequirePermissions('front.fb.costTracking')
  @ApiOperation({ summary: 'Lignes de la recette actuelle d un article (filtre ingrédient)' })
  async getArticleIngredients(@Req() req, @Param('spaceId') spaceId: string, @Param('id') id: string) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, req.user.tenantId, req.user);
    return this.catalog.getArticleIngredients(req.user.tenantId, spaceId, id);
  }

  @Get(':spaceId/articles/:id/history')
  @RequirePermissions('front.fb.costTracking')
  @ApiOperation({ summary: 'Versions de coût et de recette d un article' })
  async getHistory(@Req() req, @Param('spaceId') spaceId: string, @Param('id') id: string, @Query() query: CostTrackingHistoryQueryDto) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, req.user.tenantId, req.user);
    return this.history.getHistory(req.user.tenantId, spaceId, id, query.limit);
  }
}
