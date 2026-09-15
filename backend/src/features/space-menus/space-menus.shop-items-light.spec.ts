import { SpaceMenusService } from './space-menus.service';

describe('SpaceMenusService.getConfigShopMenuItemsLight (BUG-383-02 : articles = union des configurations)', () => {
    const beer = { id: 'mi-beer', name: 'Bière', basePrice: 6, productCategory: { name: 'Beer' } };
    const hotdog = { id: 'mi-hotdog', name: 'Hot dog', basePrice: 5, productCategory: { name: 'Food' } };
    let prisma: any;
    let service: SpaceMenusService;

    beforeEach(() => {
        prisma = {
            config: { findFirst: jest.fn().mockResolvedValue({ id: 'cfg-pfc' }) },
            spaceElement: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'shop-1',
                        name: 'Buvette D',
                        // Même article assigné dans deux configurations (PFC et SFP) + un article SFP seul.
                        menuAssignments: [{ menuItem: beer }, { menuItem: beer }, { menuItem: hotdog }],
                    },
                ]),
            },
        };
        service = new SpaceMenusService(prisma, {} as any, {} as any, {} as any);
    });

    it("par défaut, ne lit que les assignations de LA configuration (Analyse, Space Menu)", async () => {
        await service.getConfigShopMenuItemsLight('space-1', 'cfg-pfc', 'tenant-1');
        const args = prisma.spaceElement.findMany.mock.calls[0][0];
        expect(args.select.menuAssignments.where).toEqual({ configId: 'cfg-pfc', enabled: true, menuItem: { deletedAt: null } });
        // Les PdV restent ceux de la configuration demandée.
        expect(args.where.OR).toEqual(expect.arrayContaining([{ floor: { configId: 'cfg-pfc' } }]));
    });

    it("itemsScope 'space' : PdV de la configuration, articles de toutes les configurations de l'espace, dédupliqués", async () => {
        const out = await service.getConfigShopMenuItemsLight('space-1', 'cfg-pfc', 'tenant-1', { itemsScope: 'space' });
        const args = prisma.spaceElement.findMany.mock.calls[0][0];
        expect(args.select.menuAssignments.where).toEqual({ enabled: true, menuItem: { deletedAt: null }, config: { spaceId: 'space-1' } });
        expect(args.where.OR).toEqual(expect.arrayContaining([{ floor: { configId: 'cfg-pfc' } }]));
        expect(out['shop-1'].items.map((i) => i.id)).toEqual(['mi-beer', 'mi-hotdog']);
    });

    it('configuration inconnue ou hors tenant : réponse vide', async () => {
        prisma.config.findFirst.mockResolvedValue(null);
        expect(await service.getConfigShopMenuItemsLight('space-1', 'nope', 'tenant-1', { itemsScope: 'space' })).toEqual({});
    });
});
