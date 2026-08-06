import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WeezeventIntegrationService } from './weezevent-integration.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/encryption/encryption.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';

describe('WeezeventIntegrationService', () => {
    let service: WeezeventIntegrationService;

    const mockPrismaService: any = {
        tenant: {
            findUnique: jest.fn(),
            update: jest.fn().mockResolvedValue({}),
        },
        integration: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            delete: jest.fn(),
        },
    };

    const mockEncryptionService = {
        encrypt: jest.fn().mockReturnValue('encrypted-secret'),
        decrypt: jest.fn().mockReturnValue('decrypted-secret'),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventIntegrationService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: EncryptionService, useValue: mockEncryptionService },
                { provide: SpaceAccessService, useValue: { hasFullAccess: () => true, getAccessibleSpaceIds: async () => 'ALL' } },
            ],
        }).compile();

        service = module.get<WeezeventIntegrationService>(WeezeventIntegrationService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('createInstance', () => {
        it('creates a new instance and mirrors to tenant', async () => {
            mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 'org-123' });
            const created = {
                id: 'inst-1',
                name: 'My Event',
                enabled: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                weezevent: { clientId: 'client-1', organizationId: 'weez-1' },
            };
            mockPrismaService.integration.create.mockResolvedValue(created);
            mockPrismaService.integration.findFirst.mockResolvedValue({
                ...created,
                weezevent: { ...created.weezevent, clientSecret: 'encrypted-secret' },
            });

            const result = await service.createInstance('org-123', {
                name: 'My Event',
                clientId: 'client-1',
                clientSecret: 'secret',
                organizationId: 'weez-1',
            });

            expect(result.id).toBe('inst-1');
            expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('secret');
            expect(mockPrismaService.tenant.update).toHaveBeenCalled();
        });

        it('throws NotFound when tenant missing', async () => {
            mockPrismaService.tenant.findUnique.mockResolvedValue(null);
            await expect(
                service.createInstance('missing', {
                    name: 'X',
                    clientId: 'c',
                    clientSecret: 's',
                    organizationId: 'weez-1',
                }),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('updateInstance', () => {
        it('keeps existing secret when clientSecret omitted', async () => {
            mockPrismaService.integration.findFirst.mockResolvedValue({ id: 'inst-1' });
            mockPrismaService.integration.update.mockResolvedValue({
                id: 'inst-1',
                name: 'Renamed',
                clientId: 'client-1',
                organizationId: 'weez-1',
                enabled: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            await service.updateInstance('org-123', 'inst-1', { name: 'Renamed' });

            expect(mockEncryptionService.encrypt).not.toHaveBeenCalled();
        });

        it('encrypts clientSecret when provided', async () => {
            mockPrismaService.integration.findFirst.mockResolvedValue({ id: 'inst-1' });
            mockPrismaService.integration.update.mockResolvedValue({
                id: 'inst-1',
                name: 'X',
                clientId: 'c',
                organizationId: null,
                enabled: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            await service.updateInstance('org-123', 'inst-1', { clientSecret: 'new-secret' });

            expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('new-secret');
        });

        it('throws NotFound when instance missing', async () => {
            mockPrismaService.integration.findFirst.mockResolvedValue(null);
            await expect(
                service.updateInstance('org-123', 'missing', { name: 'X' }),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('deleteInstance', () => {
        it('deletes and disables tenant when no more instances', async () => {
            mockPrismaService.integration.findFirst
                .mockResolvedValueOnce({ id: 'inst-1' })
                .mockResolvedValueOnce(null);
            mockPrismaService.integration.delete.mockResolvedValue({});

            await service.deleteInstance('org-123', 'inst-1');

            expect(mockPrismaService.tenant.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ weezeventEnabled: false }),
                }),
            );
        });
    });

    describe('BUG-106: webhook config per instance', () => {
        describe('getWebhookConfig', () => {
            it('returns enabled/configured from the instance config', async () => {
                mockPrismaService.integration.findFirst.mockResolvedValue({
                    weezevent: { webhookEnabled: true, webhookSecret: 'encrypted-secret' },
                });

                const result = await service.getWebhookConfig('org-123', 'inst-1');

                expect(result).toEqual({ enabled: true, configured: true });
            });

            it('returns disabled/unconfigured when no webhook config exists yet', async () => {
                mockPrismaService.integration.findFirst.mockResolvedValue({
                    weezevent: { webhookEnabled: null, webhookSecret: null },
                });

                const result = await service.getWebhookConfig('org-123', 'inst-1');

                expect(result).toEqual({ enabled: false, configured: false });
            });

            it('throws NotFound when instance missing', async () => {
                mockPrismaService.integration.findFirst.mockResolvedValue(null);
                await expect(service.getWebhookConfig('org-123', 'missing')).rejects.toThrow(
                    NotFoundException,
                );
            });
        });

        describe('updateWebhookConfig', () => {
            it('encrypts the secret before persisting', async () => {
                mockPrismaService.integration.findFirst
                    .mockResolvedValueOnce({ id: 'inst-1' })
                    .mockResolvedValueOnce({
                        weezevent: { webhookEnabled: true, webhookSecret: 'encrypted-secret' },
                    });
                mockPrismaService.integration.update.mockResolvedValue({});

                await service.updateWebhookConfig('org-123', 'inst-1', {
                    webhookSecret: 'plain-secret',
                    webhookEnabled: true,
                });

                expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('plain-secret');
                expect(mockPrismaService.integration.update).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: { id: 'inst-1' },
                        data: expect.objectContaining({
                            weezevent: expect.objectContaining({
                                upsert: expect.objectContaining({
                                    update: expect.objectContaining({
                                        webhookSecret: 'encrypted-secret',
                                        webhookEnabled: true,
                                    }),
                                }),
                            }),
                        }),
                    }),
                );
            });

            it('keeps the existing secret when webhookSecret is omitted (rotation optional)', async () => {
                mockPrismaService.integration.findFirst
                    .mockResolvedValueOnce({ id: 'inst-1' })
                    .mockResolvedValueOnce({
                        weezevent: { webhookEnabled: false, webhookSecret: 'encrypted-secret' },
                    });
                mockPrismaService.integration.update.mockResolvedValue({});

                await service.updateWebhookConfig('org-123', 'inst-1', { webhookEnabled: false });

                expect(mockEncryptionService.encrypt).not.toHaveBeenCalled();
            });

            it('throws NotFound when instance missing', async () => {
                mockPrismaService.integration.findFirst.mockResolvedValue(null);
                await expect(
                    service.updateWebhookConfig('org-123', 'missing', { webhookEnabled: true }),
                ).rejects.toThrow(NotFoundException);
            });
        });
    });

    describe('getConfig (legacy)', () => {
        it('returns first enabled instance when present', async () => {
            mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 'org-123' });
            mockPrismaService.integration.findFirst.mockResolvedValueOnce({
                id: 'inst-1',
                enabled: true,
                weezevent: { clientId: 'c1', organizationId: 'o1' },
            });

            const result = await service.getConfig('org-123');
            expect(result).toEqual({
                clientId: 'c1',
                organizationId: 'o1',
                enabled: true,
                configured: true,
            });
        });

        it('throws NotFound when tenant missing', async () => {
            mockPrismaService.tenant.findUnique.mockResolvedValue(null);
            await expect(service.getConfig('missing')).rejects.toThrow(NotFoundException);
        });
    });
});
