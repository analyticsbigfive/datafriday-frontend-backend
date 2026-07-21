import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/encryption/encryption.service';
import { WeezeventAuthException } from '../exceptions/weezevent-auth.exception';
import {
    WeezeventConfig,
    WeezeventTokenResponse,
} from '../interfaces/weezevent.interface';

interface TokenCache {
    token: string;
    expiresAt: Date;
}

@Injectable()
export class WeezeventAuthService {
    private readonly logger = new Logger(WeezeventAuthService.name);
    // BUG-025 (corrigé) : le cache était keyé par tenantId — un tenant avec 2+ intégrations
    // Weezevent actives (cas réel : vérifié en base, des tenants en ont 3 et 4) partageait donc UN
    // SEUL token entre toutes ses intégrations, celui de la première credentials résolue. Keyé par
    // integrationId : chaque intégration a son propre credentials (WeezeventIntegrationConfig,
    // 1-1 avec Integration) et donc son propre token, indépendamment des autres du même tenant.
    private readonly tokenCache = new Map<string, TokenCache>();
    private readonly authUrl = 'https://accounts.weezevent.com/realms/accounts/protocol/openid-connect/token';

    constructor(
        private readonly httpService: HttpService,
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
    ) { }

    /**
     * Get access token for a specific Weezevent integration.
     * Returns cached token if still valid, otherwise requests a new one.
     */
    async getAccessToken(tenantId: string, integrationId: string): Promise<string> {
        const cached = this.tokenCache.get(integrationId);

        // Return cached token if still valid (with 60s buffer)
        if (cached && cached.expiresAt > new Date()) {
            this.logger.debug(`Using cached token for integration ${integrationId}`);
            return cached.token;
        }

        // Request new token
        this.logger.log(`Requesting new access token for integration ${integrationId} (tenant ${tenantId})`);
        return this.requestNewToken(tenantId, integrationId);
    }

    /**
     * Clear cached token for a specific integration
     */
    clearToken(integrationId: string): void {
        this.tokenCache.delete(integrationId);
        this.logger.debug(`Cleared token cache for integration ${integrationId}`);
    }

    /**
     * Test Weezevent credentials without saving them
     * Returns { valid: true } on success, { valid: false, error: string } on failure
     */
    async testCredentials(
        clientId: string,
        clientSecret: string,
    ): Promise<{ valid: boolean; error?: string }> {
        try {
            const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

            await this.httpService.axiosRef.post(
                this.authUrl,
                new URLSearchParams({ grant_type: 'client_credentials' }),
                {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    timeout: 10000,
                },
            );

            this.logger.log('Weezevent credential test successful');
            return { valid: true };
        } catch (error) {
            const msg =
                error.response?.data?.error_description ||
                error.response?.data?.error ||
                error.message;
            this.logger.warn(`Weezevent credential test failed: ${msg}`);
            return { valid: false, error: msg };
        }
    }

    /**
     * Request a new access token from Weezevent
     */
    private async requestNewToken(tenantId: string, integrationId: string): Promise<string> {
        // Get Weezevent config for this specific integration
        const config = await this.getWeezeventConfig(tenantId, integrationId);

        try {
            // Create Basic Auth header
            const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

            // Request token using client credentials grant with Basic Auth
            const response = await this.httpService.axiosRef.post<WeezeventTokenResponse>(
                this.authUrl,
                new URLSearchParams({
                    grant_type: 'client_credentials',
                }),
                {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                },
            );

            const { access_token, expires_in } = response.data;

            // Cache token with 60s buffer before expiry
            const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000);
            this.tokenCache.set(integrationId, {
                token: access_token,
                expiresAt,
            });

            this.logger.log(
                `Successfully obtained access token for integration ${integrationId}, expires at ${expiresAt.toISOString()}`,
            );

            return access_token;
        } catch (error) {
            this.logger.error(
                `Failed to obtain access token for integration ${integrationId} (tenant ${tenantId})`,
                error.stack,
            );

            if (error.response) {
                const { status, data } = error.response;
                throw new WeezeventAuthException(
                    `Authentication failed (${status}): ${data?.error_description || data?.error || 'Unknown error'}`,
                );
            }

            throw new WeezeventAuthException(
                `Authentication failed: ${error.message}`,
            );
        }
    }

    /**
     * Get Weezevent configuration for a specific integration.
     *
     * BUG-025 (corrigé) : lisait auparavant Tenant.weezeventClientId/Secret — un miroir du
     * "premier" WeezeventIntegrationConfig actif du tenant (cf.
     * WeezeventIntegrationService.mirrorActiveInstanceToTenant), donc toujours la même intégration
     * quel que soit l'integrationId réellement demandé. Lit maintenant directement
     * WeezeventIntegrationConfig, scopé par integrationId — la vraie source par intégration.
     */
    private async getWeezeventConfig(tenantId: string, integrationId: string): Promise<WeezeventConfig> {
        const integration = await this.prisma.integration.findFirst({
            where: { id: integrationId, tenantId, provider: 'WEEZEVENT' },
            select: {
                enabled: true,
                weezevent: { select: { clientId: true, clientSecret: true } },
            },
        });

        if (!integration || !integration.weezevent) {
            throw new WeezeventAuthException(
                `Weezevent not configured for integration ${integrationId}`,
            );
        }

        if (!integration.enabled) {
            throw new WeezeventAuthException(
                `Weezevent integration ${integrationId} is disabled`,
            );
        }

        return {
            clientId: integration.weezevent.clientId,
            clientSecret: this.encryptionService.decrypt(integration.weezevent.clientSecret),
            enabled: integration.enabled,
        };
    }
}
