import { Controller, Get, Post, Patch, Delete, Body, Query, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SyncWeezeventDto } from './dto/sync-weezevent.dto';
import { StartSyncJobDto } from './dto/start-sync-job.dto';
import { GetTransactionsQueryDto } from './dto/get-transactions-query.dto';
import { MapProductToMenuItemDto } from './dto/map-product-to-menu-item.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { WeezeventResetSyncStateQueryDto, WeezeventGetEventsQueryDto, WeezeventGetLocationsQueryDto, WeezeventGetMerchantsQueryDto, WeezeventGetProductsQueryDto, WeezeventBackfillTransactionItemProductsQueryDto, WeezeventGetProductMappingsQueryDto, WeezeventGetOrdersQueryDto, WeezeventGetPricesQueryDto, WeezeventGetAttendeesQueryDto } from './dto/weezevent.query.dto';
import { WeezeventSalesDataQueryService } from './services/console/weezevent-sales-data-query.service';
import { WeezeventProductCatalogService } from './services/console/weezevent-product-catalog.service';
import { WeezeventProductMappingAdminService } from './services/console/weezevent-product-mapping-admin.service';
import { WeezeventSyncAdminService } from './services/console/weezevent-sync-admin.service';
import { WeezeventSyncJobService } from './services/console/weezevent-sync-job.service';

@ApiTags('Weezevent')
@ApiBearerAuth('supabase-jwt')
@Controller('weezevent')
@UseGuards(JwtDatabaseGuard)
export class WeezeventController {

    constructor(
        private readonly salesDataQuery: WeezeventSalesDataQueryService,
        private readonly productCatalog: WeezeventProductCatalogService,
        private readonly productMappingAdmin: WeezeventProductMappingAdminService,
        private readonly syncAdmin: WeezeventSyncAdminService,
        private readonly syncJobs: WeezeventSyncJobService,
    ) { }

    /**
     * Get synced transactions from database
     */
    @Get('transactions')
    @ApiOperation({ summary: 'Lister les transactions Weezevent synchronisées' })
    @ApiResponse({ status: 200, description: 'Liste paginée des transactions Weezevent' })
    async getTransactions(
        @CurrentUser() user: any,
        @Query() query: GetTransactionsQueryDto,
    ) {
        return this.salesDataQuery.getTransactions(user, query);
    }

