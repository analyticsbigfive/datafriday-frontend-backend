import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { WeezeventAnalyticsGetSalesByProductQueryDto, WeezeventAnalyticsGetSalesByEventQueryDto, WeezeventAnalyticsGetMarginAnalysisQueryDto, WeezeventAnalyticsGetTopProductsQueryDto } from './dto/weezevent-analytics.query.dto';
import { WeezeventSalesAnalyticsService } from './services/weezevent-sales-analytics.service';

@ApiTags('Weezevent Analytics')
@ApiBearerAuth('supabase-jwt')
@Controller('weezevent/analytics')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('stats.financial.view')
export class WeezeventAnalyticsController {
    constructor(
        private readonly salesAnalytics: WeezeventSalesAnalyticsService,
    ) { }

    /**
     * Get sales by product
     */
    @Get('sales-by-product')
    @ApiOperation({ summary: 'Analyser les ventes par produit Weezevent' })
    @ApiQuery({ name: 'eventId', required: false, type: String })
    @ApiQuery({ name: 'fromDate', required: false, type: String })
    @ApiQuery({ name: 'toDate', required: false, type: String })
    @ApiResponse({ status: 200, description: 'Analyse des ventes par produit' })
    async getSalesByProduct(
        @CurrentUser() user: any,
        @Query() params: WeezeventAnalyticsGetSalesByProductQueryDto,
    ) {
        return this.salesAnalytics.getSalesByProduct(user, params);
    }

    /**
     * Get sales by event
     */
    @Get('sales-by-event')
    @ApiOperation({ summary: 'Analyser les ventes par événement Weezevent' })
    @ApiQuery({ name: 'fromDate', required: false, type: String })
    @ApiQuery({ name: 'toDate', required: false, type: String })
    @ApiResponse({ status: 200, description: 'Analyse des ventes par événement' })
    async getSalesByEvent(
        @CurrentUser() user: any,
        @Query() params: WeezeventAnalyticsGetSalesByEventQueryDto,
    ) {
        return this.salesAnalytics.getSalesByEvent(user, params);
    }

    /**
     * Get margin analysis (sales vs costs)
     */
    @Get('margin-analysis')
    @ApiOperation({ summary: 'Analyser la marge Weezevent' })
    @ApiQuery({ name: 'eventId', required: false, type: String })
    @ApiQuery({ name: 'fromDate', required: false, type: String })
    @ApiQuery({ name: 'toDate', required: false, type: String })
    @ApiResponse({ status: 200, description: 'Analyse des marges Weezevent' })
    async getMarginAnalysis(
        @CurrentUser() user: any,
        @Query() params: WeezeventAnalyticsGetMarginAnalysisQueryDto,
    ) {
        return this.salesAnalytics.getMarginAnalysis(user, params);
    }

    /**
     * Get top products by revenue
     */
    @Get('top-products')
    @ApiOperation({ summary: 'Lister les meilleurs produits Weezevent par chiffre d’affaires' })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'eventId', required: false, type: String })
    @ApiQuery({ name: 'fromDate', required: false, type: String })
    @ApiQuery({ name: 'toDate', required: false, type: String })
    @ApiResponse({ status: 200, description: 'Top produits Weezevent par revenu' })
    async getTopProducts(
        @CurrentUser() user: any,
        @Query() params: WeezeventAnalyticsGetTopProductsQueryDto,
    ) {
        return this.salesAnalytics.getTopProducts(user, params);
    }
}
