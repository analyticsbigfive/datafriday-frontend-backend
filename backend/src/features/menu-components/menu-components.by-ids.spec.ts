import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MenuComponentsByIdsQueryDto } from './dto/menu-components.query.dto';
import { MenuComponentsService } from './menu-components.service';
import { createMenuComponentsServices } from './services/menu-components-services.testing';
import { buildByIdsWhere, MENU_COMPONENT_BY_IDS_MAX, parseComponentIds } from './services/menu-component-by-ids';

// Lecture groupée du détail (GET /menu-components/by-ids) : remplace N appels GET /menu-components/:id.
describe('parseComponentIds', () => {
    it('sépare par virgules, retire les vides et les doublons, garde l ordre', () => {
        expect(parseComponentIds('a, b,,a ,c')).toEqual(['a', 'b', 'c']);
    });

    it('chaîne vide ou absente : aucune id', () => {
        expect(parseComponentIds('')).toEqual([]);
        expect(parseComponentIds(undefined as unknown as string)).toEqual([]);
    });

    it('accepte exactement le plafond et refuse au-delà', () => {
        const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`).join(',');
        expect(parseComponentIds(ids(MENU_COMPONENT_BY_IDS_MAX))).toHaveLength(MENU_COMPONENT_BY_IDS_MAX);
        expect(() => parseComponentIds(ids(MENU_COMPONENT_BY_IDS_MAX + 1))).toThrow(BadRequestException);
    });

    it('le plafond compte les ids distinctes, pas les doublons', () => {
        expect(parseComponentIds(Array(MENU_COMPONENT_BY_IDS_MAX + 20).fill('same').join(','))).toEqual(['same']);
    });
});

describe('buildByIdsWhere', () => {
    it('accès complet : id dans la liste, tenant, non supprimé, aucun filtre d espace', () => {
        expect(buildByIdsWhere(['a', 'b'], 't1', 'ALL')).toEqual({ id: { in: ['a', 'b'] }, tenantId: 't1', deletedAt: null });
    });

    it('compte restreint : composants communs ou de ses espaces (même filtre que findAll)', () => {
        expect(buildByIdsWhere(['a'], 't1', ['space-a'])).toEqual({
            id: { in: ['a'] },
            tenantId: 't1',
            deletedAt: null,
            OR: [{ spaceIds: { isEmpty: true } }, { spaceIds: { hasSome: ['space-a'] } }],
        });
    });
});

describe('MenuComponentsService.findByIds', () => {
    const full = { id: 'u-owner', isSuperAdmin: false, isOwner: true, allSpacesAccess: false };
    const restricted = { id: 'u-staff', isSuperAdmin: false, isOwner: false, allSpacesAccess: false };
    let prisma: any;
    let spaceAccess: any;
    let service: MenuComponentsService;

    beforeEach(() => {
        prisma = { menuComponent: { findMany: jest.fn().mockResolvedValue([]) } };
        spaceAccess = {
            hasFullAccess: jest.fn((u: any) => u.isOwner || u.isSuperAdmin || u.allSpacesAccess),
            getAccessibleSpaceIds: jest.fn().mockResolvedValue(['space-a']),
        };
        const redis = { getOrSet: jest.fn(), deletePattern: jest.fn() };
        ({ menuComponentsService: service } = createMenuComponentsServices({ prisma, redis, spaceAccess }));
    });

    it('une seule requête pour tous les ids, avec les relations du détail, sans passer par le cache', async () => {
        const redis = { getOrSet: jest.fn(), deletePattern: jest.fn() };
        ({ menuComponentsService: service } = createMenuComponentsServices({ prisma, redis, spaceAccess }));
        prisma.menuComponent.findMany.mockResolvedValue([{ id: 'a', seasonLinks: [{ seasonId: 's1' }] }, { id: 'b', seasonLinks: [] }]);
        const out = await service.findByIds('a,b', 't1', full);
        expect(prisma.menuComponent.findMany).toHaveBeenCalledTimes(1);
        const arg = prisma.menuComponent.findMany.mock.calls[0][0];
        expect(arg.where).toEqual({ id: { in: ['a', 'b'] }, tenantId: 't1', deletedAt: null });
        expect(Object.keys(arg.include)).toEqual(expect.arrayContaining(['ingredients', 'children', 'parents', 'kitchen', 'seasonLinks']));
        expect(redis.getOrSet).not.toHaveBeenCalled();
        // Même forme que findOne : seasonLinks remplacé par seasonIds.
        expect(out.data).toEqual([
            { id: 'a', seasonIds: ['s1'] },
            { id: 'b', seasonIds: [] },
        ]);
    });

    it('compte restreint : le périmètre d espaces est appliqué dans la requête', async () => {
        await service.findByIds('a', 't1', restricted);
        expect(prisma.menuComponent.findMany.mock.calls[0][0].where.OR).toEqual([
            { spaceIds: { isEmpty: true } },
            { spaceIds: { hasSome: ['space-a'] } },
        ]);
    });

    it('appel interne sans utilisateur : aucun filtre d espace', async () => {
        await service.findByIds('a', 't1');
        expect(prisma.menuComponent.findMany.mock.calls[0][0].where.OR).toBeUndefined();
        expect(spaceAccess.getAccessibleSpaceIds).not.toHaveBeenCalled();
    });

    it('liste vide : aucune requête', async () => {
        expect(await service.findByIds('', 't1', full)).toEqual({ data: [] });
        expect(prisma.menuComponent.findMany).not.toHaveBeenCalled();
    });

    it('trop d ids : refus avant toute requête', async () => {
        const ids = Array.from({ length: MENU_COMPONENT_BY_IDS_MAX + 1 }, (_, i) => `c${i}`).join(',');
        await expect(service.findByIds(ids, 't1', full)).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.menuComponent.findMany).not.toHaveBeenCalled();
    });
});

describe('MenuComponentsByIdsQueryDto', () => {
    const errorsFor = (ids: unknown) => validate(plainToInstance(MenuComponentsByIdsQueryDto, { ids }));

    it('accepte une liste d identifiants séparés par des virgules', async () => {
        expect(await errorsFor('cmabc123,cmdef456')).toHaveLength(0);
        expect(await errorsFor('cmabc123')).toHaveLength(0);
        expect(await errorsFor('a_b-c,d')).toHaveLength(0);
    });

    it('refuse l absence de paramètre, une chaîne vide et les caractères inattendus', async () => {
        expect((await errorsFor(undefined)).length).toBeGreaterThan(0);
        expect((await errorsFor('')).length).toBeGreaterThan(0);
        expect((await errorsFor('a b')).length).toBeGreaterThan(0);
        expect((await errorsFor('a;b')).length).toBeGreaterThan(0);
        expect((await errorsFor("a'--")).length).toBeGreaterThan(0);
        expect((await errorsFor(['a', 'b'])).length).toBeGreaterThan(0);
    });

    it('refuse une chaîne de plus de 5000 caractères', async () => {
        expect((await errorsFor('a'.repeat(5001))).length).toBeGreaterThan(0);
    });
});
