import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Query,
    Body,
    Req,
    UseGuards,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { WeezeventIntegrationService } from './services/weezevent-integration.service';
import { DigifoodIntegrationService } from './services/digifood-integration.service';
import { WebhookIntegrationService } from './services/webhook-integration.service';
import { WeezeventAuthService } from '../weezevent/services/weezevent-auth.service';
import { DigifoodCsvImportService } from '../digifood/services/digifood-csv-import.service';
import { WeezeventConfigDto } from './dto/weezevent-config.dto';
import { WebhookConfigDto } from './dto/webhook-config.dto';
import { UpdateWeezeventWebhookDto } from './dto/weezevent-webhook-config.dto';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import {
    CreateWeezeventInstanceDto,
    UpdateWeezeventInstanceDto,
    TestWeezeventInstanceDto,
} from './dto/weezevent-instance.dto';
import {
    CreateDigifoodInstanceDto,
    UpdateDigifoodInstanceDto,
} from './dto/digifood-instance.dto';

@ApiTags('Integrations')
@ApiBearerAuth('supabase-jwt')
@Controller('organizations/:organizationId/integrations')
@UseGuards(JwtDatabaseGuard)
export class IntegrationsController {
    constructor(
        private readonly weezeventService: WeezeventIntegrationService,
        private readonly digifoodService: DigifoodIntegrationService,
        private readonly webhookService: WebhookIntegrationService,
        private readonly weezeventAuthService: WeezeventAuthService,
        private readonly digifoodCsvImport: DigifoodCsvImportService,
    ) { }

