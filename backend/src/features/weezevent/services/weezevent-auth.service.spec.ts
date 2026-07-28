import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { WeezeventAuthService } from './weezevent-auth.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/encryption/encryption.service';
import { WeezeventAuthException } from '../exceptions/weezevent-auth.exception';

describe('WeezeventAuthService', () => {
    let service: WeezeventAuthService;

    const mockHttpService = {
        axiosRef: {
            post: jest.fn(),
        },
    };

    const mockPrisma = {
        integration: {
            findFirst: jest.fn(),
        },
    };

    const mockEncryptionService = {
        decrypt: jest.fn((v: string) => `decrypted-${v}`),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventAuthService,
                { provide: HttpService, useValue: mockHttpService },
                { provide: PrismaService, useValue: mockPrisma },
                { provide: EncryptionService, useValue: mockEncryptionService },
            ],
        }).compile();

        service = module.get<WeezeventAuthService>(WeezeventAuthService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getAccessToken', () => {
        const tenantId = 'tenant-123';
        const integrationId = 'integration-a';

        const mockIntegrationRow = {
            enabled: true,
            weezevent: { clientId: 'test-client-id', clientSecret: 'encrypted-secret' },
        };

        const mockTokenResponse = {
            access_token: 'mock-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'transactions.read wallets.read',
        };

        it('should request and cache access token, scoped to this integration', async () => {
            mockPrisma.integration.findFirst.mockResolvedValue(mockIntegrationRow);
            mockHttpService.axiosRef.post.mockResolvedValue({ data: mockTokenResponse });

            const token = await service.getAccessToken(tenantId, integrationId);

            expect(token).toBe('mock-access-token');
            expect(mockPrisma.integration.findFirst).toHaveBeenCalledWith({
                where: { id: integrationId, tenantId, provider: 'WEEZEVENT' },
                select: { enabled: true, weezevent: { select: { clientId: true, clientSecret: true } } },
            });
            expect(mockHttpService.axiosRef.post).toHaveBeenCalledWith(
                'https://accounts.weezevent.com/realms/accounts/protocol/openid-connect/token',
                expect.any(Object),
                expect.objectContaining({
                    headers: expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded' }),
                }),
            );
        });

        it('should return cached token if still valid', async () => {
            mockPrisma.integration.findFirst.mockResolvedValue(mockIntegrationRow);
            mockHttpService.axiosRef.post.mockResolvedValue({ data: mockTokenResponse });

            const token1 = await service.getAccessToken(tenantId, integrationId);
            const token2 = await service.getAccessToken(tenantId, integrationId);

            expect(token1).toBe(token2);
            expect(mockHttpService.axiosRef.post).toHaveBeenCalledTimes(1);
        });

        // BUG-025 (corrigé) : le cache/résolution des credentials est scopé par integrationId, pas
        // par tenantId — deux intégrations Weezevent du même tenant ne doivent jamais partager un
        // token ni des credentials.
        it('resolves credentials independently per integration, even for the same tenant', async () => {
            const integrationB = 'integration-b';
            mockPrisma.integration.findFirst.mockImplementation(({ where }: any) =>
                Promise.resolve(
                    where.id === integrationId
                        ? { enabled: true, weezevent: { clientId: 'client-A', clientSecret: 'secret-A' } }
                        : { enabled: true, weezevent: { clientId: 'client-B', clientSecret: 'secret-B' } },
                ),
            );
            mockHttpService.axiosRef.post.mockImplementation((_url: string, _body: any, opts: any) =>
                Promise.resolve({
                    data: {
                        access_token: opts.headers.Authorization.includes(
                            Buffer.from('client-A:decrypted-secret-A').toString('base64'),
                        )
                            ? 'token-A'
                            : 'token-B',
                        expires_in: 3600,
                    },
                }),
            );

            const tokenA = await service.getAccessToken(tenantId, integrationId);
            const tokenB = await service.getAccessToken(tenantId, integrationB);

            expect(tokenA).toBe('token-A');
            expect(tokenB).toBe('token-B');
            expect(mockHttpService.axiosRef.post).toHaveBeenCalledTimes(2);
        });

        it('should throw WeezeventAuthException if config not found', async () => {
            mockPrisma.integration.findFirst.mockResolvedValue(null);

            await expect(service.getAccessToken(tenantId, integrationId)).rejects.toThrow(
                WeezeventAuthException,
            );
            await expect(service.getAccessToken(tenantId, integrationId)).rejects.toThrow(
                'Weezevent not configured',
            );
        });

        it('should throw WeezeventAuthException if integration disabled', async () => {
            mockPrisma.integration.findFirst.mockResolvedValue({
                ...mockIntegrationRow,
                enabled: false,
            });

            await expect(service.getAccessToken(tenantId, integrationId)).rejects.toThrow(
                WeezeventAuthException,
            );
            await expect(service.getAccessToken(tenantId, integrationId)).rejects.toThrow(
                'is disabled',
            );
        });

        it('should throw WeezeventAuthException on auth failure', async () => {
            mockPrisma.integration.findFirst.mockResolvedValue(mockIntegrationRow);
            mockHttpService.axiosRef.post.mockRejectedValue({
                response: {
                    status: 401,
                    data: { error: 'invalid_client' },
                },
            });

            await expect(service.getAccessToken(tenantId, integrationId)).rejects.toThrow(
                WeezeventAuthException,
            );
        });
    });

    describe('clearToken', () => {
        it('should clear cached token for the given integration', async () => {
            const tenantId = 'tenant-123';
            const integrationId = 'integration-a';

            mockPrisma.integration.findFirst.mockResolvedValue({
                enabled: true,
                weezevent: { clientId: 'test-client-id', clientSecret: 'encrypted-secret' },
            });
            mockHttpService.axiosRef.post.mockResolvedValue({
                data: { access_token: 'token', expires_in: 3600 },
            });

            // Get token (cached)
            await service.getAccessToken(tenantId, integrationId);

            // Clear cache
            service.clearToken(integrationId);

            // Next call should request new token
            await service.getAccessToken(tenantId, integrationId);

            expect(mockHttpService.axiosRef.post).toHaveBeenCalledTimes(2);
        });
    });
});
