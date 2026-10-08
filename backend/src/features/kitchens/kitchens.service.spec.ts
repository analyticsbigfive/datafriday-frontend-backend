import { ForbiddenException } from '@nestjs/common';
import { KitchensService } from './kitchens.service';

describe('KitchensService (Settings > Menu F&B > Cuisines)', () => {
    const full = { id: 'u-owner', isSuperAdmin: false, isOwner: true, allSpacesAccess: false };
    const restricted = { id: 'u-staff', isSuperAdmin: false, isOwner: false, allSpacesAccess: false };
    let prisma: any;
    let storage: any;
    let redis: any;
    let service: KitchensService;

    beforeEach(() => {
        prisma = {
            kitchen: {
                create: jest.fn((args: any) => ({ id: 'k1', ...args.data })),
                findMany: jest.fn().mockReturnValue('findMany'),
                count: jest.fn().mockReturnValue('count'),
                findFirst: jest.fn(),
                update: jest.fn(),
                delete: jest.fn().mockReturnValue('delete'),
            },
            menuComponent: { updateMany: jest.fn().mockReturnValue('components') },
            menuItem: { updateMany: jest.fn().mockReturnValue('items') },
            $transaction: jest.fn(async (ops: any[]) => ops.map((op) => (op === 'findMany' ? [] : op === 'count' ? 0 : op))),
        };
        storage = { resolveImage: jest.fn(async (v: any) => (v ? 'https://cdn/kitchen.png' : v)) };
        const spaceAccess = {
            hasFullAccess: (u: any) => u.isOwner || u.isSuperAdmin || u.allSpacesAccess,
            getAccessibleSpaceIds: jest.fn().mockResolvedValue(['space-a']),
        };
        redis = { deletePattern: jest.fn().mockResolvedValue(undefined) };
        service = new KitchensService(prisma, storage, spaceAccess as any, redis);
    });

    it('crée la fiche (image envoyée au stockage, téléphone en tel, espaces en sites)', async () => {
        await service.create(
            { name: 'Labo Nord', picture: 'data:image/png;base64,AAA', phone: '0102', spaceIds: ['space-a'], email: '' },
            't1',
            full,
        );
        expect(storage.resolveImage).toHaveBeenCalledWith('data:image/png;base64,AAA', 'kitchens');
        expect(prisma.kitchen.create.mock.calls[0][0].data).toMatchObject({
            name: 'Labo Nord', picture: 'https://cdn/kitchen.png', tel: '0102', sites: ['space-a'], email: null, tenantId: 't1',
        });
    });

    it("un compte restreint ne crée pas de cuisine sur l'espace d'un autre", async () => {
        await expect(service.create({ name: 'X', spaceIds: ['space-z'] }, 't1', restricted)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('liste : un compte restreint ne voit que les cuisines de ses espaces', async () => {
        await service.findAll('t1', 1, 100, restricted);
        expect(prisma.kitchen.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', sites: { hasSome: ['space-a'] } });
        await service.findAll('t1', 1, 100, full);
        expect(prisma.kitchen.findMany.mock.calls[1][0].where).toEqual({ tenantId: 't1' });
    });

    it('suppression : les fiches rattachées perdent leur cuisine (pas de Central orphelin)', async () => {
        prisma.kitchen.findFirst.mockResolvedValue({ id: 'k1', sites: ['space-a'] });
        await service.remove('k1', 't1', restricted);
        const reset = { where: { kitchenId: 'k1' }, data: { kitchenId: null, kitchenType: null } };
        expect(prisma.menuComponent.updateMany).toHaveBeenCalledWith(reset);
        expect(prisma.menuItem.updateMany).toHaveBeenCalledWith(reset);
        expect(prisma.kitchen.delete).toHaveBeenCalledWith({ where: { id: 'k1' } });
        expect(redis.deletePattern).toHaveBeenCalledWith('menu-components:t1:*');
        expect(redis.deletePattern).toHaveBeenCalledWith('menu-items:t1:*');
    });

    it("un compte restreint ne rattache pas une nouvelle cuisine à un espace qu'il n'a pas, même avec un des siens", async () => {
        await expect(service.create({ name: 'X', spaceIds: ['space-a', 'space-z'] }, 't1', restricted)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("modification par un compte restreint : l'espace qu'il ne voit pas est conservé", async () => {
        prisma.kitchen.findFirst.mockResolvedValue({ id: 'k1', sites: ['space-a', 'space-z'] });
        await service.update('k1', { spaceIds: ['space-a'] }, 't1', restricted);
        expect(prisma.kitchen.update.mock.calls[0][0].data.sites).toEqual(['space-a', 'space-z']);
    });

    it("refuse la lecture d'une cuisine hors de ses espaces", async () => {
        prisma.kitchen.findFirst.mockResolvedValue({ id: 'k2', sites: ['space-z'] });
        await expect(service.findOne('k2', 't1', restricted)).rejects.toBeInstanceOf(ForbiddenException);
    });
});
