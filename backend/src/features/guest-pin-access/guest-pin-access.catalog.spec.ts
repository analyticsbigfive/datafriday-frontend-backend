import { GuestPinAccessService } from './guest-pin-access.service';

describe('GuestPinAccessService.getCatalog (BUG-383-02 : articles = union des configurations de l\'espace)', () => {
    const user = { tenantId: 'tenant-1', spaceId: 'space-1', eventId: 'event-1', elementId: 'shop-1', phase: 'pre-event' } as any;
    let prisma: any;
    let menuItems: any;
    let spaceMenus: any;
    let storageTypes: any;
    let service: GuestPinAccessService;

    beforeEach(() => {
        prisma = {
            event: { findUnique: jest.fn().mockResolvedValue({ configurationId: 'cfg-pfc' }) },
            config: { findUnique: jest.fn().mockResolvedValue({ spaceId: 'space-1' }) },
            spaceElement: {
                findUnique: jest.fn().mockResolvedValue({ name: 'Buvette D', type: 'shop', storageTypes: [], attributes: {} }),
                findFirst: jest.fn().mockResolvedValue({
                    name: 'Buvette D',
                    floor: null,
                    forecourt: null,
                    externalMerch: null,
                    configurationElements: [{ configId: 'cfg-pfc' }],
                    menuAssignments: [
                        { menuItemId: 'mi-beer', configId: 'cfg-pfc', config: { spaceId: 'space-1' } },
                        { menuItemId: 'mi-beer', configId: 'cfg-sfp', config: { spaceId: 'space-1' } },
                        { menuItemId: 'mi-hotdog', configId: 'cfg-sfp', config: { spaceId: 'space-1' } },
                        { menuItemId: 'mi-other-space', configId: 'cfg-x', config: { spaceId: 'space-2' } },
                    ],
                }),
                findMany: jest.fn(),
            },
        };
        menuItems = { getRecipes: jest.fn().mockResolvedValue({ items: [] }) };
        const marketPrices = { findAll: jest.fn().mockResolvedValue({ data: [] }) };
        const menuComponents = { findAll: jest.fn().mockResolvedValue({ data: [] }) };
        spaceMenus = { getConfigShopMenuItemsLight: jest.fn() };
        storageTypes = { findAll: jest.fn().mockResolvedValue({ data: [{ name: 'Sec', code: 'dry' }] }) };
        service = new GuestPinAccessService(
            prisma, {} as any, {} as any, {} as any, {} as any, menuItems, marketPrices as any, menuComponents as any, {} as any, {} as any, {} as any,
            {} as any, // postEventDraft
            spaceMenus,
            storageTypes,
        );
    });

    it("propose au PDV les articles de toutes les configurations de son espace, dédupliqués, jamais ceux d'un autre espace", async () => {
        await service.getCatalog(user);
        const enabledIds = menuItems.getRecipes.mock.calls.map((c: any[]) => c[0]).find((ids: any) => Array.isArray(ids) && ids.length);
        expect(enabledIds).toEqual(['mi-beer', 'mi-hotdog']);
        expect(spaceMenus.getConfigShopMenuItemsLight).not.toHaveBeenCalled();
    });

    it('refuse les routes de comptage à un jeton de ventilation (logisticien)', async () => {
        const ventilationUser = { ...user, phase: 'ventilation' };
        await expect(service.getCatalog(ventilationUser)).rejects.toThrow("ne permet pas de compter");
        await expect(service.saveCount(ventilationUser, { itemId: 'i' } as any)).rejects.toThrow("ne permet pas de compter");
        await expect(service.submitCount(ventilationUser)).rejects.toThrow("ne permet pas de compter");
        expect(prisma.event.findUnique).not.toHaveBeenCalled();
    });

    describe('stockage (QR code des espaces de stockage)', () => {
        const storageUser = { ...user, elementId: 'storage-1' };

        beforeEach(() => {
            prisma.spaceElement.findUnique.mockResolvedValue({
                name: 'Réserve Nord',
                type: 'storage',
                storageTypes: ['cold'],
                attributes: { storageShopIds: ['shop-1'] },
            });
            spaceMenus.getConfigShopMenuItemsLight.mockResolvedValue({
                'shop-1': { shopName: 'Buvette D', items: [{ id: 'mi-beer' }, { id: 'mi-hotdog' }] },
                'merch-1': { shopName: 'Boutique', items: [{ id: 'mi-scarf' }] },
                'storage-1': { shopName: 'Réserve Nord', items: [{ id: 'mi-x' }] },
            });
            prisma.spaceElement.findMany.mockResolvedValue([{ id: 'shop-1' }]);
        });

        it("renvoie les PdV de la config de l'event avec leurs articles (union de l'espace), sans stockage ni merch", async () => {
            const catalog: any = await service.getCatalog(storageUser);
            expect(spaceMenus.getConfigShopMenuItemsLight).toHaveBeenCalledWith('space-1', 'cfg-pfc', 'tenant-1', { itemsScope: 'space' });
            const where = prisma.spaceElement.findMany.mock.calls[0][0].where;
            expect(where.id.in).toEqual(['shop-1', 'merch-1']);
            expect(where.type).toEqual({ notIn: ['storage', 'merchshop'] });
            expect(catalog.elementType).toBe('storage');
            expect(catalog.fbElements).toEqual([{ id: 'shop-1', name: 'Buvette D', menuItemIds: ['mi-beer', 'mi-hotdog'] }]);
        });

        it('porte les types du stockage, les PdV servis et le référentiel des types', async () => {
            const catalog: any = await service.getCatalog(storageUser);
            expect(catalog.elementName).toBe('Réserve Nord');
            expect(catalog.storage).toEqual({ storageTypes: ['cold'], selectedShopIds: ['shop-1'] });
            expect(catalog.storageTypes).toEqual([{ name: 'Sec', code: 'dry' }]);
            expect(prisma.spaceElement.findFirst).not.toHaveBeenCalled();
        });

        it('lit selectedShops (configs v1) quand storageShopIds est absent', async () => {
            prisma.spaceElement.findUnique.mockResolvedValue({
                name: 'Réserve Nord', type: 'storage', storageTypes: [], attributes: { selectedShops: ['shop-1'] },
            });
            const catalog: any = await service.getCatalog(storageUser);
            expect(catalog.storage.selectedShopIds).toEqual(['shop-1']);
        });
    });
});