    /**
     * List all integrations
     */
    @Get()
    @ApiOperation({ summary: 'Lister les intégrations d’une organisation' })
    @ApiParam({ name: 'organizationId', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Configuration des intégrations disponibles' })
    async listIntegrations(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
    ) {
        const tenantId = this.resolveTenantId(user, organizationId);
        const [weezevent, digifood, webhooks] = await Promise.all([
            this.weezeventService.getConfig(tenantId),
            this.digifoodService.listInstances(tenantId),
            this.webhookService.getConfig(tenantId),
        ]);

        // §8 : la liste expose les deux providers (clés weezevent/webhooks inchangées
        // pour le front existant ; digifood = ajout additif avec provider explicite).
        return {
            weezevent,
            digifood,
            webhooks,
        };
    }

    /**
     * Test Weezevent credentials without saving
     */
    @RequirePermissions('menu.integration.fb')
    @Post('weezevent/test')
    @ApiOperation({ summary: 'Tester les credentials Weezevent' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiResponse({ status: 200, description: 'Résultat du test de connexion' })
    @ApiResponse({ status: 400, description: 'Credentials invalides' })
    async testWeezeventCredentials(
        @Body() dto: WeezeventConfigDto,
    ) {
        if (!dto.weezeventClientId || !dto.weezeventClientSecret) {
            throw new BadRequestException('Client ID and Client Secret are required');
        }

        const result = await this.weezeventAuthService.testCredentials(
            dto.weezeventClientId,
            dto.weezeventClientSecret,
        );

        if (!result.valid) {
            throw new BadRequestException(`Invalid credentials: ${result.error}`);
        }

        return { valid: true, message: 'Connection successful' };
    }

    /**
     * Update Weezevent configuration (validates credentials first)
     */
    @RequirePermissions('menu.integration.fb')
    @Patch('weezevent')
    @ApiOperation({ summary: 'Mettre à jour la configuration Weezevent' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiResponse({ status: 200, description: 'Configuration Weezevent mise à jour' })
    @ApiResponse({ status: 400, description: 'Credentials invalides' })
    async updateWeezeventConfig(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
        @Body() dto: WeezeventConfigDto,
    ) {
        const tenantId = this.resolveTenantId(user, organizationId);
        // Validate credentials before saving if both clientId and clientSecret provided
        if (dto.weezeventClientId && dto.weezeventClientSecret) {
            const result = await this.weezeventAuthService.testCredentials(
                dto.weezeventClientId,
                dto.weezeventClientSecret,
            );
            if (!result.valid) {
                throw new BadRequestException(
                    `Cannot save: Weezevent credentials are invalid (${result.error})`,
                );
            }
        }

        return this.weezeventService.updateConfig(tenantId, dto);
    }

    /**
     * Get Weezevent configuration
     */
    @Get('weezevent')
    @ApiOperation({ summary: 'Obtenir la configuration Weezevent' })
    @ApiParam({ name: 'organizationId', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Configuration Weezevent' })
    async getWeezeventConfig(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
    ) {
        return this.weezeventService.getConfig(this.resolveTenantId(user, organizationId));
    }

    // ==================== Multi-instance Weezevent ====================

    @Get('weezevent/instances')
    @ApiOperation({ summary: 'Lister les instances Weezevent', description: 'Retourne toutes les instances Weezevent configurées pour le tenant.' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiResponse({ status: 200, description: 'Liste des instances Weezevent', schema: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, enabled: { type: 'boolean' }, clientId: { type: 'string' } } } } })
    @ApiResponse({ status: 401, description: 'Non authentifié' })
    async listWeezeventInstances(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
    ) {
        return this.weezeventService.listInstances(this.resolveTenantId(user, organizationId), user);
    }

    @RequirePermissions('menu.integration.fb')
    @Post('weezevent/instances')
    @ApiOperation({ summary: 'Créer une instance Weezevent', description: 'Crée une nouvelle instance Weezevent après validation des credentials.' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiBody({ type: CreateWeezeventInstanceDto })
    @ApiResponse({ status: 201, description: 'Instance créée', schema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, enabled: { type: 'boolean' } } } })
    @ApiResponse({ status: 400, description: 'Credentials invalides' })
    @ApiResponse({ status: 401, description: 'Non authentifié' })
    async createWeezeventInstance(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
        @Body() dto: CreateWeezeventInstanceDto,
    ) {
        const tenantId = this.resolveTenantId(user, organizationId);
        // Validate credentials before persisting
        const result = await this.weezeventAuthService.testCredentials(
            dto.clientId,
            dto.clientSecret,
        );
        if (!result.valid) {
            throw new BadRequestException(
                `Cannot save: Weezevent credentials are invalid (${result.error})`,
            );
        }

        return this.weezeventService.createInstance(tenantId, dto);
    }

    @RequirePermissions('menu.integration.fb')
    @Patch('weezevent/instances/:instanceId')
    @ApiOperation({ summary: 'Mettre à jour une instance Weezevent' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance" })
    @ApiBody({ type: UpdateWeezeventInstanceDto })
    @ApiResponse({ status: 200, description: 'Instance mise à jour', schema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, enabled: { type: 'boolean' } } } })
    @ApiResponse({ status: 400, description: 'Credentials invalides' })
    @ApiResponse({ status: 401, description: 'Non authentifié' })
    async updateWeezeventInstance(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @CurrentUser() user: any,
        @Body() dto: UpdateWeezeventInstanceDto,
    ) {
        const tenantId = this.resolveTenantId(user, organizationId);
        const needsValidation =
            dto.clientId !== undefined || dto.clientSecret !== undefined;

        if (needsValidation) {
            let clientId = dto.clientId;
            let clientSecret = dto.clientSecret;

            if (!clientId || !clientSecret) {
                const stored = await this.weezeventService.getDecryptedCredentials(
                    tenantId,
                    instanceId,
                );
                if (!clientId) clientId = stored.clientId;
                if (!clientSecret) clientSecret = stored.clientSecret;
            }

            const result = await this.weezeventAuthService.testCredentials(
                clientId!,
                clientSecret!,
            );
            if (!result.valid) {
                throw new BadRequestException(
                    `Cannot save: Weezevent credentials are invalid (${result.error})`,
                );
            }
        }

        return this.weezeventService.updateInstance(tenantId, instanceId, dto);
    }

    @RequirePermissions('menu.integration.fb')
    @Delete('weezevent/instances/:instanceId')
    @ApiOperation({ summary: 'Supprimer une instance Weezevent' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance" })
    @ApiResponse({ status: 200, description: 'Instance supprimée' })
    @ApiResponse({ status: 401, description: 'Non authentifié' })
    async deleteWeezeventInstance(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @CurrentUser() user: any,
    ) {
        return this.weezeventService.deleteInstance(this.resolveTenantId(user, organizationId), instanceId);
    }

    @RequirePermissions('menu.integration.fb')
    @Post('weezevent/instances/:instanceId/test')
    @ApiOperation({ summary: 'Tester les credentials d\'une instance Weezevent', description: 'Vérifie si les credentials stockés ou fournis permettent de se connecter à Weezevent.' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance" })
    @ApiBody({ type: TestWeezeventInstanceDto, required: false })
    @ApiResponse({ status: 200, description: 'Test réussi', schema: { type: 'object', properties: { valid: { type: 'boolean', example: true }, message: { type: 'string', example: 'Connection successful' } } } })
    @ApiResponse({ status: 400, description: 'Credentials invalides' })
    @ApiResponse({ status: 401, description: 'Non authentifié' })
    async testWeezeventInstance(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @CurrentUser() user: any,
        @Body() dto: TestWeezeventInstanceDto,
    ) {
        const tenantId = this.resolveTenantId(user, organizationId);
        let clientId = dto.clientId;
        let clientSecret = dto.clientSecret;

        if (!clientId || !clientSecret) {
            const stored = await this.weezeventService.getDecryptedCredentials(
                tenantId,
                instanceId,
            );
            if (!clientId) clientId = stored.clientId;
            if (!clientSecret) clientSecret = stored.clientSecret;
        }

        const result = await this.weezeventAuthService.testCredentials(clientId, clientSecret);
        if (!result.valid) {
            throw new BadRequestException(`Invalid credentials: ${result.error}`);
        }
        return { valid: true, message: 'Connection successful' };
    }

    // ==================== BUG-106 : webhook secret par instance Weezevent ====================

    @Get('weezevent/instances/:instanceId/webhook')
    @ApiOperation({ summary: 'Obtenir la configuration webhook d\'une instance Weezevent', description: 'enabled/configured uniquement (le secret chiffré n\'est jamais renvoyé). Si non configuré, le webhook de cette intégration retombe sur Tenant.weezeventWebhookSecret.' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance" })
    @ApiResponse({ status: 200, description: 'Configuration webhook de l\'instance' })
    async getWeezeventInstanceWebhook(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @CurrentUser() user: any,
    ) {
        return this.weezeventService.getWebhookConfig(this.resolveTenantId(user, organizationId), instanceId);
    }

    @RequirePermissions('menu.integration.fb')
    @Patch('weezevent/instances/:instanceId/webhook')
    @ApiOperation({ summary: 'Configurer le secret webhook d\'une instance Weezevent', description: 'webhookSecret chiffré au repos (EncryptionService). Optionnel en update : ne fournir que pour faire une rotation du secret.' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance" })
    @ApiBody({ type: UpdateWeezeventWebhookDto })
    @ApiResponse({ status: 200, description: 'Configuration webhook mise à jour' })
    async updateWeezeventInstanceWebhook(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @CurrentUser() user: any,
        @Body() dto: UpdateWeezeventWebhookDto,
    ) {
        return this.weezeventService.updateWebhookConfig(this.resolveTenantId(user, organizationId), instanceId, dto);
    }

    /**
     * Update webhook configuration
     */
    @RequirePermissions('menu.integration.fb')
    @Patch('webhooks')
    @ApiOperation({ summary: 'Mettre à jour la configuration des webhooks' })
    @ApiParam({ name: 'organizationId', description: 'ID de l’organisation' })
    @ApiResponse({ status: 200, description: 'Configuration webhook mise à jour' })
    async updateWebhookConfig(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
        @Body() dto: WebhookConfigDto,
    ) {
        return this.webhookService.updateConfig(this.resolveTenantId(user, organizationId), dto);
    }

    /**
     * Get webhook configuration
     */
    @Get('webhooks')
    @ApiOperation({ summary: 'Obtenir la configuration des webhooks' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiResponse({ status: 200, description: 'Configuration webhook' })
    async getWebhookConfig(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
    ) {
        return this.webhookService.getConfig(this.resolveTenantId(user, organizationId));
    }

    // ==================== Digifood (PLAN_INTEGRATION_DIGIFOOD §8) ====================

    @Get('digifood/instances')
    @ApiOperation({ summary: 'Lister les instances Digifood', description: 'Instances Integration(provider=DIGIFOOD) avec config jointe (secret masqué) et URL de webhook.' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiResponse({ status: 200, description: 'Liste des instances Digifood' })
    async listDigifoodInstances(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
    ) {
        return this.digifoodService.listInstances(this.resolveTenantId(user, organizationId));
    }

    @RequirePermissions('menu.integration.fb')
    @Post('digifood/instances')
    @ApiOperation({ summary: 'Créer une instance Digifood', description: "Crée Integration(provider=DIGIFOOD) + DigifoodIntegrationConfig (secret chiffré). Retourne l'URL de webhook à communiquer à Digifood." })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiBody({ type: CreateDigifoodInstanceDto })
    @ApiResponse({ status: 201, description: 'Instance créée (webhookUrl inclus)' })
    async createDigifoodInstance(
        @Param('organizationId') organizationId: string,
        @CurrentUser() user: any,
        @Body() dto: CreateDigifoodInstanceDto,
    ) {
        return this.digifoodService.createInstance(this.resolveTenantId(user, organizationId), dto);
    }

    @RequirePermissions('menu.integration.fb')
    @Patch('digifood/instances/:instanceId')
    @ApiOperation({ summary: 'Mettre à jour une instance Digifood', description: 'name, enabled, rotation du webhookSecret (si fourni).' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance Digifood" })
    @ApiBody({ type: UpdateDigifoodInstanceDto })
    @ApiResponse({ status: 200, description: 'Instance mise à jour' })
    async updateDigifoodInstance(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @CurrentUser() user: any,
        @Body() dto: UpdateDigifoodInstanceDto,
    ) {
        return this.digifoodService.updateInstance(
            this.resolveTenantId(user, organizationId),
            instanceId,
            dto,
        );
    }

    @RequirePermissions('menu.integration.fb')
    @Delete('digifood/instances/:instanceId')
    @ApiOperation({ summary: 'Supprimer une instance Digifood' })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance Digifood" })
    @ApiResponse({ status: 200, description: 'Instance supprimée' })
    async deleteDigifoodInstance(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @CurrentUser() user: any,
    ) {
        return this.digifoodService.deleteInstance(
            this.resolveTenantId(user, organizationId),
            instanceId,
        );
    }

    @RequirePermissions('menu.integration.fb')
    @Post('digifood/instances/:instanceId/test')
    @ApiOperation({ summary: 'Tester une instance Digifood', description: "Pas d'API à pinger : retourne le dernier webhook reçu/signé et son statut de traitement." })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance Digifood" })
    @ApiResponse({ status: 200, description: 'Statut du dernier webhook reçu' })
    async testDigifoodInstance(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @CurrentUser() user: any,
    ) {
        return this.digifoodService.testInstance(
            this.resolveTenantId(user, organizationId),
            instanceId,
        );
    }

    @RequirePermissions('menu.integration.fb')
    @Post('digifood/instances/:instanceId/import-csv')
    @ApiOperation({ summary: "Importer un CSV d'historique Digifood", description: 'Multipart (champ file). dryRun=true par DÉFAUT : rapport sans écriture ; passer ?dryRun=false pour exécuter. Idempotent (upsert par order_id).' })
    @ApiConsumes('multipart/form-data')
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance Digifood" })
    @ApiQuery({ name: 'dryRun', required: false, description: 'true (défaut) = rapport sans écriture' })
    @ApiResponse({ status: 200, description: "Rapport d'import { ordersCreated, ordersUpdated, ordersSkipped, productsCreated, locationsCreated, rejectedRows }" })
    async importDigifoodCsv(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @Query('dryRun') dryRun: string | undefined,
        @CurrentUser() user: any,
        @Req() req: FastifyRequest,
    ) {
        const tenantId = this.resolveTenantId(user, organizationId);
        // 404 si l'instance n'existe pas / n'appartient pas au tenant / n'est pas DIGIFOOD
        await this.digifoodService.getInstance(tenantId, instanceId);

        const file = await (req as any).file();
        if (!file) {
            throw new BadRequestException('Fichier CSV manquant (multipart, champ "file")');
        }
        const buffer: Buffer = await file.toBuffer();

        // Champ multipart optionnel `mapping` : JSON { champ_normalisé: "Colonne CSV" }
        // choisi dans l'UI — persisté côté service pour les prochains imports.
        let mapping: Record<string, string> | null = null;
        const mappingField = (file as any).fields?.mapping;
        const mappingRaw = Array.isArray(mappingField) ? mappingField[0]?.value : mappingField?.value;
        if (typeof mappingRaw === 'string' && mappingRaw.trim()) {
            try {
                mapping = JSON.parse(mappingRaw);
            } catch {
                throw new BadRequestException('Champ "mapping" invalide (JSON attendu)');
            }
        }

        // Défaut TRUE — seul dryRun=false explicite exécute (même philosophie que
        // backfill-weezevent-prices).
        const effectiveDryRun = dryRun !== 'false';
        return this.digifoodCsvImport.importCsv(tenantId, instanceId, buffer, effectiveDryRun, mapping, file.filename);
    }

    @Get('digifood/instances/:instanceId/import-csv/history')
    @ApiOperation({ summary: "Historique des imports CSV Digifood réels (aperçus exclus)" })
    @ApiParam({ name: 'organizationId', description: "ID de l'organisation" })
    @ApiParam({ name: 'instanceId', description: "ID de l'instance Digifood" })
    @ApiResponse({ status: 200, description: 'Liste des imports (20 derniers), plus récent en premier' })
    async getDigifoodCsvImportHistory(
        @Param('organizationId') organizationId: string,
        @Param('instanceId') instanceId: string,
        @CurrentUser() user: any,
    ) {
        const tenantId = this.resolveTenantId(user, organizationId);
        await this.digifoodService.getInstance(tenantId, instanceId);
        const data = await this.digifoodCsvImport.getImportHistory(tenantId, instanceId);
        return { data };
    }

    /**
     * Enforce that the authenticated user can only access their own organization.
     * The organizationId URL param is accepted only when it matches the JWT tenantId,
     * preventing IDOR attacks (OWASP A01).
     */
    private resolveTenantId(user: any, organizationId: string): string {
        const jwtTenantId: string | undefined = user?.tenantId;
        if (!jwtTenantId) {
            throw new ForbiddenException('No organization associated with this account');
        }
        if (organizationId && organizationId !== jwtTenantId) {
            throw new ForbiddenException('Access denied to this organization');
        }
        return jwtTenantId;
    }
}
