import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MenuComponentsService } from './menu-components.service';

// Demande Bertrand 2026-10-08 : espaces des composants (vide = commun), filtre des
// comptes restreints, cuisine Locale ou cuisine de Settings.
describe('MenuComponentsService : espaces et cuisine', () => {
    const full = { id: 'u-owner', isSuperAdmin: false, isOwner: true, allSpacesAccess: false };
    const restricted = { id: 'u-staff', isSuperAdmin: false, isOwner: false, allSpacesAccess: false };
    let prisma: any;
    let redis: any;
    let spaceAccess: any;
    let service: MenuComponentsService;

    beforeEach(() => {
        prisma = {
            menuComponent: {
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
                findFirst: jest.fn(),
                update: jest.fn().mockResolvedValue({ id: 'c1' }),
            },
            kitchen: { findFirst: jest.fn() },
        };
        redis = { getOrSet: jest.fn((_k: string, fn: () => any) => fn()), deletePattern: jest.fn() };
        spaceAccess = {
            hasFullAccess: jest.fn((u: any) => u.isOwner || u.isSuperAdmin || u.allSpacesAccess),
            getAccessibleSpaceIds: jest.fn().mockResolvedValue(['space-b', 'space-a']),
        };
        service = new MenuComponentsService(prisma, redis, spaceAccess, { resolveImage: async (v: any) => v } as any);
    });

    describe('findAll', () => {
        it('accès complet : tous les composants, clé de cache « all »', async () => {
            await service.findAll('t1', 1, 100, full);
            expect(prisma.menuComponent.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', deletedAt: null });
            expect(redis.getOrSet.mock.calls[0][0]).toBe('menu-components:t1:list:all:1:100');
        });

        it('compte restreint : composants communs + ceux de ses espaces, périmètre dans la clé', async () => {
            await service.findAll('t1', 1, 100, restricted);
            expect(prisma.menuComponent.findMany.mock.calls[0][0].where).toEqual({
                tenantId: 't1',
                deletedAt: null,
                OR: [{ spaceIds: { isEmpty: true } }, { spaceIds: { hasSome: ['space-b', 'space-a'] } }],
            });
            expect(prisma.menuComponent.count.mock.calls[0][0].where.OR).toBeDefined();
            expect(redis.getOrSet.mock.calls[0][0]).toBe('menu-components:t1:list:s:space-a,space-b:1:100');
        });

        it('appel interne sans utilisateur (catalogue invité) : aucun filtre', async () => {
            await service.findAll('t1', 1, 5000);
            expect(prisma.menuComponent.findMany.mock.calls[0][0].where.OR).toBeUndefined();
            expect(spaceAccess.getAccessibleSpaceIds).not.toHaveBeenCalled();
        });
    });

    describe('findOne', () => {
        it("refuse un composant d'un autre espace à un compte restreint", async () => {
            prisma.menuComponent.findFirst.mockResolvedValue({ id: 'c1', spaceIds: ['space-z'] });
            await expect(service.findOne('c1', 't1', restricted)).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('accepte un composant commun ou de ses espaces', async () => {
            prisma.menuComponent.findFirst.mockResolvedValueOnce({ id: 'c1', spaceIds: [] });
            await expect(service.findOne('c1', 't1', restricted)).resolves.toMatchObject({ id: 'c1' });
            prisma.menuComponent.findFirst.mockResolvedValueOnce({ id: 'c2', spaceIds: ['space-z', 'space-a'] });
            await expect(service.findOne('c2', 't1', restricted)).resolves.toMatchObject({ id: 'c2' });
        });
    });

    describe('update', () => {
        beforeEach(() => {
            prisma.menuComponent.findFirst.mockResolvedValue({ id: 'c1', spaceIds: [] });
            jest.spyOn(service as any, 'assertIngredientsExist').mockResolvedValue(undefined);
            jest.spyOn(service as any, 'assertChildrenExist').mockResolvedValue(undefined);
            jest.spyOn(service as any, 'assertComponentTypeAccessible').mockResolvedValue(undefined);
            jest.spyOn(service as any, 'assertComponentCategoryAccessible').mockResolvedValue(undefined);
            jest.spyOn(service, 'refreshCosts').mockResolvedValue({ updatedComponents: 0, updatedLines: 0 } as any);
        });

        const updateData = () => prisma.menuComponent.update.mock.calls[0][0].data;

        it("un compte restreint ne rattache pas un composant à l'espace d'un autre", async () => {
            await expect(service.update('c1', { spaceIds: ['space-z'] }, 't1', restricted)).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("composant partagé A + B : un compte A l'enregistre, l'espace B qu'il ne voit pas est conservé", async () => {
            prisma.menuComponent.findFirst.mockResolvedValue({ id: 'c1', spaceIds: ['space-a', 'space-z'] });
            await service.update('c1', { spaceIds: ['space-a', 'space-z'], name: 'Aïoli' }, 't1', restricted);
            expect(updateData().spaceIds).toEqual(['space-a', 'space-z']);
            prisma.menuComponent.update.mockClear();
            await service.update('c1', { spaceIds: ['space-a'] }, 't1', restricted);
            expect(updateData().spaceIds).toEqual(['space-a', 'space-z']);
        });

        it('cuisine de Settings : kitchenType Central + kitchenId', async () => {
            prisma.kitchen.findFirst.mockResolvedValue({ id: 'k1' });
            await service.update('c1', { kitchenId: 'k1', spaceIds: ['space-a'], picture: 'https://img' }, 't1', restricted);
            expect(prisma.kitchen.findFirst).toHaveBeenCalledWith({ where: { id: 'k1', tenantId: 't1' }, select: { id: true } });
            expect(updateData()).toMatchObject({ kitchenType: 'Central', kitchenId: 'k1', spaceIds: ['space-a'], picture: 'https://img' });
        });

        it("cuisine d'un autre client : refusée", async () => {
            prisma.kitchen.findFirst.mockResolvedValue(null);
            await expect(service.update('c1', { kitchenId: 'k-other' }, 't1', full)).rejects.toBeInstanceOf(BadRequestException);
        });

        it('Cuisine Locale : kitchenType Local, sans cuisine rattachée', async () => {
            await service.update('c1', { kitchenType: 'Local' as any }, 't1', full);
            expect(updateData()).toMatchObject({ kitchenType: 'Local', kitchenId: null });
        });

        it('champ vidé : plus de cuisine', async () => {
            await service.update('c1', { kitchenType: null as any, kitchenId: null }, 't1', full);
            expect(updateData()).toMatchObject({ kitchenType: null, kitchenId: null });
        });

        it('DTO sans cuisine : champs cuisine inchangés', async () => {
            await service.update('c1', { name: 'Aïoli' }, 't1', full);
            expect(updateData()).not.toHaveProperty('kitchenType');
            expect(updateData()).not.toHaveProperty('kitchenId');
        });
    });
});