    /**
     * Get a single transaction by ID
     */
    @Get('transactions/:id')
    @ApiOperation({ summary: 'Obtenir une transaction Weezevent par ID' })
    @ApiParam({ name: 'id', description: 'ID de la transaction' })
    @ApiResponse({ status: 200, description: 'Transaction Weezevent' })
    async getTransaction(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {
        return this.salesDataQuery.getTransaction(user, id);
    }

    /**
     * Fetch transactions DIRECTLY from the Weezevent API (no DB, no sync).
     * Useful for debugging / checking what the real Weezevent data looks like.
     */
    @Get('raw-transactions')
    @ApiOperation({ summary: 'Récupérer les transactions brutes depuis l\'API Weezevent (sans passer par la DB)' })
    @ApiResponse({ status: 200, description: 'Transactions brutes Weezevent' })
    async getRawTransactions(
        @CurrentUser() user: any,
        @Query() query: GetTransactionsQueryDto,
    ) {
        return this.salesDataQuery.getRawTransactions(user, query);
    }

    /**
     * Trigger manual synchronization — runs synchronously and returns the result directly.
     * transactions / events / products are executed in-process (no queue).
     * orders / prices / attendees are still queued via BullMQ.
     */
    @RequirePermissions('menu.integration.fb')
    @Post('sync')
    @ApiOperation({ summary: 'Déclencher une synchronisation Weezevent' })
    @ApiBody({ type: SyncWeezeventDto })
    @ApiResponse({ status: 201, description: 'Synchronisation terminée' })
    async syncData(
        @CurrentUser() user: any,
        @Body() dto: SyncWeezeventDto,
    ) {
        return this.syncAdmin.syncData(user, dto);
    }

    /**
     * Get sync status (including incremental state + BullMQ queue stats)
     */
    @Get('sync/status')
    @ApiOperation({ summary: 'Obtenir le statut de synchronisation Weezevent' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'Filtrer par intégration — si omis, retourne les totaux toutes intégrations confondues' })
    @ApiResponse({ status: 200, description: 'Statut des synchronisations Weezevent' })
    async getSyncStatus(
        @CurrentUser() user: any,
        @Query('integrationId') integrationId?: string,
    ) {
        return this.syncAdmin.getSyncStatus(user, integrationId);
    }

    /**
     * État d'intégrité Data Integration du tenant courant — à la demande (le cron quotidien
     * logge l'équivalent global). Permet de VOIR tout de suite si des mappings sont cassés
     * (PDV/Menu Items démappés en silence) sans attendre les logs serveur.
     */
    @RequirePermissions('menu.integration.fb')
    @Get('integrity')
    @ApiOperation({ summary: "État d'intégrité Data Integration (mappings cassés, doublons) du tenant" })
    @ApiResponse({ status: 200, description: "Compteurs d'intégrité — healthy=true si tout est à 0" })
    async getDataIntegrationIntegrity(@CurrentUser() user: any) {
        return this.syncAdmin.getDataIntegrationIntegrity(user);
    }

    /**
     * Reset sync state (force full sync next time)
     */
    @RequirePermissions('menu.integration.fb')
    @Delete('sync/state')
    @ApiOperation({ summary: 'Réinitialiser l’état de synchronisation Weezevent' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration à réinitialiser — si omis, réinitialise toutes les intégrations du tenant' })
    @ApiQuery({ name: 'type', required: false, type: String, description: 'Type de sync à réinitialiser : transactions | events | products' })
    @ApiResponse({ status: 200, description: 'État de synchronisation réinitialisé' })
    async resetSyncState(
        @CurrentUser() user: any,
        @Query() params: WeezeventResetSyncStateQueryDto,
    ) {
        return this.syncAdmin.resetSyncState(user, params);
    }

    /**
     * Purge all synced Weezevent data for this tenant.
     * Called when removing an integration with the "delete data" option.
     * Deletes in dependency order to respect foreign key constraints.
     */
    @RequirePermissions('menu.integration.fb')
    @Delete('data')
    @ApiOperation({ summary: 'Supprimer toutes les données Weezevent synchronisées' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'Supprimer uniquement les données de cette intégration — si omis, supprime TOUT le tenant' })
    @ApiResponse({ status: 200, description: 'Données supprimées' })
    async purgeData(
        @CurrentUser() user: any,
        @Query('integrationId') integrationId?: string,
    ) {
        return this.syncAdmin.purgeData(user, integrationId);
    }

    /**
     * Get events
     */
    @Get('events')
    @ApiOperation({ summary: 'Lister les événements Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page', example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, description: 'Résultats par page (max 500)', example: 50 })
    @ApiQuery({ name: 'status', required: false, description: 'Statut de l\'événement' })
    @ApiQuery({ name: 'search', required: false, description: 'Recherche dans le nom' })
    @ApiQuery({ name: 'startDateFrom', required: false, description: 'Date de début min (ISO 8601)' })
    @ApiQuery({ name: 'startDateTo', required: false, description: 'Date de début max (ISO 8601)' })
    @ApiResponse({ status: 200, description: 'Liste paginée des événements Weezevent' })
    async getEvents(
        @CurrentUser() user: any,
        @Query() params: WeezeventGetEventsQueryDto,
    ) {
        return this.salesDataQuery.getEvents(user, params);
    }

    /**
     * Get locations
     */
    @Get('locations')
    @ApiOperation({ summary: 'Lister les locations Weezevent synchronisées' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 100 })
    @ApiQuery({ name: 'type', required: false, description: 'Type de location : sale | all — défaut : sale' })
    @ApiResponse({ status: 200, description: 'Liste des locations Weezevent' })
    async getLocations(
        @CurrentUser() user: any,
        @Query() params: WeezeventGetLocationsQueryDto,
    ) {
        return this.salesDataQuery.getLocations(user, params);
    }

    /**
     * Get merchants
     */
    @Get('merchants')
    @ApiOperation({ summary: 'Lister les merchants Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 100 })
    @ApiQuery({ name: 'locationId', required: false, description: 'Filtrer les merchants ayant des transactions à cette location' })
    @ApiResponse({ status: 200, description: 'Liste des merchants Weezevent' })
    async getMerchants(
        @CurrentUser() user: any,
        @Query() params: WeezeventGetMerchantsQueryDto,
    ) {
        return this.salesDataQuery.getMerchants(user, params);
    }


    @Get('products')
    @ApiOperation({ summary: 'Lister les produits Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
    @ApiQuery({ name: 'category', required: false, description: 'Filtrer par catégorie de produit' })
    @ApiQuery({ name: 'spaceId', required: false, description: 'Espace : le prix renvoyé est celui pratiqué DANS cet espace (ventes des locations mappées), pas le basePrice figé du produit. ATTENTION coûteux (cascade de repli espace→weezeventId→nom) — pour un simple filtrage catalogue sans ce coût, utiliser catalogSpaceId.' })
    @ApiQuery({ name: 'onlySold', required: false, description: "true → ne renvoie que les produits ayant un prix (donc réellement vendus) ; masque le bruit du catalogue jamais vendu. Filtré AVANT pagination (BUG-337-02) : `meta.total`/`total_pages` reflètent le compte filtré, `meta.catalogTotal` porte le compte non filtré (pour l'UI 'X produits masqués')." })
    @ApiQuery({ name: 'catalogSpaceId', required: false, description: "Filtre LÉGER le catalogue sur l'intégration Weezevent de cet espace (requête indexée simple), SANS activer la cascade de prix scopée-espace de `spaceId` — le prix reste le prix modal global rapide. Ignoré si `integrationId` ou `spaceId` sont fournis." })
    @ApiResponse({ status: 200, description: 'Liste paginée des produits Weezevent' })
    async getProducts(
        @CurrentUser() user: any,
        @Query() params: WeezeventGetProductsQueryDto,
    ) {
        return this.productCatalog.getProducts(user, params);
    }

    /**
     * Refresh one product details.
     * Local-first: use local WeezeventProduct/rawData when possible, then try Weezevent API only
     * for missing fields. If the external API fails, return the local record instead of breaking UI.
     */
    @Get('products/:productId/refresh')
    @ApiOperation({ summary: 'Rafraîchir les détails d’un produit Weezevent local-first' })
    @ApiParam({ name: 'productId', description: 'ID interne du produit Weezevent' })
    @ApiQuery({ name: 'spaceId', required: false, description: 'Espace : le prix dérivé est celui pratiqué DANS cet espace (jamais un autre espace)' })
    @ApiResponse({ status: 200, description: 'Produit enrichi depuis la DB locale ou Weezevent' })
    async refreshProduct(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
        @Query('spaceId') spaceId?: string,
    ) {
        return this.productCatalog.refreshProduct(user, productId, spaceId);
    }

    /**
     * BACKFILL : relie les ventes orphelines à leur produit — et CRÉE le produit s'il manque.
     *
     * Problème : `WeezeventTransactionItem.productId` peut être null (le sync n'a pas résolu le
     * produit au moment d'insérer la ligne). Ces ventes sont alors INVISIBLES à toute dérivation de
     * prix (qui filtre par productId) → prix à 0 même quand des ventes existent. Et si le produit
     * n'a jamais été créé, il n'apparaît même pas à l'étape 3 pour être mappé.
     *
     * Ce backfill : pour chaque ligne orpheline, résout le produit par `rawData.item_id` →
     * `WeezeventProduct.weezeventId` (scopé à l'intégration de la transaction). S'il n'existe pas,
     * il le CRÉE (basePrice laissé null → le prix se dérive des ventes au read-time). Puis relie
     * toutes les lignes. `dryRun=true` → aperçu (compteurs) sans écriture.
     */
    @RequirePermissions('menu.integration.fb')
    @Post('backfill-transaction-item-products')
    @ApiOperation({
        summary: 'Backfill : relier les ventes orphelines (productId null) à leur produit (créé si absent)',
        description:
            "Relie les WeezeventTransactionItem sans productId à leur WeezeventProduct (via rawData.item_id), en créant le produit manquant pour que la vente apparaisse au mapping de l'étape 3. dryRun=true = aperçu sans écriture.",
    })
    @ApiQuery({ name: 'integrationId', required: false, description: 'Limiter à une intégration Weezevent' })
    @ApiQuery({ name: 'dryRun', required: false, description: 'Aperçu sans écriture (true/false)' })
    @ApiResponse({ status: 200, description: 'Résumé du backfill' })
    async backfillTransactionItemProducts(
        @CurrentUser() user: any,
        @Query() params: WeezeventBackfillTransactionItemProductsQueryDto,
    ) {
        return this.productMappingAdmin.backfillTransactionItemProducts(user, params);
    }

    /**
     * Map a Weezevent product to a MenuItem
     */
    @RequirePermissions('menu.integration.fb')
    @Post('products/:productId/map')
    @ApiOperation({ summary: 'Associer un produit Weezevent à un menu item' })
    @ApiParam({ name: 'productId', description: 'ID du produit Weezevent' })
    @ApiBody({ type: MapProductToMenuItemDto })
    @ApiResponse({ status: 201, description: 'Mapping créé ou mis à jour' })
    async mapProductToMenuItem(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
        @Body() body: MapProductToMenuItemDto,
    ) {
        return this.productMappingAdmin.mapProductToMenuItem(user, productId, body);
    }

    /**
     * Get product mappings
     */
    @Get('products/mappings')
    @ApiOperation({ summary: 'Lister les mappings produits Weezevent / menu items' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'Scoper par intégration — filtre la liste et accélère l\'agrégat salesPricing.' })
    @ApiResponse({ status: 200, description: 'Liste paginée des mappings de produits' })
    async getProductMappings(
        @CurrentUser() user: any,
        @Query() params: WeezeventGetProductMappingsQueryDto,
    ) {
        return this.productMappingAdmin.getProductMappings(user, params);
    }

    /**
     * Delete a product mapping
     */
    @RequirePermissions('menu.integration.fb')
    @Delete('products/:productId/map')
    @ApiOperation({ summary: 'Supprimer le mapping d’un produit Weezevent' })
    @ApiParam({ name: 'productId', description: 'ID du produit Weezevent' })
    @ApiResponse({ status: 200, description: 'Mapping supprimé' })
    async unmapProduct(
        @CurrentUser() user: any,
        @Param('productId') productId: string,
    ) {
        return this.productMappingAdmin.unmapProduct(user, productId);
    }

    /**
     * Get orders
     */
    @Get('orders')
    @ApiOperation({ summary: 'Lister les commandes Weezevent synchronisées' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
    @ApiQuery({ name: 'eventId', required: false, description: 'Filtrer par ID événement Weezevent' })
    @ApiResponse({ status: 200, description: 'Liste paginée des commandes Weezevent' })
    async getOrders(
        @CurrentUser() user: any,
        @Query() params: WeezeventGetOrdersQueryDto,
    ) {
        return this.salesDataQuery.getOrders(user, params);
    }

    /**
     * Get prices
     */
    @Get('prices')
    @ApiOperation({ summary: 'Lister les tarifs Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
    @ApiQuery({ name: 'eventId', required: false, description: 'Filtrer par ID événement Weezevent' })
    @ApiResponse({ status: 200, description: 'Liste paginée des tarifs Weezevent' })
    async getPrices(
        @CurrentUser() user: any,
        @Query() params: WeezeventGetPricesQueryDto,
    ) {
        return this.salesDataQuery.getPrices(user, params);
    }

    /**
     * Get attendees
     */
    @Get('attendees')
    @ApiOperation({ summary: 'Lister les participants Weezevent synchronisés' })
    @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'perPage', required: false, type: Number, example: 50 })
    @ApiQuery({ name: 'eventId', required: false, description: 'Filtrer par ID événement Weezevent' })
    @ApiResponse({ status: 200, description: 'Liste paginée des participants Weezevent' })
    async getAttendees(
        @CurrentUser() user: any,
        @Query() params: WeezeventGetAttendeesQueryDto,
    ) {
        return this.salesDataQuery.getAttendees(user, params);
    }

    // ==================== SYNC JOBS (nouvelle architecture bisection) ====================

    /**
     * Démarre un job de sync asynchrone avec bissection.
     * Retourne immédiatement un jobId — le frontend poll GET /sync/status/:jobId.
     */
    @RequirePermissions('menu.integration.fb')
    @Post('sync/start')
    @ApiOperation({ summary: 'Démarrer un job de synchronisation par bissection' })
    @ApiBody({ type: StartSyncJobDto })
    @ApiResponse({ status: 201, description: 'Job créé, retourne jobId' })
    async startSyncJob(
        @CurrentUser() user: any,
        @Body() dto: StartSyncJobDto,
    ) {
        return this.syncJobs.startSyncJob(user, dto);
    }

    /**
     * Retourne l'état en temps réel d'un job de sync.
     * Le frontend poll cet endpoint toutes les 3s.
     */
    @Get('sync/status/:jobId')
    @ApiOperation({ summary: 'État d\'un job de synchronisation' })
    @ApiParam({ name: 'jobId', description: 'ID du job retourné par POST /sync/start' })
    @ApiResponse({ status: 200, description: 'État du job' })
    async getSyncJobStatus(
        @CurrentUser() user: any,
        @Param('jobId') jobId: string,
    ) {
        return this.syncJobs.getSyncJobStatus(user, jobId);
    }

    /**
     * Liste les jobs de sync pour une intégration donnée.
     */
    @Get('sync/jobs')
    @ApiOperation({ summary: 'Lister les jobs de sync pour une intégration' })
    @ApiQuery({ name: 'integrationId', required: true, description: 'ID de l\'intégration' })
    @ApiResponse({ status: 200, description: 'Liste des jobs' })
    async listSyncJobs(
        @CurrentUser() user: any,
        @Query('integrationId') integrationId: string,
    ) {
        return this.syncJobs.listSyncJobs(user, integrationId);
    }

    /**
     * Retourne des statistiques sur les transactions couvertes par un job de sync.
     * Calcule le nombre distinct d'événements, locations et produits dans la plage de dates du job.
     */
    @Get('sync/jobs/:jobId/stats')
    @ApiOperation({ summary: 'Statistiques d\'un job de sync (transactions, events, locations, produits)' })
    @ApiParam({ name: 'jobId', description: 'ID du job' })
    @ApiResponse({ status: 200, description: 'Statistiques du job' })
    async getSyncJobStats(
        @CurrentUser() user: any,
        @Param('jobId') jobId: string,
    ) {
        return this.syncJobs.getSyncJobStats(user, jobId);
    }

    /**
     * Annule un job de sync bloqué/en cours SANS supprimer son historique — contrairement à
     * DELETE sync/jobs/:jobId (suppression définitive de la fiche). Marque le job CANCELLED ;
     * les workers (collect/insert) vérifient ce statut et s'arrêtent au prochain cycle plutôt
     * que d'être tués immédiatement (cf. WeezeventCollectWorkerService/WeezeventInsertWorkerService).
     */
    @RequirePermissions('menu.integration.fb')
    @Patch('sync/jobs/:jobId/cancel')
    @ApiOperation({ summary: 'Annuler un job de sync en conservant son historique' })
    @ApiParam({ name: 'jobId', description: 'ID du job à annuler' })
    @ApiResponse({ status: 200, description: 'Job annulé' })
    async cancelSyncJob(
        @CurrentUser() user: any,
        @Param('jobId') jobId: string,
    ) {
        return this.syncJobs.cancelSyncJob(user, jobId);
    }

    /**
     * Supprime un job de sync (et ses chunks via cascade).
     * Interdit si le job est encore actif (COLLECTING ou INSERTING).
     */
    @RequirePermissions('menu.integration.fb')
    @Delete('sync/jobs/:jobId')
    @ApiOperation({ summary: 'Supprimer un job de sync' })
    @ApiParam({ name: 'jobId', description: 'ID du job à supprimer' })
    @ApiResponse({ status: 200, description: 'Job supprimé' })
    async deleteSyncJob(
        @CurrentUser() user: any,
        @Param('jobId') jobId: string,
    ) {
        return this.syncJobs.deleteSyncJob(user, jobId);
    }
}
