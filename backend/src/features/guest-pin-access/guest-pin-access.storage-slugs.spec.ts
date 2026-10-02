import { GuestPinAccessService } from './guest-pin-access.service';

describe('GuestPinAccessService.getStorageSlugs (QR code des espaces de stockage)', () => {
    const user = { tenantId: 'tenant-1' } as any;
    let prisma: any;
    let service: GuestPinAccessService;

    beforeEach(() => {
        prisma = {
            spaceElement: {
                findMany: jest.fn().mockResolvedValue([
                    { id: 'storage-1', slug: 'reserve-nord' },
                    { id: 'storage-2', slug: 'chambre-froide' },
                ]),
            },
        };
        service = new GuestPinAccessService(
            prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
            {} as any,
      {} as any, // postEventDraft
            {} as any, // spaceMenus
            {} as any, // storageTypes
        );
        (service as any).spaceAccess = { assertCanAccessSpace: jest.fn().mockResolvedValue(undefined) };
    });

    it("renvoie { elementId: slug } des seuls stockages de l'espace du tenant (v1 et Builder v2)", async () => {
        const slugs = await service.getStorageSlugs('space-1', user);
        expect(slugs).toEqual({ 'storage-1': 'reserve-nord', 'storage-2': 'chambre-froide' });
        const where = prisma.spaceElement.findMany.mock.calls[0][0].where;
        const inSpace = { spaceId: 'space-1', space: { tenantId: 'tenant-1' } };
        expect(where.type).toBe('storage');
        expect(where.OR).toEqual([
            { floor: { config: inSpace } },
            { forecourt: { config: inSpace } },
            { externalMerch: { config: inSpace } },
            { zone: inSpace },
        ]);
    });

    it("vérifie l'accès à l'espace avant toute lecture", async () => {
        (service as any).spaceAccess.assertCanAccessSpace.mockRejectedValue(new Error('forbidden'));
        await expect(service.getStorageSlugs('space-1', user)).rejects.toThrow('forbidden');
        expect(prisma.spaceElement.findMany).not.toHaveBeenCalled();
    });
});
