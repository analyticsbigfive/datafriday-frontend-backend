import { GuestPinAccessService } from './guest-pin-access.service';

describe('GuestPinAccessService.getCatalog (BUG-383-02 : articles = union des configurations de l\'espace)', () => {
    const user = { tenantId: 'tenant-1', eventId: 'event-1', elementId: 'shop-1', phase: 'pre-event' } as any;
    let prisma: any;
    let menuItems: any;
    let service: GuestPinAccessService;

    beforeEach(() => {
        prisma = {
            event: { findUnique: jest.fn().mockResolvedValue({ configurationId: 'cfg-pfc' }) },
            config: { findUnique: jest.fn().mockResolvedValue({ spaceId: 'space-1' }) },
            spaceElement: {
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
            },
        };
        menuItems = { getRecipes: jest.fn().mockResolvedValue({ items: [] }) };
        const marketPrices = { findAll: jest.fn().mockResolvedValue({ data: [] }) };
        const menuComponents = { findAll: jest.fn().mockResolvedValue({ data: [] }) };
        service = new GuestPinAccessService(
            prisma, {} as any, {} as any, {} as any, {} as any, menuItems, marketPrices as any, menuComponents as any, {} as any, {} as any, {} as any,
        );
    });

    it("propose au PDV les articles de toutes les configurations de son espace, dédupliqués, jamais ceux d'un autre espace", async () => {
        await service.getCatalog(user);
        const enabledIds = menuItems.getRecipes.mock.calls.map((c: any[]) => c[0]).find((ids: any) => Array.isArray(ids) && ids.length);
        expect(enabledIds).toEqual(['mi-beer', 'mi-hotdog']);
    });
});
