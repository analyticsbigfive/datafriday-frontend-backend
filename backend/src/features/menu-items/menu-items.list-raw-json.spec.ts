import { gunzipSync } from 'zlib';
import { Controller, Get, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCompress from '@fastify/compress';
import { Prisma } from '@prisma/client';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { createGlobalValidationPipe } from '../../core/pipes/global-validation.pipe';
import { RedisService } from '../../core/redis/redis.service';
import { MenuItemsController } from './menu-items.controller';
import { createMenuItemsServices } from './services/menu-items-services.testing';
import { MenuItemBulkCreateService } from './services/menu-item-bulk-create.service';
import { MenuItemCommandService } from './services/menu-item-command.service';
import { MenuItemCompositionService } from './services/menu-item-composition.service';
import { MenuItemCostService } from './services/menu-item-cost.service';
import { MenuItemQueryService } from './services/menu-item-query.service';
import { MenuItemRecipeService } from './services/menu-item-recipe.service';
import { MenuItemWeezeventPriceService } from './services/menu-item-weezevent-price.service';
import { ProductTaxonomyService } from './services/product-taxonomy.service';

/**
 * GET /menu-items : la liste servie depuis le cache Redis est renvoyée telle quelle (chaîne JSON
 * brute, sans JSON.parse ni JSON.stringify). Ces tests prouvent que la réponse HTTP reste
 * strictement identique à celle de l'ancien chemin (`redis.getOrSet` qui parse, puis Fastify qui
 * re-sérialise l'objet) : mêmes octets, mêmes en-têtes, en miss comme en hit, brut comme gzip.
 */

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const KEY_A = `datafriday:menu-items:${TENANT}:list:1:100:all:::::`;
const VAT = 0.2;

// Articles tels que Prisma les renvoie : Decimal (toJSON en chaîne), Date, undefined, unicode,
// caractères à échapper, relations imbriquées.
const makeItem = (i: number) => ({
  id: `mi-${i}`,
  tenantId: TENANT,
  name: `Article ${i} « é » "guillemets" \\ 🍺`,
  description: undefined,
  picture: null,
  basePrice: new Prisma.Decimal('12.50'),
  totalCost: new Prisma.Decimal('3.1234'),
  numberOfPiecesRecipe: 2,
  createdAt: new Date('2026-01-02T03:04:05.678Z'),
  seasonLinks: [{ seasonId: 'season-1' }],
  menuAssignments: [{ station: { config: { spaceId: 'space-2' } } }],
  promotion: null,
  ingredients: [
    { ingredientId: `ing-${i}`, numberOfUnits: 2, unitCost: new Prisma.Decimal('0.5'), ingredient: { id: `ing-${i}`, name: 'Sirop' } },
  ],
  spaceLinks: [
    { spaceId: 'space-1', priceTtc: new Prisma.Decimal('15'), vatRate: new Prisma.Decimal('0.2'), discountType: null, discountValue: null },
  ],
});
const FIXTURE = Array.from({ length: 25 }, (_, i) => makeItem(i + 1));

function createFakeRedis() {
  const store = new Map<string, string>();
  const client = {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    setex: jest.fn(async (k: string, _ttl: number, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    del: jest.fn(),
    keys: jest.fn(async () => []),
    quit: jest.fn(),
  };
  return { store, client, service: new RedisService(client as any) };
}

function setup() {
  const redis = createFakeRedis();
  const prisma = {
    menuItem: {
      findMany: jest.fn(async () => FIXTURE),
      count: jest.fn(async () => FIXTURE.length),
    },
  };
  const pricing = {
    getTenantDefaultVatRate: jest.fn(async () => VAT),
    computePricing: () => ({ priceTtc: 15, marginPct: 0.4 }),
    computeSpacePricing: () => ({ 'space-1': { priceTtc: 15 } }),
  };
  const spaceAccess = { getAccessibleSpaceIds: jest.fn(async () => 'ALL') };
  const services = createMenuItemsServices({ prisma, redis: redis.service, pricing, spaceAccess });
  return { redis, prisma, services };
}

/** Réponse que renvoyait l'ancien code : l'objet { data, meta } sérialisé par Fastify. */
function legacyBody(services: ReturnType<typeof setup>['services']) {
  return {
    data: FIXTURE.map((i) => services.menuItemSupportService.serializeItem(i, VAT)),
    meta: { total: FIXTURE.length, page: 1, limit: 100, totalPages: 1 },
  };
}

const withoutDate = (headers: Record<string, unknown>) => {
  const { date: _date, ...rest } = headers;
  return rest;
};

describe('GET /menu-items : liste servie en JSON brut depuis Redis', () => {
  beforeAll(() => Logger.overrideLogger(false));

  describe('MenuItemQueryService.findAllJson', () => {
    it('miss : renvoie JSON.stringify({ data, meta }) et l\'écrit tel quel sous la même clé, avec le même TTL', async () => {
      const { redis, prisma, services } = setup();

      const json = await services.menuItemQueryService.findAllJson(TENANT);

      expect(json).toBe(JSON.stringify(legacyBody(services)));
      expect(prisma.menuItem.findMany).toHaveBeenCalledTimes(1);
      expect(redis.client.setex).toHaveBeenCalledWith(KEY_A, 3600, json);
      expect(redis.store.get(KEY_A)).toBe(json);
    });

    it('hit : renvoie la chaîne du cache sans JSON.parse ni JSON.stringify, sans requête SQL', async () => {
      const { prisma, services } = setup();
      const first = await services.menuItemQueryService.findAllJson(TENANT);
      prisma.menuItem.findMany.mockClear();
      prisma.menuItem.count.mockClear();

      const parse = jest.spyOn(JSON, 'parse');
      const stringify = jest.spyOn(JSON, 'stringify');
      let second: string;
      try {
        second = await services.menuItemQueryService.findAllJson(TENANT);
        expect(parse).not.toHaveBeenCalled();
        expect(stringify).not.toHaveBeenCalled();
      } finally {
        parse.mockRestore();
        stringify.mockRestore();
      }

      expect(prisma.menuItem.findMany).not.toHaveBeenCalled();
      expect(prisma.menuItem.count).not.toHaveBeenCalled();
      expect(second).toBe(first);
      // C'est exactement ce que l'ancien chemin envoyait (parse puis stringify du cache).
      expect(second).toBe(JSON.stringify(JSON.parse(second)));
    });

    it('lit une entrée écrite par l\'ancien code (RedisService.set / getOrSet), même format', async () => {
      const { redis, prisma, services } = setup();
      const body = legacyBody(services);
      await redis.service.set(`menu-items:${TENANT}:list:1:100:all:::::`, body, { ttl: 3600 });

      const json = await services.menuItemQueryService.findAllJson(TENANT);

      expect(json).toBe(JSON.stringify(body));
      expect(prisma.menuItem.findMany).not.toHaveBeenCalled();
    });

    it('la clé reste scopée par tenant : un autre tenant ne reçoit jamais la liste en cache', async () => {
      const { redis, prisma, services } = setup();
      await services.menuItemQueryService.findAllJson(TENANT);
      expect(prisma.menuItem.findMany).toHaveBeenCalledTimes(1);

      await services.menuItemQueryService.findAllJson(OTHER_TENANT);

      expect(prisma.menuItem.findMany).toHaveBeenCalledTimes(2);
      expect([...redis.store.keys()].sort()).toEqual(
        [KEY_A, `datafriday:menu-items:${OTHER_TENANT}:list:1:100:all:::::`].sort(),
      );
    });

    it('miss simultanés : un seul calcul partagé (single-flight)', async () => {
      const { prisma, services } = setup();

      const [a, b, c] = await Promise.all([
        services.menuItemQueryService.findAllJson(TENANT),
        services.menuItemQueryService.findAllJson(TENANT),
        services.menuItemQueryService.findAllJson(TENANT),
      ]);

      expect(prisma.menuItem.findMany).toHaveBeenCalledTimes(1);
      expect(b).toBe(a);
      expect(c).toBe(a);
    });

    it('erreur au calcul : propagée, rien n\'est mis en cache, le prochain appel réessaie', async () => {
      const { redis, prisma, services } = setup();
      prisma.menuItem.findMany.mockRejectedValueOnce(new Error('db down'));

      await expect(services.menuItemQueryService.findAllJson(TENANT)).rejects.toThrow('db down');
      expect(redis.store.size).toBe(0);

      await expect(services.menuItemQueryService.findAllJson(TENANT)).resolves.toBe(JSON.stringify(legacyBody(services)));
    });
  });

  describe('réponse HTTP (Fastify + compression, comme main.ts)', () => {
    let app: NestFastifyApplication;
    let newSide: ReturnType<typeof setup>;
    let legacySide: ReturnType<typeof setup>;

    beforeAll(async () => {
      newSide = setup();
      legacySide = setup();
      const s = newSide.services;

      // Ancien chemin reconstitué : getOrSet (parse du cache) puis objet rendu par Fastify.
      @Controller('legacy-menu-items')
      class LegacyMenuItemsController {
        @Get()
        list() {
          return legacySide.redis.service.getOrSet(
            `menu-items:${TENANT}:list:1:100:all:::::`,
            async () => legacyBody(legacySide.services),
            { ttl: 3600 },
          );
        }
      }

      const moduleRef = await Test.createTestingModule({
        controllers: [MenuItemsController, LegacyMenuItemsController],
        providers: [
          { provide: MenuItemCompositionService, useValue: s.menuItemCompositionService },
          { provide: MenuItemCostService, useValue: s.menuItemCostService },
          { provide: MenuItemRecipeService, useValue: s.menuItemRecipeService },
          { provide: MenuItemWeezeventPriceService, useValue: s.menuItemWeezeventPriceService },
          { provide: ProductTaxonomyService, useValue: s.productTaxonomyService },
          { provide: MenuItemBulkCreateService, useValue: s.menuItemBulkCreateService },
          { provide: MenuItemCommandService, useValue: s.menuItemCommandService },
          { provide: MenuItemQueryService, useValue: s.menuItemQueryService },
        ],
      })
        .overrideGuard(JwtDatabaseGuard)
        .useValue({ canActivate: () => true })
        .compile();

      app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
      await app.register(fastifyCompress as any, { threshold: 1024, encodings: ['gzip', 'deflate', 'br'] });
      app.useGlobalPipes(createGlobalValidationPipe());
      app.getHttpAdapter().getInstance().addHook('onRequest', async (req: any) => {
        req.user = { id: 'user-1', tenantId: TENANT, isSuperAdmin: false, isOwner: true, allSpacesAccess: true };
      });
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
      await app.close();
    });

    const get = (url: string, acceptEncoding: string) =>
      app.inject({ method: 'GET', url, headers: { 'accept-encoding': acceptEncoding } });

    it.each([['identity'], ['gzip']])(
      'miss puis hit : mêmes octets et mêmes en-têtes que l\'ancien chemin (accept-encoding: %s)',
      async (acceptEncoding) => {
        newSide.redis.store.clear();
        legacySide.redis.store.clear();
        newSide.prisma.menuItem.findMany.mockClear();

        const newMiss = await get('/menu-items', acceptEncoding);
        const newHit = await get('/menu-items', acceptEncoding);
        const legacyMiss = await get('/legacy-menu-items', acceptEncoding);
        const legacyHit = await get('/legacy-menu-items', acceptEncoding);

        for (const res of [newMiss, newHit, legacyMiss, legacyHit]) {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
        }
        // Le corps décompressé est le JSON attendu, identique sur les quatre réponses.
        const expectedPayload = JSON.stringify(legacyBody(newSide.services));
        const body = (res: typeof newMiss) =>
          acceptEncoding === 'gzip' ? gunzipSync(res.rawPayload).toString('utf8') : res.payload;
        expect(body(newMiss) === expectedPayload).toBe(true);
        expect(body(newHit) === expectedPayload).toBe(true);
        expect(body(legacyMiss) === expectedPayload).toBe(true);
        expect(body(legacyHit) === expectedPayload).toBe(true);
        // Octets réellement envoyés (gzip compris) et en-têtes (hors Date) identiques.
        expect(newMiss.rawPayload.equals(legacyMiss.rawPayload)).toBe(true);
        expect(newHit.rawPayload.equals(legacyHit.rawPayload)).toBe(true);
        expect(newHit.rawPayload.equals(newMiss.rawPayload)).toBe(true);
        expect(withoutDate(newMiss.headers)).toEqual(withoutDate(legacyMiss.headers));
        expect(withoutDate(newHit.headers)).toEqual(withoutDate(legacyHit.headers));
        expect(withoutDate(newHit.headers)).toEqual(withoutDate(newMiss.headers));
        if (acceptEncoding === 'gzip') {
          expect(newHit.headers['content-encoding']).toBe('gzip');
        }
        // Le second appel est bien servi par le cache (une seule lecture SQL pour les deux).
        expect(newSide.prisma.menuItem.findMany).toHaveBeenCalledTimes(1);
      },
    );
  });
});
