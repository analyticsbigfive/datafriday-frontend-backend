import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';
import { QuerySpaceDto } from './dto/query-space.dto';
import { WeezeventClientService } from '../weezevent/services/weezevent-client.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { CurrentUserData } from '../../core/auth/decorators/current-user.decorator';
import { SupabaseStorageService } from '../../core/supabase/supabase-storage.service';
import { LogisticsService } from '../logistics/logistics.service';
import { resolveEventTransactionWindow } from '../../shared/utils/event-window.util';
// BUG-146-01 : mêmes marges portes→fin que l'agrégation (resolveEventWindow) — la fenêtre
// de l'Analyse doit être identique à celle qui a écrit les agrégats, sinon les deux
// pages divergent à nouveau.
import { Semaphore } from '../../shared/utils/semaphore';
import { eventBatchCachePatterns } from '../../shared/constants/event-batch-cache';

/**
 * Nom de la configuration interne auto-générée par le backend lors de l'import Weezevent.
 * Elle est désormais discriminée par `Config.isSystem = true` ; ce nom reste utilisé en
 * fallback de compatibilité pour les configs créées avant la migration `isSystem`.
 */
export const WEEZEVENT_IMPORT_CONFIG_NAME = 'Weezevent Import';

@Injectable()
export class SpacesService {
  private readonly logger = new Logger(SpacesService.name);
  private readonly SPACES_CACHE_TTL = 60; // 60 seconds
  private readonly SPACE_DETAIL_CACHE_TTL = 120; // 2 minutes for individual space
  private readonly SPACE_SHOPS_CACHE_TTL = 30; // 30 seconds — lecture chaude pour SpaceMenuView
  private readonly SPACE_CONFIGS_CACHE_TTL = 30;
  private readonly SPACES_LIST_CACHE_KEY = (tenantId: string) =>
    `spaces:list:${tenantId}`;
  private readonly SPACES_LIGHT_CACHE_KEY = (tenantId: string) =>
    `spaces:light:${tenantId}`;
  private readonly SPACE_DETAIL_CACHE_KEY = (spaceId: string) =>
    `spaces:detail:${spaceId}`;
  // Clé composite tenantId+spaceId : une entrée en cache ne peut être lue que par le
  // tenant qui l'a écrite, ce qui préserve l'isolation multi-tenant même en cas de hit
  // (pas besoin de revérifier l'ownership DB sur un hit — cf. incident cross-tenant
  // déjà documenté sur /tenants, on ne veut pas répéter ce pattern de fuite).
  private readonly SPACE_SHOPS_CACHE_KEY = (tenantId: string, spaceId: string) =>
    `spaces:shops:${tenantId}:${spaceId}`;
  private readonly SPACE_CONFIGS_CACHE_KEY = (tenantId: string, spaceId: string) =>
    `spaces:configs:${tenantId}:${spaceId}`;
  // RPC get_space_shop_details ≈ 300ms à elle seule (cf. commentaire getShopDetails) et
  // sur le chemin critique du premier rendu /analyse (phase 1 de useSpaceData) — cachée
  // 60s. Données alimentées par sync/agrégation (pas d'écriture utilisateur directe),
  // invalidées avec les autres clés spaces:* dans invalidateSpaceCache.
  private readonly SPACE_SHOPDETAILS_CACHE_TTL = 60;
  private readonly SPACE_SHOPDETAILS_CACHE_KEY = (tenantId: string, spaceId: string) =>
    `spaces:shopdetails:${tenantId}:${spaceId}`;
  // BUG-143-01 : les endpoints batch de l'Analyse (event-timeline, transaction-baskets)
  // relisaient la pré-agrégat + le JOIN d'affichage à CHAQUE chargement de page — 7 à 27 s
  // par paquet de 15 events sur Stade Jean Bouin (275k lignes d'agrégat) — alors que
  // l'historique d'un event PASSÉ est immuable. Cache par (tenant, space, event) : TTL long
  // quand la fenêtre de ventes de l'event est terminée, court sinon (event du jour : le
  // module Live re-poll toutes les 15 s et doit voir les ventes fraîches).
  // analyse-unmapped N'EST PAS caché (BUG-137-01 : un re-mapping doit se voir au prochain
  // chargement). Invalidation : invalidateSpaceCache + fin de re-agrégation (voir
  // EVENT_BATCH_CACHE_PREFIXES, purgé aussi par AggregationService.executeProcessEvents).
  private readonly EVENT_TIMELINE_CACHE_KEY = (tenantId: string, spaceId: string, eventId: string) =>
    `spaces:evtimeline:${tenantId}:${spaceId}:${eventId}`;
  private readonly EVENT_BASKETS_CACHE_KEY = (tenantId: string, spaceId: string, eventId: string) =>
    `spaces:baskets:${tenantId}:${spaceId}:${eventId}`;
  private readonly EVENT_BATCH_CACHE_TTL_PAST = 6 * 3600; // 6 h — event terminé, données immuables
  private readonly EVENT_BATCH_CACHE_TTL_LIVE = 60; // event du jour/futur ou sans fenêtre résolue
  // BUG-144-01 : volume non mappé, caché comme les deux autres depuis le 25/08 — REMPLACE
  // la décision BUG-137-01 (« jamais caché ») : l'invalidation à l'écriture de mapping
  // (MappingsService) garantit qu'un re-mapping se voit au chargement suivant, sans payer
  // le re-scan brut des 786k lignes à CHAQUE visite.
  private readonly EVENT_UNMAPPED_CACHE_KEY = (tenantId: string, spaceId: string, eventId: string) =>
    `spaces:unmapped:${tenantId}:${spaceId}:${eventId}`;
  // BUG-144-01 : entrées STABLES de resolveEventSalesScope (events de l'espace, intégrations,
  // timezone) — recalculées à chaque appel batch alors qu'elles ne varient pas par event.
  private readonly SPACE_SALESSCOPE_CACHE_KEY = (tenantId: string, spaceId: string) =>
    `spaces:salesscope:${tenantId}:${spaceId}`;
  private readonly SPACE_SALESSCOPE_CACHE_TTL = 60;
  // BUG-144-01 : borne de concurrence de la section SQL des 3 endpoints batch Analyse —
  // 2 requêtes lourdes en parallèle, 32 en file, 60 s d'attente max → 503 explicite.
  // Les hits cache Redis ne passent PAS par cette file.
  private readonly analyseBatchSemaphore = new Semaphore(2, 32, 60_000, 'analyse-batch');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly weezeventClient: WeezeventClientService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly storage: SupabaseStorageService,
    private readonly logisticsService: LogisticsService,
  ) {}

  /**
   * Périmètre d'espaces de l'utilisateur pour le filtrage des LISTES.
   * Retourne `null` = accès complet (aucun filtre, cache tenant-wide autorisé),
   * sinon la liste des spaceId accessibles (cache tenant-wide à NE PAS utiliser).
   */
  private async restrictedSpaceIds(
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>,
  ): Promise<string[] | null> {
    const ids = await this.spaceAccess.getAccessibleSpaceIds(user);
    return ids === 'ALL' ? null : ids;
  }

  /**
   * Lève 403 si `user` n'a pas accès à cet espace — pour les endpoints qui identifient
   * l'espace via un id de sous-ressource (configId, elementId…) et échappent donc au
   * SpaceAccessGuard global (qui ne connaît que les params `spaceId`/`id` déclarés).
   */
  private async assertSpaceAccess(
    spaceId: string | null | undefined,
    user?: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>,
  ) {
    if (!user || !spaceId) return;
    if (this.spaceAccess.hasFullAccess(user)) return;
    const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
    if (accessible === 'ALL' || accessible.includes(spaceId)) return;
    throw new ForbiddenException("Vous n'avez pas accès à cet espace.");
  }

  /** Invalidate all space list caches for a tenant (public : réutilisé par BuilderV2Service) */
  async invalidateSpaceCache(tenantId: string, spaceId?: string) {
    const keys = [
      this.redis.delete(this.SPACES_LIST_CACHE_KEY(tenantId)),
      this.redis.delete(this.SPACES_LIGHT_CACHE_KEY(tenantId)),
    ];
    if (spaceId) {
      keys.push(this.redis.delete(this.SPACE_DETAIL_CACHE_KEY(spaceId)));
      // deletePattern car getSpaceShops écrit aussi des clés suffixées ":${configId}"
      // (scoping par configuration) en plus de la clé "toutes configs".
      keys.push(this.redis.deletePattern(`${this.SPACE_SHOPS_CACHE_KEY(tenantId, spaceId)}*`) as unknown as Promise<void>);
      keys.push(this.redis.delete(this.SPACE_CONFIGS_CACHE_KEY(tenantId, spaceId)));
      keys.push(this.redis.delete(this.SPACE_SHOPIDS_CACHE_KEY(tenantId, spaceId)));
      // deletePattern : getShopDetails écrit des clés suffixées ":page:limit:granular"
      keys.push(this.redis.deletePattern(`${this.SPACE_SHOPDETAILS_CACHE_KEY(tenantId, spaceId)}*`) as unknown as Promise<void>);
      // BUG-143-01 : caches par event des endpoints batch Analyse (clés suffixées ":eventId").
      // Motifs partagés avec AggregationService.executeProcessEvents (fin de re-agrégation).
      for (const pattern of eventBatchCachePatterns(tenantId, spaceId)) {
        keys.push(this.redis.deletePattern(pattern) as unknown as Promise<void>);
      }
      // BUG-144-01 : entrées stables de resolveEventSalesScope.
      keys.push(this.redis.delete(this.SPACE_SALESSCOPE_CACHE_KEY(tenantId, spaceId)));
    }
    await Promise.all(keys);
  }

  /**
   * Create a new space for a tenant
   */
  async create(tenantId: string, dto: CreateSpaceDto) {
    const image = await this.storage.resolveImage(dto.image, 'spaces');
    const space = await this.prisma.space.create({
      data: {
        tenantId,
        // Basic Information
        name: dto.name,
        image,
        // Space Details
        spaceType: dto.spaceType,
        spaceTypeOther: dto.spaceTypeOther,
        maxCapacity: dto.maxCapacity,
        department: dto.department,
        homeTeam: dto.homeTeam,
        // Address
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        postcode: dto.postcode,
        country: dto.country,
        // Contact Information
        tel: dto.tel,
        email: dto.email,
        // Main Contact Person
        mainContactPerson: dto.mainContactPerson,
        contactEmail: dto.contactEmail,
        contactTel: dto.contactTel,
        // Social Media
        instagram: dto.instagram,
        tiktok: dto.tiktok,
        facebook: dto.facebook,
        twitter: dto.twitter,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    await this.invalidateSpaceCache(tenantId);
    return space;
  }

  /**
   * CA (total/F&B/merch), transactions et billets par espace — calculé à la volée depuis les
   * agrégats réels (SpaceRevenueMinuteAgg, corrigé BUG-014/015) et Event, pas depuis les
   * colonnes Space.avgEvent/avgTransaction/perCapita/cachedMetrics qui ne sont jamais écrites.
   * Classification F&B/merch réutilise la convention déjà en place ailleurs (StorageShopsSection.vue,
   * space-menus.service.ts:843) : isMerch = SpaceElement.type === 'merchshop'.
   * Formules avgTransaction/avgEvent/perCapita alignées sur useMetricsCalculator.js (moteur Analyse).
   */
  private async getRevenueSummaries(tenantId: string, spaceIds: string[]) {
    const summaries = new Map<string, {
      totalRevenue: number;
      fbRevenue: number;
      merchRevenue: number;
      ticketingCount: number;
      avgTransaction: number;
      avgEvent: number;
      perCapita: number;
    }>();
    if (spaceIds.length === 0) return summaries;

    const [revenueRows, ticketRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{
        spaceId: string;
        totalRevenue: number;
        merchRevenue: number;
        fbRevenue: number;
        transactionsCount: number;
        eventsWithRevenue: number;
      }>>(Prisma.sql`
        SELECT sra."spaceId",
          SUM(sra."revenueHt")::float AS "totalRevenue",
          SUM(CASE WHEN se."type" = 'merchshop' THEN sra."revenueHt" ELSE 0 END)::float AS "merchRevenue",
          SUM(CASE WHEN se."type" IS DISTINCT FROM 'merchshop' THEN sra."revenueHt" ELSE 0 END)::float AS "fbRevenue",
          SUM(sra."transactionsCount")::int AS "transactionsCount",
          COUNT(DISTINCT CASE WHEN sra."revenueHt" > 0 THEN sra."weezeventEventId" END)::int AS "eventsWithRevenue"
        FROM "SpaceRevenueMinuteAgg" sra
        LEFT JOIN "SpaceElement" se ON se.id = sra."spaceElementId"
        WHERE sra."tenantId" = ${tenantId} AND sra."spaceId" IN (${Prisma.join(spaceIds)})
        GROUP BY sra."spaceId"
      `),
      this.prisma.$queryRaw<Array<{ spaceId: string; ticketsCount: number }>>(Prisma.sql`
        SELECT "spaceId", SUM(COALESCE("ticketsScanned", "ticketsSold", 0))::int AS "ticketsCount"
        FROM "Event"
        WHERE "tenantId" = ${tenantId} AND "spaceId" IN (${Prisma.join(spaceIds)})
        GROUP BY "spaceId"
      `),
    ]);

    const ticketsBySpace = new Map(ticketRows.map((r) => [r.spaceId, Number(r.ticketsCount) || 0]));

    for (const row of revenueRows) {
      const totalRevenue = Number(row.totalRevenue) || 0;
      const transactionsCount = Number(row.transactionsCount) || 0;
      const eventsWithRevenue = Number(row.eventsWithRevenue) || 0;
      const ticketsCount = ticketsBySpace.get(row.spaceId) ?? 0;

      summaries.set(row.spaceId, {
        totalRevenue,
        fbRevenue: Number(row.fbRevenue) || 0,
        merchRevenue: Number(row.merchRevenue) || 0,
        ticketingCount: ticketsCount,
        avgTransaction: transactionsCount > 0 ? totalRevenue / transactionsCount : 0,
        avgEvent: eventsWithRevenue > 0 ? totalRevenue / eventsWithRevenue : 0,
        perCapita: ticketsCount > 0 ? totalRevenue / ticketsCount : 0,
      });
    }

    return summaries;
  }

  /**
   * Find all spaces for a tenant with pagination (Redis-cached, TTL 60s).
   * Cache is bypassed when a search filter is applied.
   */
  async findAll(tenantId: string, query: QuerySpaceDto, user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>) {
    const { search, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    // Périmètre espaces : null = accès complet ; sinon liste restreinte.
    const accessibleIds = await this.restrictedSpaceIds(user);

    // Cache tenant-wide réservé aux utilisateurs à accès complet (sinon fuite d'espaces
    // non autorisés à un user restreint).
    const isCacheable = !search && page === 1 && limit === 10 && accessibleIds === null;
    if (isCacheable) {
      const cached = await this.redis.get<any>(this.SPACES_LIST_CACHE_KEY(tenantId));
      if (cached) return cached;
    }

    const where: any = {
      tenantId,
    };

    if (accessibleIds !== null) {
      where.id = { in: accessibleIds };
    }

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const [spaces, total] = await Promise.all([
      this.prisma.space.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          name: true,
          image: true,
          tenantId: true,
          createdAt: true,
          updatedAt: true,
          tel: true,
          email: true,
          contactTel: true,
          contactEmail: true,
          mainContactPerson: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          postcode: true,
          department: true,
          country: true,
          spaceType: true,
          spaceTypeOther: true,
          maxCapacity: true,
          homeTeam: true,
          facebook: true,
          instagram: true,
          twitter: true,
          tiktok: true,
          _count: {
            select: {
              configs: true,
              pinnedByUsers: true,
            },
          },
        },
      }),
      this.prisma.space.count({ where }),
    ]);

    const revenueSummaries = await this.getRevenueSummaries(tenantId, spaces.map((s) => s.id));
    const spacesWithMetrics = spaces.map((s) => ({
      ...s,
      ...(revenueSummaries.get(s.id) ?? {
        totalRevenue: 0,
        fbRevenue: 0,
        merchRevenue: 0,
        ticketingCount: 0,
        avgTransaction: 0,
        avgEvent: 0,
        perCapita: 0,
      }),
    }));

    const result = {
      data: spacesWithMetrics,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    if (isCacheable) {
      await this.redis.set(this.SPACES_LIST_CACHE_KEY(tenantId), result, {
        ttl: this.SPACES_CACHE_TTL,
      });
    }

    return result;
  }

  /**
   * Lightweight space list for selects/wizards — only id + name.
   * Redis-cached (TTL 60s). ~10x faster than findAll.
   */
  async getSpacesLight(
    tenantId: string,
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>,
  ): Promise<{ id: string; name: string }[]> {
    const accessibleIds = await this.restrictedSpaceIds(user);
    const cacheKey = this.SPACES_LIGHT_CACHE_KEY(tenantId);

    // Cache tenant-wide réservé aux accès complets.
    if (accessibleIds === null) {
      const cached = await this.redis.get<{ id: string; name: string }[]>(cacheKey);
      if (cached) return cached;
    }

    const where: any = { tenantId };
    if (accessibleIds !== null) where.id = { in: accessibleIds };

    const spaces = await this.prisma.space.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    if (accessibleIds === null) {
      await this.redis.set(cacheKey, spaces, { ttl: this.SPACES_CACHE_TTL });
    }
    return spaces;
  }

  /**
   * Find one space by ID
   */
  async findOne(id: string, tenantId: string) {
    const cacheKey = this.SPACE_DETAIL_CACHE_KEY(id);
    const cached = await this.redis.get<any>(cacheKey);
    if (cached && cached.tenantId === tenantId) return cached;

    const space = await this.prisma.space.findFirst({
      where: {
        id,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        image: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true,
        tel: true,
        email: true,
        contactTel: true,
        contactEmail: true,
        mainContactPerson: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        postcode: true,
        department: true,
        country: true,
        spaceType: true,
        spaceTypeOther: true,
        maxCapacity: true,
        homeTeam: true,
        facebook: true,
        instagram: true,
        twitter: true,
        tiktok: true,
        avgEvent: true,
        avgTransaction: true,
        perCapita: true,
        cachedMetrics: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        configs: {
          select: {
            id: true,
            name: true,
            spaceId: true,
            capacity: true,
            isSystem: true,
            data: true,  // Include full configuration data (floors, forecourt, externalMerch)
            createdAt: true,
            updatedAt: true,
          },
          // configs utilisateur d'abord (isSystem=false), puis par ancienneté, afin que
          // l'import interne "Weezevent Import" ne soit jamais sélectionné par défaut.
          orderBy: [
            { isSystem: 'asc' },
            { createdAt: 'asc' },
          ],
        },
        _count: {
          select: {
            pinnedByUsers: true,
            userAccess: true,
          },
        },
      },
    });

    if (!space) {
      throw new NotFoundException(`Space with ID ${id} not found`);
    }

    // Builder v2 : injecter les éléments des Zones dans configs[].data (lecture seule)
    // pour les consommateurs du JSON v1 (SpacesPage, EventPredict…).
    if (space.configs?.length) {
      const zoneElements = await this.fetchZoneElementsForSpace(id);
      if (zoneElements.length > 0) {
        (space as any).configs = space.configs.map((c: any) => ({
          ...c,
          data: this.mergeZoneElementsIntoConfigData(c.data, zoneElements, c.id),
        }));
      }
    }

    // Cache the result to skip 3 round-trips on subsequent loads (TTL 2 min)
    await this.redis.set(cacheKey, space, { ttl: this.SPACE_DETAIL_CACHE_TTL });

    return space;
  }

  /**
   * Update a space
   */
  async update(id: string, tenantId: string, dto: UpdateSpaceDto) {
    // Verify space exists and belongs to tenant
    await this.findOne(id, tenantId);

    const image = await this.storage.resolveImage(dto.image, 'spaces');
    const space = await this.prisma.space.update({
      where: { id },
      data: {
        // Basic Information
        name: dto.name,
        image,
        // Space Details
        spaceType: dto.spaceType,
        spaceTypeOther: dto.spaceTypeOther,
        maxCapacity: dto.maxCapacity,
        department: dto.department,
        homeTeam: dto.homeTeam,
        // Address
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        postcode: dto.postcode,
        country: dto.country,
        // Contact Information
        tel: dto.tel,
        email: dto.email,
        // Main Contact Person
        mainContactPerson: dto.mainContactPerson,
        contactEmail: dto.contactEmail,
        contactTel: dto.contactTel,
        // Social Media
        instagram: dto.instagram,
        tiktok: dto.tiktok,
        facebook: dto.facebook,
        twitter: dto.twitter,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    await this.invalidateSpaceCache(tenantId, id);
    return space;
  }

  /**
   * Delete a space
   */
  async remove(id: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(id, tenantId);

    await this.prisma.space.delete({
      where: { id },
    });

    await this.invalidateSpaceCache(tenantId, id);
    return {
      message: 'Space deleted successfully',
    };
  }

  /**
   * Pin a space for a user
   */
  async pin(spaceId: string, userId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    // Check if already pinned
    const existing = await this.prisma.userPinnedSpace.findUnique({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    if (existing) {
      return {
        message: 'Space already pinned',
        pinned: existing,
      };
    }

    const pinned = await this.prisma.userPinnedSpace.create({
      data: {
        userId,
        spaceId,
      },
      include: {
        space: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    return {
      message: 'Space pinned successfully',
      pinned,
    };
  }

  /**
   * Unpin a space for a user
   */
  async unpin(spaceId: string, userId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    const existing = await this.prisma.userPinnedSpace.findUnique({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Space is not pinned');
    }

    await this.prisma.userPinnedSpace.delete({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    return {
      message: 'Space unpinned successfully',
    };
  }

  /**
   * Get pinned spaces for a user
   */
  async getPinned(
    userId: string,
    tenantId: string,
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>,
  ) {
    const accessibleIds = await this.restrictedSpaceIds(user);
    const spaceWhere: any = { tenantId };
    if (accessibleIds !== null) spaceWhere.id = { in: accessibleIds };

    const pinned = await this.prisma.userPinnedSpace.findMany({
      where: {
        userId,
        space: spaceWhere,
      },
      include: {
        space: {
          include: {
            _count: {
              select: {
                configs: true,
              },
            },
          },
        },
      },
      orderBy: {
        pinnedAt: 'desc',
      },
    });

    return pinned.map((p) => p.space);
  }

  /**
   * Grant user access to a space
   */
  async grantAccess(
    spaceId: string,
    userId: string,
    role: 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER',
    tenantId: string,
  ) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    // Verify user belongs to same tenant
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found in this tenant');
    }

    // Check if access already exists
    const existing = await this.prisma.userSpaceAccess.findUnique({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    if (existing) {
      // Update role if different
      if (existing.role !== role) {
        return await this.prisma.userSpaceAccess.update({
          where: {
            userId_spaceId: {
              userId,
              spaceId,
            },
          },
          data: { role },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            space: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });
      }
      return existing;
    }

    const access = await this.prisma.userSpaceAccess.create({
      data: {
        userId,
        spaceId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        space: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return access;
  }

  /**
   * Revoke user access to a space
   */
  async revokeAccess(spaceId: string, userId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    const existing = await this.prisma.userSpaceAccess.findUnique({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('User access not found');
    }

    await this.prisma.userSpaceAccess.delete({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    return {
      message: 'Access revoked successfully',
    };
  }

  /**
   * Get users with access to a space
   */
  async getSpaceUsers(spaceId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    const users = await this.prisma.userSpaceAccess.findMany({
      where: {
        spaceId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: {
        grantedAt: 'desc',
      },
    });

    return users;
  }

  /**
   * Get space statistics
   */
  async getStatistics(tenantId: string) {
    const [totalSpaces, totalConfigs, recentSpaces] = await Promise.all([
      this.prisma.space.count({
        where: { tenantId },
      }),
      this.prisma.config.count({
        where: {
          space: {
            tenantId,
          },
        },
      }),
      this.prisma.space.findMany({
        where: { tenantId },
        take: 5,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          name: true,
          image: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      totalSpaces,
      totalConfigs,
      recentSpaces,
    };
  }

  /**
   * Update space image
   */
  async updateImage(id: string, tenantId: string, image: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(id, tenantId);

    const resolvedImage = await this.storage.resolveImage(image, 'spaces');
    const space = await this.prisma.space.update({
      where: { id },
      data: { image: resolvedImage },
      select: {
        id: true,
        name: true,
        image: true,
        updatedAt: true,
      },
    });

    return space;
  }

  /**
   * Get configurations for a space (optimized - no double verification)
   */
  async getConfigurations(spaceId: string, tenantId: string) {
    // Cache court (30s) : chaque round-trip Postgres coûte ~1s de latence réseau
    // (mesuré) — la clé inclut tenantId, donc un hit ne peut provenir que du même
    // tenant qui l'a écrit (isolation préservée même en cas de hit).
    const cacheKey = this.SPACE_CONFIGS_CACHE_KEY(tenantId, spaceId);
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    // Direct query with tenant verification in the join
    const configurations = await this.prisma.config.findMany({
      where: {
        spaceId,
        space: {
          tenantId, // Verify tenant access directly in query
        },
      },
      // Configs utilisateur (isSystem=false) d'abord, puis par ancienneté : la
      // config par défaut sélectionnée côté builder (configs[0]) est donc toujours
      // une config utilisateur, jamais l'import interne « Weezevent Import ».
      orderBy: [
        { isSystem: 'asc' },
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        capacity: true,
        isSystem: true,
        createdAt: true,
        updatedAt: true,
        // Don't include full data here - it's loaded separately when needed
        _count: {
          select: {
            floors: true,
            stations: true,
          },
        },
      },
    });

    await this.redis.set(cacheKey, configurations, { ttl: this.SPACE_CONFIGS_CACHE_TTL });
    return configurations;
  }

  /**
   * Get shop list only (no transaction data) — used by SpaceMenuView for fast initial load.
   *
   * 1 SEUL round-trip Postgres (au lieu de 3 séquentiels : espace+configs → shops → mappings)
   * via une requête brute unique (CTE + UNION ALL + json_agg). Chaque round-trip vers le
   * pooler Supabase coûte ~1-2s de latence réseau (mesuré) : sur ce endpoint, 3 étapes
   * séquentielles dominaient totalement le temps de réponse (~5-7s) alors que le volume de
   * données est minuscule (quelques shops). Le UNION ALL de 3 branches dédiées (floor /
   * forecourt / externalMerch), chacune filtrée sur SA propre FK, préserve le plan de requête
   * rapide déjà mesuré par ailleurs (cf. historique : un simple LEFT JOIN avec OR sur les 3
   * relations était ~65% plus lent côté Postgres que 3 requêtes séparées) — on obtient donc
   * le même plan d'exécution, mais en 1 aller-retour réseau au lieu de 3.
   */
  async getSpaceShops(spaceId: string, tenantId: string, configId?: string) {
    // Cache court (30s) — la clé inclut tenantId, donc un hit ne peut provenir que du même
    // tenant qui l'a écrit (isolation préservée même en cas de hit, sans revérifier
    // l'ownership en DB). configId fait partie de la clé pour ne pas mélanger le
    // cache "toutes configs" avec le cache scopé à une config.
    const cacheKey = configId
      ? `${this.SPACE_SHOPS_CACHE_KEY(tenantId, spaceId)}:${configId}`
      : this.SPACE_SHOPS_CACHE_KEY(tenantId, spaceId);
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const shopTypes = ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'];
    const configFilter = configId ? Prisma.sql`AND c.id = ${configId}` : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<Array<{ space_exists: boolean; shops: any }>>(Prisma.sql`
      WITH target_configs AS (
        SELECT c.id, c.name
        FROM "Config" c
        JOIN "Space" sp ON sp.id = c."spaceId" AND sp."tenantId" = ${tenantId}
        WHERE c."spaceId" = ${spaceId}
        ${configFilter}
      ),
      floor_shops AS (
        SELECT se.id, se.name, se.type::text AS type, se."shopTypes", se.attributes, se.image, se.notes,
               f."configId" AS "configId", tc.name AS "configName",
               f.id AS "locationId", f.name AS "locationName", f.level::text AS "floorLevel"
        FROM "SpaceElement" se
        JOIN "Floor" f ON f.id = se."floorId"
        JOIN target_configs tc ON tc.id = f."configId"
        -- zoneId IS NULL : un élément migré en v2 ne sort que par la branche zone_shops
        WHERE se.type::text = ANY(${shopTypes}) AND se."zoneId" IS NULL
      ),
      forecourt_shops AS (
        SELECT se.id, se.name, se.type::text AS type, se."shopTypes", se.attributes, se.image, se.notes,
               fc."configId" AS "configId", tc.name AS "configName",
               fc.id AS "locationId", fc.name AS "locationName", 'forecourt' AS "floorLevel"
        FROM "SpaceElement" se
        JOIN "Forecourt" fc ON fc.id = se."forecourtId"
        JOIN target_configs tc ON tc.id = fc."configId"
        WHERE se.type::text = ANY(${shopTypes}) AND se."zoneId" IS NULL
      ),
      externalmerch_shops AS (
        SELECT se.id, se.name, se.type::text AS type, se."shopTypes", se.attributes, se.image, se.notes,
               em."configId" AS "configId", tc.name AS "configName",
               em.id AS "locationId", em.name AS "locationName", 'externalmerch' AS "floorLevel"
        FROM "SpaceElement" se
        JOIN "ExternalMerch" em ON em.id = se."externalMerchId"
        JOIN target_configs tc ON tc.id = em."configId"
        WHERE se.type::text = ANY(${shopTypes}) AND se."zoneId" IS NULL
      ),
      -- Builder v2 : éléments rattachés à une Zone (par ESPACE). Le scoping par config
      -- passe par les adhésions ConfigurationElement ; sous-types v2 exposés en
      -- "shopTypes" (compat consommateurs). floorLevel : FLOOR → level, sinon la zone.
      --
      -- UNE LIGNE PAR (élément, config), PAS par élément. Un élément v2 est PARTAGÉ entre
      -- configs (créer une config par clonage copie ses adhésions, cf. builder-v2.service
      -- createConfiguration). Un DISTINCT ON (se.id) seul n'émettait qu'une ligne par
      -- élément, taguée de son adhésion la PLUS ANCIENNE (ORDER BY ce."createdAt") : toute
      -- config clonée disparaissait de la réponse « toutes configs », et les consommateurs
      -- qui refiltrent côté client sur configId (EventPredictView, SpaceRestockView)
      -- voyaient 0 point de vente alors que Space Menus — qui passe ?configId= et
      -- court-circuite ce DISTINCT — en listait (BUG-286-01). Le DISTINCT ON est CONSERVÉ
      -- sur le couple, mais c'est un no-op garanti par la PK ConfigurationElement
      -- @@id([configId, elementId]) : au plus une adhésion par (config, élément).
      -- Corollaire : le menuItemsCount du LEFT JOIN LATERAL plus bas (scopé sur
      -- a."configId") devient enfin juste pour CHAQUE config, et plus seulement pour la
      -- plus ancienne.
      zone_shops AS (
        SELECT DISTINCT ON (se.id, ce."configId")
               se.id, se.name, se.type::text AS type,
               CASE WHEN cardinality(se.subtypes) > 0 THEN se.subtypes ELSE se."shopTypes" END AS "shopTypes",
               se.attributes, se.image, se.notes,
               ce."configId" AS "configId", tc.name AS "configName",
               z.id AS "locationId", z.name AS "locationName",
               CASE z.kind::text
                 WHEN 'FLOOR' THEN z.level::text
                 WHEN 'FORECOURT' THEN 'forecourt'
                 ELSE 'externalmerch'
               END AS "floorLevel"
        FROM "SpaceElement" se
        JOIN "Zone" z ON z.id = se."zoneId" AND z."spaceId" = ${spaceId}
        JOIN "ConfigurationElement" ce ON ce."elementId" = se.id
        JOIN target_configs tc ON tc.id = ce."configId"
        WHERE se.type::text = ANY(${shopTypes})
        -- Postgres impose que les expressions du DISTINCT ON soient les premières de
        -- l'ORDER BY, dans le même ordre. Plus de départage sur ce."createdAt" : le
        -- couple (élément, config) est déjà unique.
        ORDER BY se.id, ce."configId"
      ),
      all_shops AS (
        SELECT * FROM floor_shops
        UNION ALL
        SELECT * FROM forecourt_shops
        UNION ALL
        SELECT * FROM externalmerch_shops
        UNION ALL
        SELECT * FROM zone_shops
      ),
      enriched AS (
        -- BUG-320-02 : un "LEFT JOIN WeezeventLocationShopMapping" simple duplique la ligne du
        -- shop quand PLUSIEURS locations (typiquement une par intégration, cas de 2 intégrations
        -- mappées au même space, chacune mappant sa propre location vers le même SpaceElement —
        -- LocationShopMapping.spaceElementId n'a aucune contrainte unique) pointent vers le même
        -- SpaceElement. Sous-requêtes scalaires : au plus UNE ligne par (élément, config), quel
        -- que soit le nombre de mappings pointant vers cet élément. weezeventLocationId/
        -- isMappedToWeezevent ne sont consommés par aucun front connu aujourd'hui (grep exhaustif)
        -- — conservés pour compat, "OR logique" sur isMappedToWeezevent plutôt qu'un pick arbitraire.
        SELECT
          a.*,
          (
            SELECT wm."weezeventLocationId" FROM "WeezeventLocationShopMapping" wm
            WHERE wm."spaceElementId" = a.id AND wm."tenantId" = ${tenantId}
            ORDER BY wm."weezeventLocationId" LIMIT 1
          ) AS "weezeventLocationId",
          EXISTS(
            SELECT 1 FROM "WeezeventLocationShopMapping" wm
            WHERE wm."spaceElementId" = a.id AND wm."tenantId" = ${tenantId}
          ) AS "isMappedToWeezevent",
          COALESCE(ma.cnt, 0) AS "menuItemsCount"
        FROM all_shops a
        LEFT JOIN LATERAL (
          -- Compteur scopé par la config de la ligne : un élément v2 partagé porte une
          -- assignation PAR config — sans ce filtre, le badge sommerait toutes les configs.
          SELECT COUNT(*)::int AS cnt FROM "MenuAssignment" m
          WHERE m."elementId" = a.id AND m.enabled = true AND m."configId" = a."configId"
        ) ma ON true
      )
      SELECT
        EXISTS(SELECT 1 FROM "Space" WHERE id = ${spaceId} AND "tenantId" = ${tenantId}) AS space_exists,
        -- ORDER BY explicite : sans lui, l'ordre des lignes est arbitraire et peut varier
        -- d'une requête à l'autre. Depuis qu'un élément partagé sort une fois PAR config,
        -- un consommateur en premier-arrivé-gagne (ex. StepMapShops, qui affiche le
        -- configName suggéré) verrait sa suggestion changer d'un rechargement à l'autre.
        COALESCE(
          (SELECT json_agg(enriched ORDER BY enriched.id, enriched."configId") FROM enriched),
          '[]'::json
        ) AS shops
    `);

    const row = rows[0];
    if (!row?.space_exists) {
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    }

    const rawShops: any[] = Array.isArray(row.shops) ? row.shops : [];
    const shops = rawShops.map((s: any) => {
      const menuItemsCount = Number(s.menuItemsCount) || 0;
      const floorLevel =
        s.floorLevel === 'forecourt' || s.floorLevel === 'externalmerch'
          ? s.floorLevel
          : s.floorLevel != null ? Number(s.floorLevel) : null;
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        shopTypes: s.shopTypes,
        attributes: s.attributes,
        image: s.image ?? null,
        notes: s.notes ?? null,
        configId: s.configId ?? null,
        configName: s.configName ?? null,
        locationId: s.locationId ?? null,
        locationName: s.locationName ?? null,
        floorLevel,
        weezeventLocationId: s.weezeventLocationId ?? null,
        isMappedToWeezevent: !!s.isMappedToWeezevent,
        menuItemsCount,
        isOpen: menuItemsCount > 0,
      };
    });

    const result = { shops };
    await this.redis.set(cacheKey, result, { ttl: this.SPACE_SHOPS_CACHE_TTL });
    return result;
  }

  /**
   * Get shop details (granular sales data) for a space.
   * Delegates to the Supabase PostgreSQL RPC `get_space_shop_details`,
   * collapsing 8 sequential DB round-trips into a single network call (~2s → ~300ms).
   */
  async getShopDetails(spaceId: string, tenantId: string, page = 1, limit = 20, includeGranular = false) {
    // Cache Redis (60s) : la RPC est le poste dominant du premier rendu /analyse.
    // Une erreur (space_not_found) jette depuis la factory → rien n'est mis en cache.
    return this.redis.getOrSet(
      `${this.SPACE_SHOPDETAILS_CACHE_KEY(tenantId, spaceId)}:${page}:${limit}:${includeGranular ? 1 : 0}`,
      async () => {
        const rows = await this.prisma.$queryRaw<Array<{ get_space_shop_details: any }>>`
          SELECT get_space_shop_details(${spaceId}, ${tenantId}, ${page}::int, ${limit}::int, ${includeGranular}::boolean)
        `;
        const data = rows[0]?.get_space_shop_details;
        if (!data || data.__error === 'space_not_found') {
          throw new NotFoundException(`Space with ID ${spaceId} not found`);
        }
        return data;
      },
      { ttl: this.SPACE_SHOPDETAILS_CACHE_TTL },
    );
  }

  private readonly SPACE_SHOPIDS_CACHE_TTL = 30; // seconds — même durée que SPACE_SHOPS_CACHE_TTL
  private readonly SPACE_SHOPIDS_CACHE_KEY = (tenantId: string, spaceId: string) =>
    `spaces:shopids:${tenantId}:${spaceId}`;

  // CFG-2 Étape 2 : ElementType (enum Postgres) supprimé du typage — SpaceElement.type est
  // désormais un `string` libre (valeur inchangée ici, uniquement l'annotation TS). La
  // réécriture de cette liste elle-même contre `Department` est Étape 3, pas encore faite.
  private readonly EVENT_TIMELINE_SHOP_TYPES: string[] = ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'];

  /**
   * Resolve the shop (SpaceElement) ids attached to a space across all its configs —
   * floors + forecourt (v1) and zones (v2 builder). This does NOT depend on any event,
   * only on the space's current layout, so it's cached and shared across every event
   * timeline lookup for the space instead of being recomputed per event.
   */
  private async resolveShopIdsForSpace(spaceId: string, tenantId: string): Promise<string[]> {
    return this.redis.getOrSet(
      this.SPACE_SHOPIDS_CACHE_KEY(tenantId, spaceId),
      async () => {
        const configs = await this.prisma.config.findMany({
          where: { space: { id: spaceId, tenantId } },
          select: { id: true },
        });
        const configIds = configs.map(c => c.id);
        const [floors, forecourt, zoneShops] = await Promise.all([
          this.prisma.spaceElement.findMany({
            where: { floor: { configId: { in: configIds } }, type: { in: this.EVENT_TIMELINE_SHOP_TYPES } },
            select: { id: true },
          }),
          this.prisma.spaceElement.findMany({
            where: { forecourt: { configId: { in: configIds } }, type: { in: this.EVENT_TIMELINE_SHOP_TYPES } },
            select: { id: true },
          }),
          // Builder v2 : shops rattachés aux Zones de l'espace
          this.prisma.spaceElement.findMany({
            where: { zone: { spaceId }, type: { in: this.EVENT_TIMELINE_SHOP_TYPES } },
            select: { id: true },
          }),
        ]);
        return [...new Set([...floors, ...forecourt, ...zoneShops].map(s => s.id))];
      },
      { ttl: this.SPACE_SHOPIDS_CACHE_TTL },
    );
  }

  /**
   * Get minute-level timeline for one event: minute × shop × menuItem
   * Returns one record per (minute, spaceElementId, weezeventProductId) combination.
   * Thin wrapper around getEventTimelineBatch for callers that still request one event
   * at a time (e.g. EventPredictView) — new call sites should use the batch method.
   */
  async getEventTimeline(spaceId: string, eventId: string, tenantId: string) {
    const batch = await this.getEventTimelineBatch(spaceId, [eventId], tenantId);
    return batch[eventId] ?? [];
  }

  /**
   * Résout, POUR UN ESPACE, tout ce qui ne varie pas d'un event à l'autre : contrôle
   * d'appartenance, fenêtres de dates par event, scope d'intégration et scope PdV.
   * Partagé par `getEventTimelineBatch` et `getTransactionBasketsBatch` — les deux
   * lisent les mêmes tables de ventes sur les mêmes bornes, et un scope qui divergerait
   * entre les deux ferait afficher deux périmètres différents sur le même écran.
   * Renvoie `null` quand il n'y a rien à interroger (aucun PdV, aucune fenêtre résolue).
   */
  private async resolveEventSalesScope(
    spaceId: string,
    uniqueIds: string[],
    tenantId: string,
  ): Promise<{ integrationClause: Prisma.Sql; shopScopeClause: Prisma.Sql; valuesSql: Prisma.Sql; spaceTimezone: string; shopIds: string[]; windows: { id: string; windowStart: Date; windowEnd: Date; tagId: string | null; eventIntegrationId: string | null }[] } | null> {
    // All independent queries run in parallel: ownership check, event dates (tried
    // against both DataFriday Event and WeezeventEvent so the frontend can pass
    // either a DataFriday UUID or a WeezeventEvent CUID), integration scope,
    // shop IDs resolved from plan floors + forecourt, and the space's timezone
    // (used to display transaction hours in venue-local time, see BUG-270) —
    // none of this varies per event.
    // BUG-144-01 : les entrées STABLES (tous les events de l'espace, intégrations,
    // timezone) ne varient pas par event ni par paquet — cachées 60 s
    // (spaces:salesscope:*), purgées par invalidateSpaceCache, TTL court en filet
    // pour les écritures qui n'y passent pas (édition d'event). L'ancien 1er
    // event.findMany (events du batch seul) est SUPPRIMÉ : dérivable de la liste
    // complète, déjà nécessaire à BUG-339-02 (events voisins hors batch).
    // BUG-146-01 : le select porte aussi eventStartDate (même précédence de date que
    // l'agrégation — Montauban a un eventDate faux mais un eventStartDate juste) et
    // weezeventEventId (tag du conteneur de club — devient ev."tagId" des requêtes).
    // BUG-136-01 (conservé) : locationSpaceMapping en findMany, PAS findFirst — un
    // espace peut être alimenté par PLUSIEURS intégrations.
    const [, statics, weezeventEvents, shopIds] = await Promise.all([
      this.findOne(spaceId, tenantId),
      this.redis.getOrSet(
        this.SPACE_SALESSCOPE_CACHE_KEY(tenantId, spaceId),
        async () => {
          const [allSpaceEvents, locationMapping, spaceRow] = await Promise.all([
            this.prisma.event.findMany({
              where: { tenantId, spaceId },
              select: { id: true, eventDate: true, eventStartDate: true, eventEndDate: true, eventEndTime: true, weezeventEventId: true, integrationId: true },
            }),
            this.prisma.locationSpaceMapping.findMany({
              where: { tenantId, spaceId },
              select: { salesLocationId: true },
            }),
            this.prisma.space.findFirst({
              where: { id: spaceId, tenantId },
              select: { timezone: true },
            }),
          ]);
          return {
            allSpaceEvents,
            integrationIds: locationMapping.map(m => m.salesLocationId).filter(Boolean),
            spaceTimezone: spaceRow?.timezone || 'Europe/Paris',
          };
        },
        { ttl: this.SPACE_SALESSCOPE_CACHE_TTL },
      ),
      this.prisma.salesEvent.findMany({
        where: { id: { in: uniqueIds }, tenantId },
        select: { id: true, startDate: true, endDate: true },
      }),
      this.resolveShopIdsForSpace(spaceId, tenantId),
    ]);
    // NB : sur un hit Redis, les Date sont des strings ISO — tout le code aval fait
    // déjà `new Date(...)` avant usage (fenêtres, voisins — resolveEventTransactionWindow
    // tolère aussi les ISO strings directement).
    const { allSpaceEvents, integrationIds, spaceTimezone } = statics;

    if (shopIds.length === 0) return null;

    // Resolve date window per event: prefer DataFriday Event (accurate multi-day), fall
    // back to WeezeventEvent (when the frontend passes a Weezevent CUID). Same precedence
    // as the single-event method before batching.
    //
    // MAX_EVENT_SPAN_DAYS : certains "Event" ne représentent pas une session unique mais
    // un conteneur pour toute une saison (ex. "AJ AUXERRE - Saison 26/27", 356 jours) —
    // rien en amont (création de l'event, scoring predict-v2, filtres Analyse) ne les
    // distingue d'un vrai match. Demander le détail minute par minute sur une fenêtre
    // aussi large fait exploser le volume renvoyé (100k+ lignes, des dizaines de
    // secondes) ET fausse Event Predict : chaque event pèse dans la somme finale au
    // même ordre de grandeur qu'un vrai match (poids basé sur le score de similarité,
    // pas sur le volume de données), alors qu'une "saison" agrège des centaines de
    // jours sur un seul axe 24h — son total entre dans le calcul quasi sans réduction.
    // Seuil à 2 jours : couvre un event à cheval sur minuit (coup d'envoi tard le soir,
    // fin après 00h) sans risquer de repêcher un conteneur de saison (271 à 356 jours
    // observés). Les vrais events observés font 0 à 1 jour.
    const MAX_EVENT_SPAN_DAYS = 2;
    const dfMap = new Map(allSpaceEvents.map(e => [e.id, e]));
    const wzMap = new Map(weezeventEvents.map(e => [e.id, e]));

    // Fiche 147-01 (slide « Transactions prises en compte par Event » — remplace la lecture
    // « portes ±2 h » que BUG-146-01 avait faite de cette même slide : les boîtes « Ouverture
    // des portes 19h00 » y sont des repères, la bande de transactions démarre à 00h00) :
    // fenêtre = minuit LOCAL du jour de début → heure de fin déclarée (posée sur le jour de
    // fin — minuit franchi autorisé ; repli journée calendaire pleine), avancée à la fin
    // déclarée d'un voisin qui se termine le jour de début (ex. slide : « PFC - RC Lens »
    // fin 02h00 le 15/02 → « SFP-Toulouse » démarre le 15/02 à 02h00, pas à minuit — sans ça
    // la fenêtre de PFC absorbait le CA de SFP-Toulouse, 48k€ → 184k€, BUG-339-02).
    // MÊME logique que l'agrégation (resolveEventTransactionWindow, event-window.util) : la
    // divergence lecteur/writer était la cause des trois CA différents de la fiche 145-01.
    const windows: { id: string; windowStart: Date; windowEnd: Date; tagId: string | null; eventIntegrationId: string | null }[] = [];
    for (const id of uniqueIds) {
      const df = dfMap.get(id);
      const wz = wzMap.get(id);
      // BUG-146-01 : même précédence de jour que l'agrégation (`eventStartDate ?? eventDate`)
      // — un event dont eventDate est faux mais eventStartDate juste (SFP-Montauban, fiche
      // 145-01) obtient une fenêtre valide au lieu d'un `windowStart >= windowEnd` silencieux.
      const eventDate: Date | null = df
        ? new Date(df.eventStartDate ?? df.eventDate)
        : wz?.startDate
          ? new Date(wz.startDate)
          : null;
      if (!eventDate) continue; // event not found in either table → stays []
      let windowStart: Date;
      let windowEnd: Date;
      if (df) {
        ({ start: windowStart, end: windowEnd } = resolveEventTransactionWindow(
          df,
          spaceTimezone,
          allSpaceEvents,
        ));
      } else {
        // Repli WeezeventEvent (le front a passé un CUID Weezevent, pas un Event DataFriday) :
        // jour calendaire entier, endDate = dernier jour INCLUS → +1 jour.
        windowStart = eventDate;
        windowEnd = new Date(wz?.endDate ? new Date(wz.endDate) : eventDate);
        windowEnd.setDate(windowEnd.getDate() + 1);
      }
      if (windowStart >= windowEnd) continue; // fenêtre vide → stays []
      const spanDays = (windowEnd.getTime() - eventDate.getTime()) / 86_400_000;
      if (spanDays > MAX_EVENT_SPAN_DAYS) continue; // event-conteneur (saison…) → stays []
      // BUG-146-01 : tag du conteneur de club (ou d'un match précis) — devient ev."tagId".
      // Null (event non lié, ou id WeezeventEvent passé directement) → les requêtes
      // retombent sur la fenêtre seule, comportement d'avant.
      // BUG-368-02 : eventIntegrationId — mode prioritaire, robuste, ne dépend pas d'un
      // conteneur de saison ; coexiste avec tagId (legacy) pour les events pas encore migrés.
      windows.push({ id, windowStart, windowEnd, tagId: df?.weezeventEventId ?? null, eventIntegrationId: df?.integrationId ?? null });
    }
    if (!windows.length) return null;

    // Scope transactions to the integrationS that feed this space (étape 1 du wizard).
    // WeezeventLocationSpaceMapping.weezeventLocationId stores the integrationId, et un
    // espace peut en avoir PLUSIEURS (BUG-136-01) — d'où `= ANY(...)` et non `= <une>`.
    // If no mapping yet, fall back to tenant-wide (degraded mode, broader scope).
    const integrationClause = integrationIds.length
      ? Prisma.sql`AND t."integrationId" = ANY(${integrationIds})`
      : Prisma.sql``;

    // Shop scoping aligned with the get_space_shop_details RPC: keep sales whose
    // location has no shop mapping (they surface as the frontend's grey
    // "unattached" bucket) instead of silently dropping them — an unmapped POS
    // previously zeroed out every item-level view while the shop-level aggregate
    // kept showing revenue. Rows mapped to another space's shops stay excluded.
    // Without an integration scope the query is tenant-wide, so the unmapped branch
    // would leak other spaces' sales into this space's date windows — in that
    // degraded mode, require the mapping.
    // Décision JLH 2026-08-24 (BUG-137-01, après aller-retour) : les ventes non
    // mappées restent COMPTÉES, affichées « Non mappées » — le volume est mesuré à
    // part (getAnalyseUnmappedBatch → bandeau informatif), jamais filtré ici.
    const shopScopeClause = integrationIds.length
      ? Prisma.sql`(mem."spaceElementId" IS NULL OR mem."spaceElementId" = ANY(${shopIds}))`
      : Prisma.sql`mem."spaceElementId" = ANY(${shopIds})`;

    const valuesSql = Prisma.join(
      windows.map(w => Prisma.sql`(${w.id}::text, ${w.windowStart}::timestamp, ${w.windowEnd}::timestamp, ${w.tagId}::text, ${w.eventIntegrationId}::text)`),
      ', ',
    );

    return { integrationClause, shopScopeClause, valuesSql, spaceTimezone, shopIds, windows };
  }

  /**
   * Batched minute-level timeline for MULTIPLE events at once: minute × shop × menuItem.
   * Resolves ownership/integration-scope/shopIds ONCE for the space (they don't vary per
   * event) instead of once per event, then runs a single raw-SQL aggregate for all events
   * via a VALUES CTE joined by date-range predicate — instead of one query per event.
   * Returns a map keyed by the requested eventId (missing/not-found events map to []).
   * Sales whose location has no shop mapping are KEPT (shopId falls back to the raw
   * locationId, shopName to locationName) — same resilience as the shop-details RPC;
   * the frontend buckets them as "unattached" (grey). Only when the space has no
   * integration mapping (tenant-wide degraded scope) are unmapped rows excluded.
   *
   * PERF (event-timeline-item-agg) : lit désormais `SpaceRevenueMinuteItemAgg` (pré-agrégée
   * à l'écriture par aggregation.service.ts et space-aggregation.service.ts) au lieu de
   * scanner WeezeventTransaction/WeezeventTransactionItem à chaque appel. Le grain stocké
   * (event × minute × shop × article) est déjà celui dont cette méthode a besoin — il ne
   * reste que la résolution du nom/type/catégorie d'article (WeezeventProductMapping →
   * MenuItem → ProductType/ProductCategory), faite ici à la lecture pour rester à jour sans
   * jamais réinvalider l'agrégat.
   */
  /** BUG-143-01 : TTL par event — long si sa fenêtre de ventes est terminée (immuable),
   *  court sinon (event du jour, futur, ou sans fenêtre résolue — conteneur/inconnu). */
  private eventBatchCacheTtl(
    windows: { id: string; windowEnd: Date }[],
    eventId: string,
  ): number {
    const w = windows.find(w => w.id === eventId);
    return w && new Date(w.windowEnd).getTime() < Date.now()
      ? this.EVENT_BATCH_CACHE_TTL_PAST
      : this.EVENT_BATCH_CACHE_TTL_LIVE;
  }

  async getEventTimelineBatch(
    spaceId: string,
    eventIds: string[],
    tenantId: string,
    // BUG-364-01 (étape 5 du plan 25/08) : granularity 'summary' = grain event × shop ×
    // produit SANS la dimension minute — le chargement de montage de l'Analyse n'a
    // besoin que de totaux (vérifié consommateur par consommateur, fiche 364-01), le
    // grain minute (~2 Mo/event) ne sert qu'à la courbe horaire, qui garde son fetch
    // séparé plein grain. Facteur ~100-200× sur la taille de réponse.
    opts: { granularity?: 'minute' | 'summary' } = {},
  ): Promise<Record<string, any[]>> {
    const summary = opts.granularity === 'summary';
    // Clé de cache distincte par granularité (':sum'), couverte par le motif de purge
    // spaces:evtimeline:{tenantId}:{spaceId}:* (suffixe APRÈS l'eventId).
    const cacheKeyOf = (id: string) =>
      this.EVENT_TIMELINE_CACHE_KEY(tenantId, spaceId, id) + (summary ? ':sum' : '');
    const uniqueIds = [...new Set(eventIds.filter(Boolean))].slice(0, 100);
    const out: Record<string, any[]> = Object.fromEntries(uniqueIds.map(id => [id, []]));
    if (!uniqueIds.length) return out;

    // BUG-143-01 : lookup Redis par event — seuls les manquants paient le SQL ci-dessous.
    const cachedEntries = await Promise.all(
      uniqueIds.map(async id => [id, await this.redis.get<any[]>(cacheKeyOf(id))] as const),
    );
    const missing: string[] = [];
    for (const [id, cached] of cachedEntries) {
      // `!= null` (et pas `!== null`) : RedisService.get renvoie null sur miss, mais un
      // double mocké/dégradé peut renvoyer undefined — les deux sont des miss. `[]` en
      // cache est un HIT valide (« aucune vente » est un résultat).
      if (cached != null) out[id] = cached;
      else missing.push(id);
    }
    if (!missing.length) return out;

    const scope = await this.resolveEventSalesScope(spaceId, missing, tenantId);
    if (!scope) return out;
    const { shopScopeClause, valuesSql, spaceTimezone } = scope;

    // BUG-364-01 — granularity=summary : grain event × shop × produit, SANS minute.
    // Même CTE dedup (l'élimination des lignes jumelles inter-writers reste PAR minute,
    // cf. BUG-130-01 ci-dessous), même clause tag conteneur (BUG-146-01), mêmes fenêtres —
    // seule l'agrégation finale écrase la dimension minute. Dégraissage assumé du même
    // coup (plan étape 5.3) : pas de `minute`/`minuteLocal`, pas de doublon `revenue`
    // (les consommateurs lisent `revenueHt`, repli ajouté dans timelineBucketing.js).
    if (summary) {
      const rows: any[] = await this.analyseBatchSemaphore.run(() => this.prisma.$queryRaw(Prisma.sql`
        WITH ev("eventId", "windowStart", "windowEnd", "tagId", "eventIntegrationId") AS (VALUES ${valuesSql}),
        dedup AS (
          SELECT
            ev."eventId"                 AS "eventId",
            mem."minute"                 AS "minute",
            mem."spaceElementId"         AS "spaceElementId",
            mem."weezeventLocationId"    AS "weezeventLocationId",
            mem."weezeventLocationName"  AS "weezeventLocationName",
            mem."weezeventProductId"     AS "weezeventProductId",
            MAX(mem."itemsCount")        AS "itemsCount",
            MAX(mem."transactionsCount") AS "transactionsCount",
            MAX(mem."revenueHt")         AS "revenueHt"
          FROM ev
          INNER JOIN "SpaceRevenueMinuteItemAgg" mem
            ON mem."minute" >= ev."windowStart"
           AND mem."minute" <  ev."windowEnd"
           AND (ev."tagId" IS NULL OR mem."weezeventEventId" IN (ev."eventId", ev."tagId"))
           AND mem."tenantId" = ${tenantId}
           AND mem."spaceId"  = ${spaceId}
          WHERE ${shopScopeClause}
          GROUP BY
            ev."eventId", mem."minute",
            mem."spaceElementId", mem."weezeventLocationId", mem."weezeventLocationName",
            mem."weezeventMerchantId", mem."weezeventProductId"
        )
        SELECT
          dd."eventId"                                                      AS "eventId",
          COALESCE(dd."spaceElementId", dd."weezeventLocationId")           AS "shopId",
          COALESCE(se.name, dd."weezeventLocationName", dd."weezeventLocationId") AS "shopName",
          COALESCE(se.attributes::jsonb->>'originalType', se.type::text)   AS "shopType",
          se.attributes::jsonb->>'area'                                     AS "shopArea",
          dd."weezeventProductId"                                           AS "weezeventProductId",
          wpm."menuItemId",
          mi.name                                                           AS "menuItemName",
          pt.name                                                           AS "menuItemType",
          pc.name                                                           AS "menuItemCategory",
          SUM(dd."itemsCount")::integer                                     AS quantity,
          SUM(dd."transactionsCount")::integer                              AS "transactionCount",
          SUM(dd."revenueHt")::numeric(12,2)                                AS "revenueHt"
        FROM dedup dd
        LEFT JOIN "SpaceElement" se
          ON se.id = dd."spaceElementId"
        LEFT JOIN "WeezeventProductMapping" wpm
          ON wpm."weezeventProductId" = dd."weezeventProductId"
         AND wpm."tenantId" = ${tenantId}
        LEFT JOIN "MenuItem" mi
          ON mi.id = wpm."menuItemId"
        LEFT JOIN "ProductType" pt
          ON pt.id = mi."typeId"
        LEFT JOIN "ProductCategory" pc
          ON pc.id = mi."categoryId"
        GROUP BY
          dd."eventId",
          COALESCE(dd."spaceElementId", dd."weezeventLocationId"),
          COALESCE(se.name, dd."weezeventLocationName", dd."weezeventLocationId"),
          se.type, se.attributes,
          dd."weezeventProductId", wpm."menuItemId", mi.name, pt.name, pc.name
        ORDER BY dd."eventId"
      `));

      for (const r of rows) {
        const bucket = out[r.eventId];
        if (!bucket) continue;
        bucket.push({
          shopId:           r.shopId,
          shopName:         r.shopName,
          shopType:         r.shopType ?? null,
          shopArea:         r.shopArea ?? null,
          weezeventProductId: r.weezeventProductId ?? null,
          menuItemId:       r.menuItemId ?? null,
          menuItemName:     r.menuItemName ?? null,
          menuItemType:     r.menuItemType ?? null,
          menuItemCategory: r.menuItemCategory ?? null,
          quantity:         Number(r.quantity         || 0),
          transactionCount: Number(r.transactionCount || 0),
          revenueHt:        Number(r.revenueHt        || 0),
        });
      }

      await Promise.all(
        missing.map(id =>
          this.redis.set(cacheKeyOf(id), out[id], {
            ttl: this.eventBatchCacheTtl(scope.windows, id),
          }),
        ),
      );
      return out;
    }

    // BUG-270 : "minute" est un TIMESTAMP sans fuseau mais sa valeur littérale est du vrai
    // UTC (même nature que WeezeventTransaction."transactionDate", dont elle est dérivée par
    // date_trunc('minute', t."transactionDate") côté écriture, sans conversion — voir
    // aggregation.service.ts). Même conversion `AT TIME ZONE 'UTC' AT TIME ZONE ${tz}` qu'avant
    // pour reprojeter en heure murale locale de l'espace (BUG-125-01 : factorisée dans le
    // LATERAL `tz` pour que Postgres ne voie qu'une seule interpolation du paramètre).
    //
    // Le JOIN reste borné par fenêtre de dates (ev."windowStart"/"windowEnd"), PAS par égalité
    // sur "weezeventEventId" : les deux pipelines d'écriture (aggregation.service.ts,
    // space-aggregation.service.ts) taguent ce champ avec des conventions d'id différentes
    // (id "Event" DataFriday vs id "WeezeventEvent" brut — cf. BUG-123-01 dans la RPC
    // get_space_shop_details) ; une égalité stricte manquerait les events qui n'existent
    // qu'en WeezeventEvent. Depuis BUG-339-02, la fenêtre est resserrée sur l'heure de fin
    // réelle de l'event (voir resolveEventSalesScope) — deux events consécutifs ne se
    // chevauchent plus quand leurs heures de fin sont connues.
    //
    // Agrégation en DEUX niveaux (BUG-130-01, régression du commit perf
    // event-timeline-item-agg qui faisait un MAX à un seul niveau) :
    //
    // 1. CTE "dedup" — MAX(...) par (event, minute, shop, location, MERCHANT, article),
    //    en écrasant UNIQUEMENT "weezeventEventId" : si les deux pipelines d'écriture ont
    //    tous les deux écrit pour la même fenêtre, on obtient deux lignes jumelles pour le
    //    même créneau — mêmes transactions réelles, seul le tag "weezeventEventId" diffère
    //    (id Event DataFriday vs id WeezeventEvent brut). Les jumelles portent la même
    //    valeur (même source, même formule) ; SUM les compterait en double, MAX retombe
    //    sur la valeur correcte sans hypothèse fragile sur quel writer a tourné en dernier.
    //
    // 2. Niveau affichage — SUM(...) par (event, minute locale, shop, article) : deux
    //    merchants (ou deux locations non mappées) qui vendent le même article à la même
    //    minute sont des ventes LÉGITIMEMENT DISTINCTES et doivent s'additionner. C'est ce
    //    que le MAX à un seul niveau écrasait (le GROUP BY sortait aussi
    //    "weezeventMerchantId") : chaque minute était plafonnée à la plus grosse ligne au
    //    lieu du total → timeline réelle aplatie en plateau constant.
    // BUG-144-01 : section SQL sous sémaphore (2 en vol, file 32, 60 s -> 503) — les
    // hits cache plus haut ne font pas la queue.
    const rows: any[] = await this.analyseBatchSemaphore.run(() => this.prisma.$queryRaw(Prisma.sql`
      WITH ev("eventId", "windowStart", "windowEnd", "tagId", "eventIntegrationId") AS (VALUES ${valuesSql}),
      dedup AS (
        SELECT
          ev."eventId"                 AS "eventId",
          mem."minute"                 AS "minute",
          mem."spaceElementId"         AS "spaceElementId",
          mem."weezeventLocationId"    AS "weezeventLocationId",
          mem."weezeventLocationName"  AS "weezeventLocationName",
          mem."weezeventProductId"     AS "weezeventProductId",
          MAX(mem."itemsCount")        AS "itemsCount",
          MAX(mem."transactionsCount") AS "transactionsCount",
          MAX(mem."revenueHt")         AS "revenueHt"
        FROM ev
        INNER JOIN "SpaceRevenueMinuteItemAgg" mem
          ON mem."minute" >= ev."windowStart"
         AND mem."minute" <  ev."windowEnd"
         -- BUG-146-01 : quand l'event est lié à son conteneur de club (ev."tagId"), ne
         -- prendre que les lignes agrégées SOUS cet event (id Event DataFriday, writer
         -- aggregation.service) ou sous le tag brut (id WeezeventEvent, writer
         -- space-aggregation) — les fenêtres portes→fin de deux events le même jour se
         -- recouvrent, seul le tag départage. tagId NULL → fenêtre seule, comportement
         -- d'avant (BUG-123-01 : events qui n'existent qu'en WeezeventEvent).
         AND (ev."tagId" IS NULL OR mem."weezeventEventId" IN (ev."eventId", ev."tagId"))
         AND mem."tenantId" = ${tenantId}
         AND mem."spaceId"  = ${spaceId}
        WHERE ${shopScopeClause}
        GROUP BY
          ev."eventId", mem."minute",
          mem."spaceElementId", mem."weezeventLocationId", mem."weezeventLocationName",
          mem."weezeventMerchantId", mem."weezeventProductId"
      )
      SELECT
        dd."eventId"                                                      AS "eventId",
        TO_CHAR(tz."minuteLocal", 'HH24:MI')                              AS minute,
        -- BUG-351-01 : la minute DATEE, en heure murale locale de l'espace.
        -- La colonne minute seule (HH24:MI) perd le jour : une vente a 00h30 qui
        -- prolonge l'evenement de la veille se retrouvait triee AVANT 19h00, en
        -- tete de courbe. minute est conservee telle quelle (tous les
        -- consommateurs actuels la lisent) ; les ecrans qui doivent ordonner ou
        -- franchir minuit lisent minuteLocal.
        TO_CHAR(tz."minuteLocal", 'YYYY-MM-DD"T"HH24:MI')                 AS "minuteLocal",
        COALESCE(dd."spaceElementId", dd."weezeventLocationId")           AS "shopId",
        COALESCE(se.name, dd."weezeventLocationName", dd."weezeventLocationId") AS "shopName",
        COALESCE(se.attributes::jsonb->>'originalType', se.type::text)   AS "shopType",
        se.attributes::jsonb->>'area'                                     AS "shopArea",
        dd."weezeventProductId"                                           AS "weezeventProductId",
        wpm."menuItemId",
        mi.name                                                           AS "menuItemName",
        pt.name                                                           AS "menuItemType",
        pc.name                                                           AS "menuItemCategory",
        SUM(dd."itemsCount")::integer                                     AS quantity,
        SUM(dd."transactionsCount")::integer                              AS "transactionCount",
        SUM(dd."revenueHt")::numeric(12,2)                                AS "revenueHt"
      FROM dedup dd
      CROSS JOIN LATERAL (
        SELECT DATE_TRUNC('minute', dd."minute" AT TIME ZONE 'UTC' AT TIME ZONE ${spaceTimezone}) AS "minuteLocal"
      ) tz
      LEFT JOIN "SpaceElement" se
        ON se.id = dd."spaceElementId"
      LEFT JOIN "WeezeventProductMapping" wpm
        ON wpm."weezeventProductId" = dd."weezeventProductId"
       AND wpm."tenantId" = ${tenantId}
      LEFT JOIN "MenuItem" mi
        ON mi.id = wpm."menuItemId"
      LEFT JOIN "ProductType" pt
        ON pt.id = mi."typeId"
      LEFT JOIN "ProductCategory" pc
        ON pc.id = mi."categoryId"
      GROUP BY
        dd."eventId", tz."minuteLocal",
        COALESCE(dd."spaceElementId", dd."weezeventLocationId"),
        COALESCE(se.name, dd."weezeventLocationName", dd."weezeventLocationId"),
        se.type, se.attributes,
        dd."weezeventProductId", wpm."menuItemId", mi.name, pt.name, pc.name
      -- Tri sur la minute DATEE (BUG-351-01) : trier sur la colonne minute
      -- (HH24:MI) placait les ventes d'apres minuit en tete d'evenement.
      ORDER BY dd."eventId", tz."minuteLocal" ASC
    `));

    for (const r of rows) {
      const bucket = out[r.eventId];
      if (!bucket) continue;
      bucket.push({
        minute:           r.minute,
        minuteLocal:      r.minuteLocal ?? null,
        shopId:           r.shopId,
        shopName:         r.shopName,
        shopType:         r.shopType ?? null,
        shopArea:         r.shopArea ?? null,
        weezeventProductId: r.weezeventProductId ?? null,
        menuItemId:       r.menuItemId ?? null,
        menuItemName:     r.menuItemName ?? null,
        menuItemType:     r.menuItemType ?? null,
        menuItemCategory: r.menuItemCategory ?? null,
        quantity:         Number(r.quantity         || 0),
        transactionCount: Number(r.transactionCount || 0),
        revenueHt:        Number(r.revenueHt        || 0),
        revenue:          Number(r.revenueHt        || 0),
      });
    }

    // BUG-143-01 : écrit chaque event résolu (y compris []) — un event passé sans vente
    // est un résultat définitif au même titre qu'un event plein.
    await Promise.all(
      missing.map(id =>
        this.redis.set(cacheKeyOf(id), out[id], {
          ttl: this.eventBatchCacheTtl(scope.windows, id),
        }),
      ),
    );
    return out;
  }

  /**
   * Répartition des COMBINAISONS de catégories/articles PAR TRANSACTION (panier).
   *
   * Alimente le donut « Répartition des catégories de produits par transaction » :
   * chaque part = l'ensemble distinct des catégories présentes dans un même panier
   * (« Bières » seule, « Bières, Boissons Soft », …), la valeur = le NOMBRE DE
   * TRANSACTIONS. C'est la seule lecture du code qui préserve l'identité du panier :
   * `getEventTimelineBatch` porte la même chaîne de jointure mais écrase `t.id` en
   * `COUNT(DISTINCT t.id)`, et aucun pré-agrégat ne porte de dimension transaction
   * (`SpaceRevenueMinuteAgg` n'a pas de produit, `SpaceProductRevenueDailyAgg` pas de
   * transaction).
   *
   * Grain de sortie : (event × minute × PdV × combo catégories × combo articles) avec
   * un `transactionCount`. PAS les combos déjà comptés globalement — le front doit
   * pouvoir appliquer ses filtres PdV/horaire côté client sans refetch, comme le reste
   * de la page. Les paniers étant très majoritairement des singletons, ce grain
   * s'effondre fortement.
   *
   * Sémantique assumée, à connaître avant de lire les chiffres :
   * - les REMBOURSEMENTS sont comptés (statut 'V' avec montants négatifs : ils sont
   *   indiscernables d'une vente par le statut, et un panier de remboursement reste un
   *   panier). Pas de filtre sur le signe — il changerait le dénominateur en silence ;
   * - les lignes non résolues (produit non mappé, ou `MenuItem.categoryId` NULL) sortent
   *   en `null` DANS le tableau, jamais écartées : le front les affiche en « Non
   *   rattachés » plutôt que de sous-compter sans le dire ;
   * - les FORMULES ne sont pas regroupées : leurs lignes filles comptent chacune pour
   *   elles-mêmes (`compoundId` est de toute façon codé à null sur le chemin de synchro
   *   incrémental, celui qui tourne en production) ;
   * - les paniers VIDES (possibles sur ce même chemin incrémental) disparaissent d'eux-
   *   mêmes via l'INNER JOIN sur les items : un panier sans ligne n'a pas de combinaison.
   */
  async getTransactionBasketsBatch(spaceId: string, eventIds: string[], tenantId: string): Promise<Record<string, any[]>> {
    const uniqueIds = [...new Set(eventIds.filter(Boolean))].slice(0, 100);
    const out: Record<string, any[]> = Object.fromEntries(uniqueIds.map(id => [id, []]));
    if (!uniqueIds.length) return out;

    // BUG-143-01 : même cache par event que getEventTimelineBatch (clé dédiée — forme de
    // record différente), seuls les manquants paient le scan brut WeezeventTransaction.
    const cachedEntries = await Promise.all(
      uniqueIds.map(async id => [id, await this.redis.get<any[]>(this.EVENT_BASKETS_CACHE_KEY(tenantId, spaceId, id))] as const),
    );
    const missing: string[] = [];
    for (const [id, cached] of cachedEntries) {
      // `!= null` : null (RedisService) ET undefined (double mocké/dégradé) sont des miss.
      if (cached != null) out[id] = cached;
      else missing.push(id);
    }
    if (!missing.length) return out;

    const scope = await this.resolveEventSalesScope(spaceId, missing, tenantId);
    if (!scope) return out;
    const { integrationClause, shopScopeClause, valuesSql, spaceTimezone } = scope;

    // CTE `tx` : UNE ligne par transaction, avec ses deux ensembles de libellés.
    // `ARRAY_AGG(DISTINCT … ORDER BY …)` garantit que « Bières, Consigne » et
    // « Consigne, Bières » tombent dans le même bucket. Les mêmes prédicats
    // obligatoires que getEventTimelineBatch sont repris à l'identique
    // (status='V', deletedAt IS NULL, scope tenant/intégration/PdV) — cf. BUG-028
    // et BUG-108. Un panier à N lignes ne produit qu'UNE ligne ici : c'est ce qui
    // évite le double comptage au dénominateur.
    // BUG-144-01 : même sémaphore que getEventTimelineBatch.
    const rows: any[] = await this.analyseBatchSemaphore.run(() => this.prisma.$queryRaw(Prisma.sql`
      WITH ev("eventId", "windowStart", "windowEnd", "tagId", "eventIntegrationId") AS (VALUES ${valuesSql}),
      tx AS (
        SELECT
          t.id                                                            AS "txId",
          ev."eventId"                                                    AS "eventId",
          TO_CHAR(DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE ${spaceTimezone}), 'HH24:MI') AS minute,
          -- BUG-136-01 : la minute DATEE, meme semantique que getEventTimelineBatch.
          -- Sans elle, buildBasketFilterPredicate (qui n applique PAS skipMinute) evalue
          -- les bornes DATEES du curseur horaire contre un simple HH24:MI et renvoie false
          -- pour toutes les lignes des qu un event franchit minuit : donuts paniers vides.
          TO_CHAR(DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE ${spaceTimezone}), 'YYYY-MM-DD"T"HH24:MI') AS "minuteLocal",
          COALESCE(mem."spaceElementId", t."locationId")                  AS "shopId",
          COALESCE(se.name, t."locationName", t."locationId")             AS "shopName",
          COALESCE(se.attributes::jsonb->>'originalType', se.type::text)  AS "shopType",
          se.attributes::jsonb->>'area'                                   AS "shopArea",
          ARRAY_AGG(DISTINCT pc.name ORDER BY pc.name)                    AS "categoryCombo",
          ARRAY_AGG(DISTINCT pt.name ORDER BY pt.name)                    AS "typeCombo",
          ARRAY_AGG(DISTINCT COALESCE(mi.name, ti."productName")
                    ORDER BY COALESCE(mi.name, ti."productName"))         AS "itemCombo",
          SUM(ti.quantity)::integer                                       AS quantity,
          SUM(
            ti."unitPrice" * ti.quantity
            / (1 + ti."vat" / 100)
          )::numeric(12,2)                                                AS "revenueHt"
        FROM ev
        INNER JOIN "WeezeventTransaction" t
          ON t."transactionDate" >= ev."windowStart"
         AND t."transactionDate" <  ev."windowEnd"
         -- BUG-146-01 (legacy) : tag du conteneur du club quand l'event y est lié — les jours
         -- à double affiche, la fenêtre seule mélangeait les caisses des deux clubs. tagId
         -- NULL (event non lié, source CSV sans tag) → fenêtre seule, comme avant.
         AND (ev."tagId" IS NULL OR t."eventId" = ev."tagId")
         -- BUG-368-02 : eventIntegrationId explicite, prioritaire et robuste — même rôle que
         -- tagId ci-dessus mais sans dépendre d'un conteneur de saison Weezevent.
         AND (ev."eventIntegrationId" IS NULL OR t."integrationId" = ev."eventIntegrationId")
         AND t."tenantId" = ${tenantId}
         ${integrationClause}
         AND t.status = 'V'
         AND t."deletedAt" IS NULL
        INNER JOIN "WeezeventTransactionItem" ti
          ON ti."transactionId" = t.id
        LEFT JOIN "WeezeventLocationShopMapping" mem
          ON mem."weezeventLocationId" = t."locationId"
         AND mem."tenantId"         = ${tenantId}
        LEFT JOIN "SpaceElement" se
          ON se.id = mem."spaceElementId"
        LEFT JOIN "WeezeventProductMapping" wpm
          ON wpm."weezeventProductId" = ti."productId"
         AND wpm."tenantId" = ${tenantId}
        LEFT JOIN "MenuItem" mi
          ON mi.id = wpm."menuItemId"
        LEFT JOIN "ProductType" pt
          ON pt.id = mi."typeId"
        LEFT JOIN "ProductCategory" pc
          ON pc.id = mi."categoryId"
        WHERE ${shopScopeClause}
        GROUP BY
          t.id, ev."eventId", DATE_TRUNC('minute', t."transactionDate" AT TIME ZONE 'UTC' AT TIME ZONE ${spaceTimezone}),
          COALESCE(mem."spaceElementId", t."locationId"),
          COALESCE(se.name, t."locationName", t."locationId"),
          se.type, se.attributes
      )
      SELECT
        "eventId", minute, "minuteLocal", "shopId", "shopName", "shopType", "shopArea",
        "categoryCombo", "typeCombo", "itemCombo",
        COUNT(*)::integer                AS "transactionCount",
        SUM(quantity)::integer           AS quantity,
        SUM("revenueHt")::numeric(12,2)  AS "revenueHt"
      FROM tx
      GROUP BY
        "eventId", minute, "minuteLocal", "shopId", "shopName", "shopType", "shopArea",
        "categoryCombo", "typeCombo", "itemCombo"
      ORDER BY "eventId", "minuteLocal" ASC
    `));

    for (const r of rows) {
      const bucket = out[r.eventId];
      if (!bucket) continue;
      bucket.push({
        minute:      r.minute,
        minuteLocal: r.minuteLocal ?? null,
        shopId:   r.shopId,
        shopName: r.shopName,
        shopType: r.shopType ?? null,
        shopArea: r.shopArea ?? null,
        // `null` conservé DANS le tableau (produit non mappé / catégorie absente) :
        // le front le rend en « Non rattachés ». Ne pas compacter ici.
        categoryCombo:    Array.isArray(r.categoryCombo) ? r.categoryCombo : [],
        typeCombo:        Array.isArray(r.typeCombo)     ? r.typeCombo     : [],
        itemCombo:        Array.isArray(r.itemCombo)     ? r.itemCombo     : [],
        transactionCount: Number(r.transactionCount || 0),
        quantity:         Number(r.quantity         || 0),
        revenueHt:        Number(r.revenueHt        || 0),
        revenue:          Number(r.revenueHt        || 0),
      });
    }

    // BUG-143-01 : même écriture par event que getEventTimelineBatch.
    await Promise.all(
      missing.map(id =>
        this.redis.set(this.EVENT_BASKETS_CACHE_KEY(tenantId, spaceId, id), out[id], {
          ttl: this.eventBatchCacheTtl(scope.windows, id),
        }),
      ),
    );
    return out;
  }

  /**
   * Volume NON MAPPÉ des ventes de l'Analyse (BUG-137-01) : lignes dont le produit
   * externe n'a pas de WeezeventProductMapping, ou dont le PdV n'a pas de
   * WeezeventLocationShopMapping vers cet espace.
   *
   * INFORMATIF UNIQUEMENT — décision JLH 2026-08-24 (après aller-retour) : ces ventes
   * restent COMPTÉES dans toutes les vues, sous le libellé « Non mappées ». Cet
   * endpoint ne filtre rien ; il alimente le bandeau de la page, qui distingue
   * « rien vendu » de « rien de mappé » (piège BUG-300-01) et pointe le travail
   * restant en Data Integration. Cause unique mesurée en base : produit importé au
   * catalogue mais jamais associé à un menu item à l'étape 3 du wizard (0 ligne à
   * productId NULL sur 786 882 lignes non mappées).
   * Mêmes fenêtres, même scope d'intégration et mêmes prédicats de lecture
   * (status 'V', deletedAt) que event-timeline / transaction-baskets. Les ventes
   * mappées vers les shops d'un AUTRE espace ne sont pas comptées ici : elles
   * n'appartiennent pas à cet écran.
   * Retourne { [eventId]: { unmappedLines, unmappedUnits, unmappedRevenueHt,
   * unmappedProductLines, unmappedPosLines } } — ids demandés absents → zéros.
   */
  async getAnalyseUnmappedBatch(spaceId: string, eventIds: string[], tenantId: string): Promise<Record<string, any>> {
    const uniqueIds = [...new Set(eventIds.filter(Boolean))].slice(0, 100);
    const zero = () => ({
      unmappedLines: 0,
      unmappedUnits: 0,
      unmappedRevenueHt: 0,
      unmappedProductLines: 0,
      unmappedPosLines: 0,
    });
    const out: Record<string, any> = Object.fromEntries(uniqueIds.map(id => [id, zero()]));
    if (!uniqueIds.length) return out;

    // BUG-144-01 : caché par event comme event-timeline/transaction-baskets — REMPLACE la
    // décision BUG-137-01 (« jamais caché ») : l'endpoint re-scannait 786k lignes brutes à
    // CHAQUE visite. La fraîcheur d'un re-mapping est désormais garantie par l'invalidation
    // à l'écriture de mapping (MappingsService → spaces:unmapped:*), plus par l'absence de
    // cache. TTL long pour un event passé, court sinon — même règle que les deux autres.
    const cachedEntries = await Promise.all(
      uniqueIds.map(async id => [id, await this.redis.get<any>(this.EVENT_UNMAPPED_CACHE_KEY(tenantId, spaceId, id))] as const),
    );
    const missing: string[] = [];
    for (const [id, cached] of cachedEntries) {
      if (cached != null) out[id] = cached;
      else missing.push(id);
    }
    if (!missing.length) return out;

    const scope = await this.resolveEventSalesScope(spaceId, missing, tenantId);
    if (!scope) return out;
    const { integrationClause, valuesSql, shopIds } = scope;

    // BUG-144-01 : même sémaphore que les deux autres endpoints batch.
    const rows: any[] = await this.analyseBatchSemaphore.run(() => this.prisma.$queryRaw(Prisma.sql`
      WITH ev("eventId", "windowStart", "windowEnd", "tagId", "eventIntegrationId") AS (VALUES ${valuesSql})
      SELECT
        ev."eventId"                                                        AS "eventId",
        COUNT(ti."id")::int                                                 AS "unmappedLines",
        COALESCE(SUM(ti."quantity"), 0)::float8                             AS "unmappedUnits",
        COALESCE(SUM(ti."unitPrice" * ti."quantity" / (1 + ti."vat" / 100)), 0)::float8 AS "unmappedRevenueHt",
        COUNT(ti."id") FILTER (WHERE wpm."menuItemId" IS NULL)::int         AS "unmappedProductLines",
        COUNT(ti."id") FILTER (WHERE mem."spaceElementId" IS NULL)::int     AS "unmappedPosLines"
      FROM ev
      INNER JOIN "WeezeventTransaction" t
        ON t."transactionDate" >= ev."windowStart"
       AND t."transactionDate" <  ev."windowEnd"
       -- BUG-146-01 (legacy) / BUG-368-02 : mêmes clauses tag conteneur + integrationId que
       -- event-timeline/transaction-baskets.
       AND (ev."tagId" IS NULL OR t."eventId" = ev."tagId")
       AND (ev."eventIntegrationId" IS NULL OR t."integrationId" = ev."eventIntegrationId")
       AND t."tenantId" = ${tenantId}
       ${integrationClause}
       AND t.status = 'V'
       AND t."deletedAt" IS NULL
      INNER JOIN "WeezeventTransactionItem" ti
        ON ti."transactionId" = t.id
      LEFT JOIN "WeezeventLocationShopMapping" mem
        ON mem."weezeventLocationId" = t."locationId"
       AND mem."tenantId" = ${tenantId}
      LEFT JOIN "WeezeventProductMapping" wpm
        ON wpm."weezeventProductId" = ti."productId"
       AND wpm."tenantId" = ${tenantId}
      WHERE (mem."spaceElementId" IS NULL OR mem."spaceElementId" = ANY(${shopIds}))
        AND (wpm."menuItemId" IS NULL OR mem."spaceElementId" IS NULL)
      GROUP BY ev."eventId"
    `));

    for (const r of rows) {
      if (!(r.eventId in out)) continue;
      out[r.eventId] = {
        unmappedLines: Number(r.unmappedLines || 0),
        unmappedUnits: Number(r.unmappedUnits || 0),
        unmappedRevenueHt: Number(r.unmappedRevenueHt || 0),
        unmappedProductLines: Number(r.unmappedProductLines || 0),
        unmappedPosLines: Number(r.unmappedPosLines || 0),
      };
    }

    // BUG-144-01 : écriture par event, zéros compris (« rien de non mappé » est un
    // résultat) — même TTL différencié que les deux autres endpoints batch.
    await Promise.all(
      missing.map(id =>
        this.redis.set(this.EVENT_UNMAPPED_CACHE_KEY(tenantId, spaceId, id), out[id], {
          ttl: this.eventBatchCacheTtl(scope.windows, id),
        }),
      ),
    );
    return out;
  }

  // Fenêtre de fraîcheur : au moins une vente dans les N dernières minutes (question #20 du
  // tracker front, tranchée par Ulrich 2026-07-20 : signal = vente réelle, pas le webhook brut).
  private readonly LIVE_STATUS_WINDOW_MINUTES = 30;
  // Marge après eventEndDate pendant laquelle un event reste considéré "live" (règlement tardif) —
  // même valeur que WeezeventCronService.LIVE_AGGREGATION_GRACE_HOURS (filet de sécurité BUG-109),
  // les deux implémentant la même définition d'"event en direct".
  private readonly LIVE_STATUS_GRACE_HOURS = 3;

  /**
   * "Cet espace a-t-il un event live ?" (tracker front #20, LIVE_API_GUIDE.md §1). Un espace n'a
   * qu'un seul event live à la fois (cardinalité tranchée le 2026-07-23, tracker #23) : l'event le
   * plus récent dont la fenêtre [eventStartDate, eventEndDate + grace] couvre l'instant présent est
   * live si au moins une vente réelle (non annulée, cf. BUG-108) est arrivée dans les 30 dernières
   * minutes pour les shops de cet espace.
   *
   * Si AUCUN Event ne couvre l'instant présent (pas créé à l'avance, ou oublié), ne pas se
   * refermer sur `isLive:false` par principe : une vente réelle dans la fenêtre glissante de 30
   * min suffit à elle seule à ancrer le live (`eventId:null` dans ce cas — décision revue, il
   * n'est plus nécessaire d'avoir saisi un Event en amont pour détecter un live réel).
   */
  async getLiveStatus(
    spaceId: string,
    tenantId: string,
  ): Promise<{ isLive: boolean; eventId: string | null; since: string | null }> {
    const now = new Date();
    const graceMs = this.LIVE_STATUS_GRACE_HOURS * 60 * 60 * 1000;

    // Candidats : events récents dont la fenêtre pourrait couvrir "now" — bornés à quelques
    // jours pour éviter un scan de tout l'historique (aucun event de plus de quelques jours ne
    // peut encore être dans sa fenêtre + grace).
    const candidates = await this.prisma.event.findMany({
      where: {
        tenantId,
        spaceId,
        eventDate: { lte: now, gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, eventDate: true, eventStartDate: true, eventEndDate: true },
      orderBy: { eventDate: 'desc' },
    });

    // Ne bloque plus sur l'absence d'Event : `event` peut rester `undefined` — le live sera
    // alors détecté (ou non) sur la seule base des ventes réelles, cf. doc de la méthode.
    const event = candidates.find((e) => {
      const start = e.eventStartDate ?? e.eventDate;
      const end = e.eventEndDate ?? e.eventDate;
      const graceEnd = new Date(end.getTime() + graceMs);
      return now >= start && now <= graceEnd;
    });

    const [locationMapping, shopIds] = await Promise.all([
      this.prisma.locationSpaceMapping.findFirst({
        where: { tenantId, spaceId },
        select: { salesLocationId: true },
      }),
      this.resolveShopIdsForSpace(spaceId, tenantId),
    ]);
    if (shopIds.length === 0) return { isLive: false, eventId: event?.id ?? null, since: null };

    const integrationId = locationMapping?.salesLocationId ?? null;
    const integrationClause = integrationId
      ? Prisma.sql`AND t."integrationId" = ${integrationId}`
      : Prisma.sql``;
    // Même repli "unmapped = gardé" que getEventTimelineBatch (§ ci-dessus) — un PdV pas encore
    // mappé shop-level ne doit pas faire manquer un vrai signal live.
    const shopScopeClause = integrationId
      ? Prisma.sql`(mem."spaceElementId" IS NULL OR mem."spaceElementId" = ANY(${shopIds}))`
      : Prisma.sql`mem."spaceElementId" = ANY(${shopIds})`;

    const windowStart = new Date(now.getTime() - this.LIVE_STATUS_WINDOW_MINUTES * 60 * 1000);
    // Avec un Event trouvé : la vente doit être à la fois récente (30 dernières minutes) ET
    // dans la fenêtre de l'event (pas une vente de test pré-event) — définition tranchée #20,
    // inchangée. Sans Event : fenêtre glissante de 30 min pure, aucun ancrage supplémentaire —
    // une vente isolée suffit, et le live retombe naturellement 30 min après la dernière vente.
    const eventStart = event ? (event.eventStartDate ?? event.eventDate) : null;
    const effectiveWindowStart = eventStart && eventStart > windowStart ? eventStart : windowStart;

    const rows: { since: Date | null }[] = await this.prisma.$queryRaw(Prisma.sql`
      SELECT MIN(t."transactionDate") AS since
      FROM "WeezeventTransaction" t
      LEFT JOIN "WeezeventLocationShopMapping" mem
        ON mem."weezeventLocationId" = t."locationId"
       AND mem."tenantId" = ${tenantId}
      WHERE t."tenantId" = ${tenantId}
        ${integrationClause}
        AND t.status = 'V'
        AND t."deletedAt" IS NULL
        AND t."transactionDate" >= ${effectiveWindowStart}
        AND ${shopScopeClause}
    `);

    const since = rows[0]?.since ?? null;
    return { isLive: !!since, eventId: event?.id ?? null, since: since ? since.toISOString() : null };
  }

  /**
   * Onglet Inventaire live (tracker front #22, LIVE_API_GUIDE.md §3) — délègue au module
   * Logistic, qui calcule déjà cette combinaison Restock + décrément par vente pour son propre
   * écran. Passthrough volontairement fin : la logique vit dans LogisticsService, pas ici.
   */
  async getLiveInventory(spaceId: string, tenantId: string) {
    return this.logisticsService.getLiveInventory(spaceId, tenantId);
  }

  /**
   * List all WeezeventEvents linked to a space (via integration scoped to tenant).
   * Returns event data with enrichment metadata (doorsOpening, showTime, category, etc.).
   */
  async getWeezeventEventsForSpace(spaceId: string, tenantId: string, integrationId?: string) {
    // Verify space belongs to tenant
    await this.findOne(spaceId, tenantId);

    let resolvedIntegrationId: string | undefined;

    if (integrationId) {
      // BUG-319-02 : integrationId fourni explicitement (wizard étape 4, StepProcessTimeline.vue)
      // — on vérifie que CETTE intégration est bien mappée à CET espace au lieu de piocher
      // arbitrairement le premier mapping de l'espace (findFirst sans orderBy ci-dessous), qui
      // pouvait renvoyer une AUTRE intégration quand l'espace en a plusieurs de mappées. Step 1
      // du wizard stocke integration.id directement dans salesLocationId
      // (createLocationSpaceMapping, mappings.service.ts) — comparaison directe.
      const link = await this.prisma.locationSpaceMapping.findFirst({
        where: { tenantId, spaceId, salesLocationId: integrationId },
      });
      if (!link) {
        return [];
      }
      resolvedIntegrationId = integrationId;
    } else {
      // Fallback legacy sans integrationId — comportement historique, correct seulement si
      // l'espace n'a qu'une seule intégration mappée (voir BUG-319-02 pour le cas à plusieurs).
      const locationMapping = await this.prisma.locationSpaceMapping.findFirst({
        where: { tenantId, spaceId },
        select: { salesLocationId: true },
      });

      if (!locationMapping) {
        return [];
      }

      const location = await this.prisma.salesLocation.findFirst({
        where: { id: locationMapping.salesLocationId, tenantId },
        select: { integrationId: true },
      });

      if (!location) {
        return [];
      }

      resolvedIntegrationId = location.integrationId;
    }

    const events = await this.prisma.salesEvent.findMany({
      where: { tenantId, integrationId: resolvedIntegrationId },
      select: {
        id: true,
        externalId: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        configurationId: true,
        metadata: true,
      },
      orderBy: { startDate: 'asc' },
    });

    return events.map((e) => ({
      id: e.id,
      weezeventId: e.externalId,
      name: e.name,
      startDate: e.startDate,
      endDate: e.endDate,
      status: e.status,
      configurationId: e.configurationId ?? null,
      doorsOpening:    (e.metadata as any)?.doorsOpening    ?? null,
      showTime:        (e.metadata as any)?.showTime        ?? null,
      category:        (e.metadata as any)?.category        ?? null,
      eventType:       (e.metadata as any)?.eventType       ?? null,
      team:            (e.metadata as any)?.team            ?? null,
      visitingTeam:    (e.metadata as any)?.visitingTeam    ?? null,
      hasIntermission: (e.metadata as any)?.hasIntermission ?? false,
      performer:       (e.metadata as any)?.performer       ?? null,
      openingAct:      (e.metadata as any)?.openingAct      ?? null,
      sponsor:         (e.metadata as any)?.sponsor         ?? null,
    }));
  }

  /**
   * Update enrichment metadata for a single WeezeventEvent.
   * Only fields explicitly provided in the payload are updated (shallow merge).
   */
  async updateWeezeventEventMetadata(
    spaceId: string,
    eventId: string,
    payload: {
      doorsOpening?: string | null;
      showTime?: string | null;
      category?: string | null;
      eventType?: string | null;
      team?: string | null;
      visitingTeam?: string | null;
      hasIntermission?: boolean;
      performer?: string | null;
      openingAct?: string | null;
      sponsor?: string | null;
    },
    tenantId: string,
  ) {
    // Verify space belongs to tenant
    await this.findOne(spaceId, tenantId);

    const event = await this.prisma.salesEvent.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true, metadata: true },
    });

    if (!event) {
      throw new NotFoundException(`WeezeventEvent ${eventId} not found`);
    }

    const existingMeta = (event.metadata as Record<string, unknown>) ?? {};
    const updatedMeta = { ...existingMeta, ...payload };

    const updated = await this.prisma.salesEvent.update({
      where: { id: eventId },
      data: { metadata: updatedMeta },
      select: {
        id: true,
        externalId: true,
        name: true,
        startDate: true,
        configurationId: true,
        metadata: true,
      },
    });

    return {
      id: updated.id,
      weezeventId: updated.externalId,
      name: updated.name,
      startDate: updated.startDate,
      configurationId: updated.configurationId ?? null,
      doorsOpening:    (updated.metadata as any)?.doorsOpening    ?? null,
      showTime:        (updated.metadata as any)?.showTime        ?? null,
      category:        (updated.metadata as any)?.category        ?? null,
      eventType:       (updated.metadata as any)?.eventType       ?? null,
      team:            (updated.metadata as any)?.team            ?? null,
      visitingTeam:    (updated.metadata as any)?.visitingTeam    ?? null,
      hasIntermission: (updated.metadata as any)?.hasIntermission ?? false,
      performer:       (updated.metadata as any)?.performer       ?? null,
      openingAct:      (updated.metadata as any)?.openingAct      ?? null,
      sponsor:         (updated.metadata as any)?.sponsor         ?? null,
    };
  }

  /**
   * Sync attendees for a single WeezeventEvent from the WeezPay API.
   * Paginates through GET /organizations/{org}/events/{eventId}/attendees,
   * upserts each record into WeezeventAttendee, and returns the total count.
   * ticketsScanned in getShopDetails() is computed from WeezeventAttendee rows
   * so it will reflect the updated count automatically.
   */
  async syncEventAttendees(
    spaceId: string,
    eventId: string,
    tenantId: string,
  ): Promise<{ synced: number }> {
    await this.findOne(spaceId, tenantId);

    const event = await this.prisma.salesEvent.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true, externalId: true, integrationId: true },
    });
    if (!event) {
      throw new NotFoundException(`WeezeventEvent ${eventId} not found`);
    }

    const integration = await this.prisma.integration.findFirst({
      where: { id: event.integrationId, tenantId },
      select: { id: true, weezevent: { select: { organizationId: true } } },
    });
    if (!integration?.weezevent?.organizationId) {
      throw new NotFoundException('WeezeventIntegration organization ID not configured');
    }

    let page = 1;
    let hasMore = true;
    let synced = 0;

    while (hasMore) {
      const response = await this.weezeventClient.getAttendees(
        tenantId,
        event.integrationId,
        integration.weezevent.organizationId,
        event.externalId,
        { page, perPage: 100 },
      );

      for (const a of response.data) {
        const weezeventId = String(a.id ?? a.attendee_id ?? `${page}_${synced}`);
        await this.prisma.weezeventAttendee.upsert({
          where: {
            tenantId_integrationId_weezeventId: {
              tenantId,
              integrationId: event.integrationId,
              weezeventId,
            },
          },
          create: {
            weezeventId,
            tenantId,
            integrationId: event.integrationId,
            eventId: event.id,
            eventName: a.event_name ?? null,
            email:     a.email      ?? null,
            firstName: a.first_name ?? null,
            lastName:  a.last_name  ?? null,
            ticketType: typeof a.ticket_type === 'string' ? a.ticket_type : (a.ticket_type?.name ?? null),
            status:    a.status ?? 'registered',
            rawData:   a,
          },
          update: {
            status:    a.status ?? 'registered',
            email:     a.email      ?? null,
            firstName: a.first_name ?? null,
            lastName:  a.last_name  ?? null,
            ticketType: typeof a.ticket_type === 'string' ? a.ticket_type : (a.ticket_type?.name ?? null),
            rawData:   a,
            syncedAt:  new Date(),
          },
        });
        synced++;
      }

      hasMore = page < response.meta.total_pages;
      page++;
    }

    return { synced };
  }

  /**
   * Create or update a configuration with normalized tables
   */
  /**
   * Reconcile un élément de plan (UPSERT par id) au lieu de delete+recreate.
   * Clé du fix « PDV démappés » : si le client renvoie `element.id`, la row est mise à jour EN
   * PLACE → `SpaceElement.id` reste IMMUABLE, donc `WeezeventLocationShopMapping.spaceElementId`
   * et les `MenuAssignment` restent valides. Sans id → vrai nouvel élément (create).
   * Les données filles (performance/staff/inventory) ne sont remplacées QUE si le payload les
   * fournit (sinon préservées — l'ancien delete+recreate les perdait silencieusement).
   */
  private async reconcileElement(
    tx: any,
    element: any,
    parent: { floorId?: string | null; forecourtId?: string | null },
    seenElementIds: Set<string>,
    existingElementIds: Set<string>,
    // Config du floor/forecourt en cours de save : scope des données filles
    // perf/staff/inventaire (tables scopées par config depuis 20260704190000).
    configId: string,
  ) {
    const originalType = element.type;
    const data: any = {
      floorId: parent.floorId ?? null,
      forecourtId: parent.forecourtId ?? null,
      externalMerchId: null,
      name: element.name || 'Element',
      type: this.mapElementType(element.type),
      x: element.x || 0,
      y: element.y || 0,
      width: element.width || 80,
      height: element.height || 60,
      depth: element.depth || element.height || 60,
      height3d: element.height3d || 25,
      rotation: element.rotation || 0,
      image: element.image || null,
      notes: element.notes || null,
      capacity: element.capacity || null,
      cornerRadiusTL: element.cornerRadius?.topLeft || 0,
      cornerRadiusTR: element.cornerRadius?.topRight || 0,
      cornerRadiusBL: element.cornerRadius?.bottomLeft || 0,
      cornerRadiusBR: element.cornerRadius?.bottomRight || 0,
      shopTypes: element.shopType || [],
      storageTypes: element.storageType || [],
      hospitalityTypes: element.hospitalityType || [],
      accessTypes: element.accessType || [],
      entertainmentTypes: element.entertainmentType || [],
      entranceTypes: element.entranceType || [],
      kitchenTypes: element.kitchenType || [],
      tags: element.tags || [],
      attributes: { ...element.attributes, originalType },
    };

    // UPDATE en place UNIQUEMENT si l'id appartient déjà à CETTE config (id immuable → mappings
    // préservés). Un id absent (nouvel élément) ou étranger à la config → CREATE avec un id frais,
    // pour ne jamais déplacer par erreur l'élément d'une autre config (l'id client est ignoré).
    const createdElement = element.id && existingElementIds.has(element.id)
      ? await tx.spaceElement.update({ where: { id: element.id }, data })
      : await tx.spaceElement.create({ data });
    element.id = createdElement.id;
    seenElementIds.add(createdElement.id);

    // Remplacements scopés à LA config sauvée : un élément v1 n'appartient qu'à une
    // config, mais le scope explicite évite d'écraser des lignes d'une autre config si
    // l'élément est un jour migré/partagé en v2.
    if (element.performance) {
      await tx.elementPerformance.deleteMany({ where: { elementId: createdElement.id, configId } });
      await tx.elementPerformance.create({
        data: {
          elementId: createdElement.id,
          configId,
          revenue: element.performance.revenue || 0,
          numberOfPOS: element.performance.numberOfPOS || 0,
          numberOfTransactions: element.performance.numberOfTransactions || 0,
          transactionsPerMinute: element.performance.transactionsPerMinute || 0,
          staffCost: element.performance.staffCost || 0,
          revenuePerEmployee: element.performance.revenuePerEmployee || 0,
        },
      });
    }

    if (Array.isArray(element.staffPositions) && element.staffPositions.length > 0) {
      await tx.elementStaff.deleteMany({ where: { elementId: createdElement.id, configId } });
      await tx.elementStaff.createMany({
        data: element.staffPositions.map((pos: any) => ({
          elementId: createdElement.id,
          configId,
          position: pos.position,
          count: pos.count || 1,
          hourlyRate: pos.hourlyRate || null,
        })),
      });
    }

    if (Array.isArray(element.inventoryItems) && element.inventoryItems.length > 0) {
      await tx.elementInventory.deleteMany({ where: { elementId: createdElement.id, configId } });
      await tx.elementInventory.createMany({
        data: element.inventoryItems.map((item: any) => ({
          elementId: createdElement.id,
          configId,
          name: item.name,
          quantity: item.quantity || 0,
          unit: item.unit || null,
          minStock: item.minStock || null,
          maxStock: item.maxStock || null,
          isCustom: item.isCustom !== false,
          menuItemId: item.menuItemId || null,
        })),
      });
    }

    return createdElement;
  }

  async saveConfiguration(dto: any, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(dto.spaceId, tenantId);

    if (dto.id) {
      // Check if config exists without throwing exception
      const existingConfig = await this.prisma.config.findFirst({
        where: {
          id: dto.id,
          space: {
            tenantId,
          },
        },
      });

      // If config exists, verify it belongs to the correct space
      if (existingConfig && existingConfig.spaceId !== dto.spaceId) {
        throw new ForbiddenException('Configuration does not belong to the provided space');
      }
    }

    // Extract floors and elements from data
    const floors = dto.data?.floors || [];
    const forecourt = dto.data?.forecourt || null;

    // ── Blindage cohabitation Builder v2 ──────────────────────────────────────
    // getConfiguration expose les éléments v2 en LECTURE : un save v1 peut donc les
    // recevoir dans son payload. On les retire (jamais créés/déplacés/écrasés par le
    // chemin v1) et on les protège plus bas du prune (jamais supprimés par un save v1).
    const v2Rows = await this.prisma.spaceElement.findMany({
      where: { zone: { spaceId: dto.spaceId } },
      select: { id: true },
    });
    const v2ManagedIds = new Set(v2Rows.map((r) => r.id));
    if (v2ManagedIds.size > 0) {
      const stripV2 = (els: any[]) =>
        (els || []).filter((el: any) => !(el?.id && v2ManagedIds.has(el.id)) && !el?.attributes?.managedByBuilderV2);
      for (const f of floors) {
        if (Array.isArray(f.elements)) f.elements = stripV2(f.elements);
      }
      if (forecourt && Array.isArray(forecourt.elements)) forecourt.elements = stripV2(forecourt.elements);
      if (dto.data?.externalMerch && Array.isArray(dto.data.externalMerch.elements)) {
        dto.data.externalMerch.elements = stripV2(dto.data.externalMerch.elements);
      }
    }

    // Use a transaction to ensure data consistency
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create or update the config
      let config;
      if (dto.id) {
        config = await tx.config.upsert({
          where: { id: dto.id },
          update: {
            name: dto.name,
            capacity: dto.capacity,
            data: dto.data,
            updatedAt: new Date(),
          },
          create: {
            id: dto.id,
            name: dto.name,
            spaceId: dto.spaceId,
            capacity: dto.capacity,
            data: dto.data,
          },
        });
      } else {
        config = await tx.config.create({
          data: {
            name: dto.name,
            spaceId: dto.spaceId,
            capacity: dto.capacity,
            data: dto.data,
          } as any,
        });
      }

      // 2a. Safety guard: preserve elements that have Weezevent mappings but are absent from
      // the incoming JSON (can happen with legacy data created before the JSON-sync fix).
      // We re-inject them into the floors payload so deleteMany + recreate keeps them intact.
      if (dto.id) {
        // Collect all element IDs already present in the incoming JSON payload
        const incomingElementIds = new Set<string>();
        for (const f of floors) {
          for (const el of f.elements || []) {
            if (el.id) incomingElementIds.add(el.id);
          }
        }
        for (const fce of forecourt?.elements || []) {
          if (fce.id) incomingElementIds.add(fce.id);
        }

        // Find existing elements in this config that have Weezevent mappings
        const existingFloors = await tx.floor.findMany({
          where: { configId: config.id },
          include: { elements: true },
        });
        const allExistingElements = existingFloors.flatMap((f: any) => f.elements);
        const existingIds = allExistingElements.map((e: any) => e.id);

        if (existingIds.length > 0) {
          const mappedElements = await tx.locationShopMapping.findMany({
            where: { spaceElementId: { in: existingIds } },
            select: { spaceElementId: true },
          });
          const mappedIds = new Set(mappedElements.map((m: any) => m.spaceElementId));

          // Elements that have mappings but are not in the incoming JSON
          const orphaned = allExistingElements.filter(
            (e: any) => mappedIds.has(e.id) && !incomingElementIds.has(e.id) && !v2ManagedIds.has(e.id),
          );

          if (orphaned.length > 0) {
            // Ré-injecter les éléments mappés absents du JSON pour ne pas les perdre au
            // delete+recreate — SANS jamais créer de floor « Import ». On les loge sur le
            // 1er floor existant du payload (RDC en priorité), sinon on crée un RDC neutre.
            let orphanFloor =
              floors.find((f: any) => f.level === 0) ?? floors[0];
            if (!orphanFloor) {
              orphanFloor = {
                name: 'RDC',
                level: 0,
                width: 100,
                height: 4,
                length: 100,
                elements: [],
                cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
                hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } },
              };
              floors.push(orphanFloor);
            }
            if (!Array.isArray(orphanFloor.elements)) orphanFloor.elements = [];

            for (const el of orphaned) {
              const attrs = el.attributes as any;
              orphanFloor.elements.push({
                id: el.id,
                name: el.name,
                type: attrs?.originalType ?? 'shop',
                x: el.x ?? 0,
                y: el.y ?? 0,
                width: el.width ?? 80,
                height: el.height ?? 60,
                depth: el.depth ?? 60,
                shopType: el.shopTypes ?? [],
                storageType: el.storageTypes ?? [],
                hospitalityType: el.hospitalityTypes ?? [],
                accessType: el.accessTypes ?? [],
                entertainmentType: el.entertainmentTypes ?? [],
                entranceType: el.entranceTypes ?? [],
                kitchenType: el.kitchenTypes ?? [],
                attributes: attrs ?? {},
                cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
              });
            }

            console.warn(
              `[saveConfiguration] Re-injected ${orphaned.length} Weezevent-mapped element(s) absent from JSON payload for config ${config.id}`,
            );
          }
        }
      }

      // 2b. Capture des MenuAssignment des éléments de cette config AVANT le delete
      // (cascade Floor → SpaceElement → MenuAssignment). Ils ne sont pas sérialisés dans
      // le JSON ; sans cette sauvegarde, delete+recreate les perdrait. Les ids d'éléments
      // étant préservés à la recréation (`...(element.id ? { id } : {})`), on peut les ré-insérer.
      const preservedAssignments = await tx.menuAssignment.findMany({
        where: {
          OR: [
            { element: { floor: { configId: config.id } } },
            { element: { forecourt: { configId: config.id } } },
          ],
        },
        select: { elementId: true, menuItemId: true, enabled: true, configId: true },
      });

      // 2c. RECONCILE (plus de delete+recreate). C'est LA correction du bug « PDV démappés » :
      // `SpaceElement.id` devient IMMUABLE, donc WeezeventLocationShopMapping.spaceElementId
      // (String SANS FK → dangling silencieux) et les MenuAssignment restent valides au lieu
      // d'être orphelinés à chaque sauvegarde. On charge l'état existant pour pruner après coup.
      const existingFloorsForReconcile = await tx.floor.findMany({
        where: { configId: config.id },
        include: { elements: { select: { id: true } } },
      });
      const existingForecourtsForReconcile = await tx.forecourt.findMany({
        where: { configId: config.id },
        include: { elements: { select: { id: true } } },
      });
      const existingElementIds: string[] = [
        ...existingFloorsForReconcile.flatMap((f: any) => f.elements.map((e: any) => e.id)),
        ...existingForecourtsForReconcile.flatMap((fc: any) => fc.elements.map((e: any) => e.id)),
      ];
      // Éléments protégés (porteurs d'un mapping Weezevent) : JAMAIS supprimés, même absents
      // du payload — sinon le mapping deviendrait orphelin.
      const protectedElementIds = new Set<string>(
        existingElementIds.length > 0
          ? (
              await tx.locationShopMapping.findMany({
                where: { spaceElementId: { in: existingElementIds } },
                select: { spaceElementId: true },
              })
            ).map((m: any) => m.spaceElementId)
          : [],
      );
      const existingElementIdSet = new Set<string>(existingElementIds);
      const seenFloorIds = new Set<string>();
      const seenForecourtIds = new Set<string>();
      const seenElementIds = new Set<string>();

      // 3. Reconcile floors + their elements (UPSERT en place — ids préservés)
      for (const floor of floors) {
        const floorData = {
          configId: config.id,
          name: floor.name,
          level: floor.level || 0,
          width: floor.width || 800,
          height: floor.height || 600,
          length: floor.length || 100,
          cornerRadius: floor.cornerRadius || null,
        };
        // Match par id (échoté par le client) → UPDATE ; sinon par niveau pour adopter la row
        // existante au lieu d'en créer une 2ᵉ au même level ; sinon CREATE.
        let dbFloor = floor.id
          ? existingFloorsForReconcile.find((f: any) => f.id === floor.id)
          : undefined;
        if (!dbFloor) {
          dbFloor = existingFloorsForReconcile.find(
            (f: any) => !seenFloorIds.has(f.id) && (f.level ?? 0) === (floor.level || 0),
          );
        }
        // CREATE : id généré par Prisma — on n'honore jamais un `floor.id` étranger à cette config
        // (sinon collision de PK lors d'une duplication d'espace qui réutilise les ids d'origine).
        // Si `floor.id` appartenait à la config, `dbFloor` l'aurait déjà matché → UPDATE.
        const createdFloor = dbFloor
          ? await tx.floor.update({ where: { id: dbFloor.id }, data: floorData as any })
          : await tx.floor.create({ data: floorData as any });
        // Keep the JSON floor id in sync with the relational row (getConfiguration dedup par level).
        floor.id = createdFloor.id;
        seenFloorIds.add(createdFloor.id);

        // Éléments indépendants entre eux → en parallèle (pipelinés sur la connexion de la
        // transaction), sinon la latence pooler (~200ms) est payée en série par élément.
        await Promise.all(
          (floor.elements || []).map((element: any) =>
            this.reconcileElement(tx, element, { floorId: createdFloor.id }, seenElementIds, existingElementIdSet, config.id),
          ),
        );
      }

      // 4. Reconcile forecourt (UPSERT en place — id préservé)
      if (forecourt) {
        const forecourtData = {
          configId: config.id,
          name: forecourt.name || 'Parvis',
          width: forecourt.width || 1000,
          length: forecourt.length || 500,
        };
        let dbForecourt = forecourt.id
          ? existingForecourtsForReconcile.find((fc: any) => fc.id === forecourt.id)
          : existingForecourtsForReconcile.find((fc: any) => !seenForecourtIds.has(fc.id));
        // CREATE : id généré (jamais d'id forecourt étranger — cf. note floors ci-dessus).
        const createdForecourt = dbForecourt
          ? await tx.forecourt.update({ where: { id: dbForecourt.id }, data: forecourtData as any })
          : await tx.forecourt.create({ data: forecourtData as any });
        forecourt.id = createdForecourt.id;
        seenForecourtIds.add(createdForecourt.id);

        // Reconcile forecourt elements (en parallèle — cf. note floors)
        await Promise.all(
          (forecourt.elements || []).map((element: any) =>
            this.reconcileElement(tx, element, { forecourtId: createdForecourt.id }, seenElementIds, existingElementIdSet, config.id),
          ),
        );
      }

      // 4b. PRUNE : supprimer les éléments réellement retirés du payload, en épargnant TOUJOURS
      // les éléments protégés (mapping Weezevent) — remplace le delete global d'avant tout en
      // garantissant qu'aucun mapping ne devient orphelin.
      const elementsToDelete = existingElementIds.filter(
        (id) => !seenElementIds.has(id) && !protectedElementIds.has(id) && !v2ManagedIds.has(id),
      );
      if (elementsToDelete.length > 0) {
        await tx.spaceElement.deleteMany({ where: { id: { in: elementsToDelete } } });
      }
      // Floors absents du payload : supprimés seulement s'ils ne retiennent aucun élément protégé.
      for (const f of existingFloorsForReconcile) {
        if (seenFloorIds.has(f.id)) continue;
        if (!f.elements.some((e: any) => protectedElementIds.has(e.id) || v2ManagedIds.has(e.id))) {
          await tx.floor.delete({ where: { id: f.id } });
        }
      }
      // Forecourts : ne pruner que si le payload gère le forecourt (forecourt non-null),
      // pour préserver le comportement « null = ne pas toucher au parvis existant ».
      if (forecourt) {
        for (const fc of existingForecourtsForReconcile) {
          if (seenForecourtIds.has(fc.id)) continue;
          if (!fc.elements.some((e: any) => protectedElementIds.has(e.id) || v2ManagedIds.has(e.id))) {
            await tx.forecourt.delete({ where: { id: fc.id } });
          }
        }
      }

      // 5. Restaurer les MenuAssignment capturés en 2b pour les éléments recréés
      // (ids préservés). Seuls ceux dont l'élément existe encore sont ré-insérés ;
      // skipDuplicates respecte la contrainte @@unique([elementId, menuItemId, configId]).
      if (preservedAssignments.length > 0) {
        const assignmentElementIds = [
          ...new Set(preservedAssignments.map((a) => a.elementId).filter((id): id is string => !!id)),
        ];
        const stillExisting = await tx.spaceElement.findMany({
          where: { id: { in: assignmentElementIds } },
          select: { id: true },
        });
        const existingIds = new Set(stillExisting.map((e) => e.id));
        const toRestore = preservedAssignments.filter((a) => a.elementId && existingIds.has(a.elementId));
        if (toRestore.length > 0) {
          await tx.menuAssignment.createMany({
            data: toRestore.map((a) => ({
              elementId: a.elementId!,
              menuItemId: a.menuItemId,
              enabled: a.enabled,
              configId: a.configId, // scope config préservé (v1 : config du floor/forecourt parent)
            })),
            skipDuplicates: true,
          });
        }
      }

      // 6. Persist the reconciled JSON: floor/element ids generated by Prisma above were
      // written back into `floors`/`forecourt`, so re-saving config.data keeps the JSON
      // blob and the relational rows on the SAME ids. Without this, a floor created
      // without an id (3D Builder) keeps id=null in JSON while its relational row gets a
      // cuid → getConfiguration would otherwise emit duplicate floors at the same level.
      const reconciledData = { ...(dto.data || {}), floors };
      if (forecourt !== null) reconciledData.forecourt = forecourt;
      await tx.config.update({ where: { id: config.id }, data: { data: reconciledData } });

      // Return the config WITH the reconciled data so the caller (3D Builder) can adopt
      // the real floor/element ids instead of keeping its temporary client-side ones.
      return { ...config, data: reconciledData };
    }, {
      // Le reconcile émet ~1 requête par élément ; via le pooler Supabase (~200ms RTT),
      // une grosse config dépasse le timeout par défaut de 5s → « Transaction not found ».
      timeout: 30_000,
      maxWait: 10_000,
    });

    // Le builder crée/déplace/supprime des SpaceElements — invalide le cache shops/configs
    // de cet espace (jusqu'ici absent : la 3D Builder pouvait laisser /space-menus figé
    // jusqu'à expiration du TTL).
    await this.invalidateSpaceCache(tenantId, dto.spaceId);
    return result;
  }

  /**
   * Map frontend element type to Prisma ElementType enum
   * Frontend uses composite types like 'fnb-food', 'merch-temporary'
   * We map to the closest enum value or 'other' as fallback
   */
  private mapElementType(type: string): any {
    if (!type || typeof type !== 'string') return 'other';

    // Direct mappings
    const directMap: Record<string, string> = {
      'shop': 'shop',
      'storage': 'storage',
      'hospitality': 'hospitality',
      'access': 'access',
      'entertainment': 'entertainment',
      'entrance': 'entrance',
      'merchshop': 'merchshop',
      'kitchen': 'kitchen',
      'seating': 'seating',
      'stage': 'stage',
      'parking': 'parking',
      'restroom': 'restroom',
      'office': 'office',
      'other': 'other',
    };
    
    if (directMap[type]) return directMap[type];
    
    // F&B types
    if (type.startsWith('fnb-')) {
      const subType = type.replace('fnb-', '');
      const fnbMap: Record<string, string> = {
        'food': 'fnb_food',
        'beverages': 'fnb_beverages',
        'bar': 'fnb_bar',
        'snack': 'fnb_snack',
        'icecream': 'fnb_icecream',
        'beer': 'fnb_bar',
        'gppremium': 'fnb_food',
        'temporary': 'fnb_food',
        'drinkee': 'fnb_beverages',
      };
      return fnbMap[subType] || 'fnb_food';
    }
    
    // Merch types
    if (type.startsWith('merch-')) {
      return 'merchshop';
    }
    
    // Storage types
    if (type.startsWith('storage-')) {
      return 'storage';
    }
    
    // Hospitality types
    if (type.startsWith('hospitality-')) {
      return 'hospitality';
    }
    
    // Access types
    if (type.startsWith('access-')) {
      return 'access';
    }
    
    // Entertainment types  
    if (type.startsWith('entertainment-')) {
      return 'entertainment';
    }
    
    // Entrance types
    if (type.startsWith('entrance-')) {
      return 'entrance';
    }
    
    // Kitchen types
    if (type.startsWith('kitchen-')) {
      return 'kitchen';
    }
    
    return 'other';
  }

  /**
   * Map a frontend F&B sub-type (e.g. 'fnb-beverages') to the shopTypes tags
   * used by the 3D builder's shop type filter (food/beverages/beer/gppremium/temporary/drinkee).
   */
  private mapShopTypeTags(type?: string): string[] {
    if (!type || !type.startsWith('fnb-')) return [];
    const subType = type.replace('fnb-', '');
    const tagMap: Record<string, string> = {
      food: 'food',
      beverages: 'beverages',
      bar: 'beer',
      snack: 'food',
      icecream: 'food',
      beer: 'beer',
      gppremium: 'gppremium',
      temporary: 'temporary',
      drinkee: 'drinkee',
    };
    const tag = tagMap[subType];
    return tag ? [tag] : [];
  }

  /**
   * Set pinned spaces for a user (replace all)
   */
  async setPinnedSpaces(
    userId: string,
    tenantId: string,
    spaceIds: string[],
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>,
  ) {
    // Verify all spaces exist and belong to tenant
    const validSpaces = await this.prisma.space.findMany({
      where: {
        id: { in: spaceIds },
        tenantId,
      },
      select: { id: true },
    });

    const validSpaceIds = validSpaces.map((s) => s.id);

    // Delete all current pinned spaces for this user in this tenant
    await this.prisma.userPinnedSpace.deleteMany({
      where: {
        userId,
        space: {
          tenantId,
        },
      },
    });

    // Create new pinned spaces
    if (validSpaceIds.length > 0) {
      await this.prisma.userPinnedSpace.createMany({
        data: validSpaceIds.map((spaceId) => ({
          userId,
          spaceId,
        })),
      });
    }

    // Return updated pinned spaces
    return this.getPinned(userId, tenantId, user);
  }

  /**
   * Get a single configuration by ID
   * Optimized: Uses JSON blob for fast display, normalized tables for queries
   */
  async getConfiguration(configId: string, tenantId: string, user?: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>) {
    // Fast query - only get config with JSON data
    const config = await this.prisma.config.findFirst({
      where: {
        id: configId,
        space: {
          tenantId,
        },
      },
      select: {
        id: true,
        name: true,
        spaceId: true,
        capacity: true,
        isSystem: true,
        data: true,
        createdAt: true,
        updatedAt: true,
        space: {
          select: {
            id: true,
            name: true,
            tenantId: true,
          },
        },
      },
    });

    if (!config) {
      throw new NotFoundException(`Configuration with ID ${configId} not found`);
    }
    await this.assertSpaceAccess(config.spaceId, user);

    const jsonData = config.data as any;
    const rawJsonFloors: any[] = Array.isArray(jsonData?.floors) ? jsonData.floors : [];

    // Relational Floor/SpaceElement rows are the source of truth for elements created
    // outside the 3D Builder (Data Integration: quickCreateElement / assign-floor).
    const relationalFloors = await this.prisma.floor.findMany({
      where: { configId },
      include: { elements: true },
    });

    // ── Collapse floors by business key = `level` ───────────────────────────────
    // The Space Builder (front) dedupes floors by `level`; if this endpoint returns
    // two floors sharing the same level it silently keeps one and DROPS the other's
    // elements. That desync happens whenever a floor's id diverges between `config.data`
    // (JSON) and the relational `Floor` row — e.g. a 3D-Builder save that created the
    // floor without an id → generated cuid never written back to JSON, then Data
    // Integration adds shops under the relational id. To be robust to such data we merge
    // EVERYTHING into exactly one floor per level, combining all elements (deduped by id).
    const levelKey = (f: any): number =>
      typeof f?.level === 'number' && !Number.isNaN(f.level) ? f.level : 0;

    interface LevelBucket {
      base: any | null;             // geometry / hole / name (JSON when available)
      baseId?: string;              // a real floor id seen in the JSON for this level
      elements: Map<string, any>;   // element id → serialized element
      idlessElements: any[];        // JSON elements without an id (kept as-is)
      relFloors: { id: string; count: number }[];
    }
    const byLevel = new Map<number, LevelBucket>();
    const bucketFor = (lvl: number): LevelBucket => {
      let b = byLevel.get(lvl);
      if (!b) {
        b = { base: null, elements: new Map(), idlessElements: [], relFloors: [] };
        byLevel.set(lvl, b);
      }
      return b;
    };

    // 1. Seed from JSON floors (carry geometry + already-serialized elements).
    for (const jf of rawJsonFloors) {
      const b = bucketFor(levelKey(jf));
      if (!b.base) b.base = { ...jf, elements: [] };
      if (!b.baseId && jf.id) {
        b.baseId = jf.id;
        b.base = { ...b.base, ...jf, id: jf.id, elements: [] };
      }
      for (const el of jf.elements || []) {
        if (el?.id) {
          if (!b.elements.has(el.id)) b.elements.set(el.id, el);
        } else {
          b.idlessElements.push(el);
        }
      }
    }

    // 2. Merge relational floors + their elements.
    for (const relFloor of relationalFloors) {
      const b = bucketFor(relFloor.level ?? 0);
      b.relFloors.push({ id: relFloor.id, count: relFloor.elements.length });
      if (!b.base) {
        b.base = {
          id: relFloor.id,
          name: relFloor.name,
          level: relFloor.level ?? 0,
          width: relFloor.width ?? 800,
          height: relFloor.height ?? 600,
          length: relFloor.length ?? 100,
          elements: [],
          cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
          hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } },
        };
      }

      // Inject any relational element not yet present (deduped by id across both sources)
      for (const el of relFloor.elements) {
        if (b.elements.has(el.id)) continue;
        const attrs = el.attributes as any;
        b.elements.set(el.id, {
          id: el.id,
          name: el.name,
          type: attrs?.originalType ?? this.reverseMapElementType(el.type),
          x: el.x ?? 0,
          y: el.y ?? 0,
          width: el.width ?? 80,
          height: el.height ?? 60,
          depth: el.depth ?? 60,
          height3d: el.height3d ?? 25,
          rotation: el.rotation ?? 0,
          capacity: el.capacity ?? null,
          image: el.image ?? null,
          notes: el.notes ?? null,
          shopType: (el as any).shopTypes ?? [],
          storageType: (el as any).storageTypes ?? [],
          hospitalityType: (el as any).hospitalityTypes ?? [],
          accessType: (el as any).accessTypes ?? [],
          entertainmentType: (el as any).entertainmentTypes ?? [],
          entranceType: (el as any).entranceTypes ?? [],
          kitchenType: (el as any).kitchenTypes ?? [],
          attributes: attrs ?? {},
          cornerRadius: {
            topLeft: el.cornerRadiusTL ?? 0,
            topRight: el.cornerRadiusTR ?? 0,
            bottomLeft: el.cornerRadiusBL ?? 0,
            bottomRight: el.cornerRadiusBR ?? 0,
          },
        });
      }
    }

    // 3. Emit one floor per level. Canonical id = the relational floor that actually
    //    holds the most elements (so the next builder Save collapses the duplicate
    //    relational rows into it), else a real JSON id, else any relational id.
    const mergedFloors = [...byLevel.values()]
      .filter((b) => b.base)
      .map((b) => {
        const bestRel = [...b.relFloors].sort((a, c) => c.count - a.count)[0];
        const id =
          bestRel && bestRel.count > 0
            ? bestRel.id
            : b.baseId ?? bestRel?.id ?? b.base.id;
        return { ...b.base, id, elements: [...b.elements.values(), ...b.idlessElements] };
      });

    // Builder v2 : les éléments des Zones membres de cette config sont injectés en
    // LECTURE (EventPredict, StepMapShops, analyse…). saveConfiguration les re-filtre
    // du payload (managedByBuilderV2) — jamais modifiés par le chemin v1.
    const zoneElements = await this.fetchZoneElementsForSpace(config.spaceId);
    const mergedData = this.mergeZoneElementsIntoConfigData(
      {
        floors: mergedFloors,
        forecourt: jsonData?.forecourt || null,
        externalMerch: jsonData?.externalMerch || null,
      },
      zoneElements,
      configId,
    );

    return {
      id: config.id,
      name: config.name,
      spaceId: config.spaceId,
      capacity: config.capacity,
      isSystem: (config as any).isSystem ?? false,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      space: config.space,
      data: mergedData,
    };
  }

  /**
   * Transform a floor element from DB to frontend format
   */
  private transformElement(element: any) {
    // Use originalType from attributes if available, otherwise reverse map from enum
    const attrs = element.attributes as any;
    const originalType = attrs?.originalType || this.reverseMapElementType(element.type);
    
    return {
      id: element.id,
      name: element.name,
      type: originalType, // Return original frontend type
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      depth: element.depth,
      height3d: element.height3d,
      rotation: element.rotation,
      image: element.image,
      notes: element.notes,
      capacity: element.capacity,
      cornerRadius: {
        topLeft: element.cornerRadiusTL,
        topRight: element.cornerRadiusTR,
        bottomLeft: element.cornerRadiusBL,
        bottomRight: element.cornerRadiusBR,
      },
      shopType: element.shopTypes,
      storageType: element.storageTypes,
      hospitalityType: element.hospitalityTypes,
      accessType: element.accessTypes,
      entertainmentType: element.entertainmentTypes,
      entranceType: element.entranceTypes,
      kitchenType: element.kitchenTypes,
      tags: element.tags,
      attributes: element.attributes,
      // Light performance - only revenue for quick display
      performance: element.performance
        ? {
            revenue: element.performance.revenue,
            // Other fields loaded on-demand via getElementDetails
          }
        : null,
      // Staff and inventory loaded on-demand
      staffPositions: element.staffPositions?.map((s: any) => ({
        id: s.id,
        position: s.position,
        count: s.count,
        hourlyRate: s.hourlyRate,
      })) || [],
      inventoryItems: element.inventoryItems?.map((i: any) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        minStock: i.minStock,
        maxStock: i.maxStock,
        isCustom: i.isCustom,
        menuItemId: i.menuItemId,
      })) || [],
    };
  }

  /**
   * Reverse map Prisma ElementType enum to frontend type
   */
  private reverseMapElementType(type: string): string {
    const reverseMap: Record<string, string> = {
      'fnb_food': 'fnb-food',
      'fnb_beverages': 'fnb-beverages',
      'fnb_bar': 'fnb-bar',
      'fnb_snack': 'fnb-snack',
      'fnb_icecream': 'fnb-icecream',
      'shop': 'shop',
      'storage': 'storage',
      'hospitality': 'hospitality',
      'access': 'access',
      'entertainment': 'entertainment',
      'entrance': 'entrance',
      'merchshop': 'merchshop',
      'kitchen': 'kitchen',
      'seating': 'seating',
      'stage': 'stage',
      'parking': 'parking',
      'restroom': 'restroom',
      'office': 'office',
      'other': 'other',
    };
    return reverseMap[type] || type;
  }

  /**
   * Builder v2 → lecture v1 : sérialise un élément de Zone au format JSON v1
   * (consommé par EventPredict, SpacesPage, analyse store, StepMapShops…).
   * `managedByBuilderV2` le marque : saveConfiguration l'écarte de tout payload v1.
   */
  private serializeZoneElementForV1(el: any) {
    const attrs = (el.attributes as any) ?? {};
    return {
      id: el.id,
      name: el.name,
      type: attrs.originalType ?? this.reverseMapElementType(el.type),
      x: el.x ?? 0,
      y: el.y ?? 0,
      width: el.width ?? 2,
      height: el.height ?? el.depth ?? 2,
      depth: el.depth ?? 2,
      height3d: el.height3d ?? 2,
      rotation: el.rotation ?? 0,
      capacity: el.capacity ?? null,
      image: el.image ?? null,
      notes: el.notes ?? null,
      shopType: (el.subtypes?.length ? el.subtypes : el.shopTypes) ?? [],
      storageType: el.storageTypes ?? [],
      hospitalityType: el.hospitalityTypes ?? [],
      accessType: el.accessTypes ?? [],
      entertainmentType: el.entertainmentTypes ?? [],
      entranceType: el.entranceTypes ?? [],
      kitchenType: el.kitchenTypes ?? [],
      attributes: { ...attrs, area: el.area ?? attrs.area, managedByBuilderV2: true },
      configurationIds: (el.configurationElements ?? []).map((m: any) => m.configId),
      cornerRadius: {
        topLeft: el.cornerRadiusTL ?? 0,
        topRight: el.cornerRadiusTR ?? 0,
        bottomLeft: el.cornerRadiusBL ?? 0,
        bottomRight: el.cornerRadiusBR ?? 0,
      },
    };
  }

  /** Éléments v2 (zones) d'un espace, avec zone + adhésions — pour l'injection lecture v1. */
  private async fetchZoneElementsForSpace(spaceId: string) {
    return this.prisma.spaceElement.findMany({
      where: { zone: { spaceId } },
      include: {
        zone: true,
        configurationElements: { select: { configId: true } },
      },
    });
  }

  /**
   * Injecte les éléments v2 membres de `configId` dans un `config.data` v1 (floors /
   * forecourt / externalMerch) — sans muter l'original, dédupliqué par id. Les floors
   * manquants au niveau d'une Zone sont synthétisés depuis la Zone.
   */
  private mergeZoneElementsIntoConfigData(data: any, zoneElements: any[], configId: string) {
    const relevant = zoneElements.filter((el) =>
      (el.configurationElements ?? []).some((m: any) => m.configId === configId),
    );
    if (relevant.length === 0) return data;

    const out: any = { ...(data || {}) };
    const floors: any[] = Array.isArray(out.floors)
      ? out.floors.map((f: any) => ({ ...f, elements: [...(f.elements || [])] }))
      : [];
    let forecourt = out.forecourt ? { ...out.forecourt, elements: [...(out.forecourt.elements || [])] } : null;
    let externalMerch = out.externalMerch ? { ...out.externalMerch, elements: [...(out.externalMerch.elements || [])] } : null;

    const defaultHole = { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } };

    for (const el of relevant) {
      const zone = el.zone;
      if (!zone) continue;
      const serialized = this.serializeZoneElementForV1(el);

      if (zone.kind === 'FLOOR') {
        let floor = floors.find((f: any) => (f.level ?? 0) === (zone.level ?? 0));
        if (!floor) {
          floor = {
            id: zone.id,
            name: zone.name,
            level: zone.level ?? 0,
            width: zone.width ?? 100,
            height: zone.height ?? 4,
            length: zone.length ?? 100,
            elements: [],
            cornerRadius: (zone.geometry as any)?.cornerRadius ?? { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
            hole: (zone.geometry as any)?.hole ?? defaultHole,
          };
          floors.push(floor);
        }
        if (!Array.isArray(floor.elements)) floor.elements = [];
        if (!floor.elements.some((e: any) => e?.id === el.id)) floor.elements.push(serialized);
      } else if (zone.kind === 'FORECOURT') {
        if (!forecourt) {
          forecourt = { id: zone.id, name: zone.name, width: zone.width ?? 50, length: zone.length ?? 50, elements: [], cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } };
        }
        if (!forecourt.elements.some((e: any) => e?.id === el.id)) forecourt.elements.push(serialized);
      } else {
        if (!externalMerch) {
          externalMerch = { id: zone.id, name: zone.name, width: zone.width ?? 50, length: zone.length ?? 50, elements: [], cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } };
        }
        if (!externalMerch.elements.some((e: any) => e?.id === el.id)) externalMerch.elements.push(serialized);
      }
    }

    out.floors = floors;
    out.forecourt = forecourt;
    out.externalMerch = externalMerch;
    return out;
  }

  /**
   * Update a SpaceElement (shop) — name, image, type, shopTypes
   */
  async updateSpaceElement(elementId: string, tenantId: string, dto: { name?: string; image?: string; notes?: string; type?: string; shopTypes?: string[] }, user?: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>) {
    // Verify the element belongs to this tenant via its floor or forecourt → config → space
    const element = await this.prisma.spaceElement.findFirst({
      where: { id: elementId },
      include: {
        floor: { include: { config: { include: { space: true } } } },
        forecourt: { include: { config: { include: { space: true } } } },
        externalMerch: { include: { config: { include: { space: true } } } },
        zone: { include: { space: true } }, // Builder v2
      },
    });

    if (!element) {
      throw new NotFoundException(`SpaceElement ${elementId} not found`);
    }

    const space = element.floor?.config?.space ?? element.forecourt?.config?.space ?? element.externalMerch?.config?.space ?? (element as any).zone?.space;
    if (!space || space.tenantId !== tenantId) {
      throw new ForbiddenException(`SpaceElement ${elementId} does not belong to tenant`);
    }
    await this.assertSpaceAccess(space.id, user);

    const image = dto.image !== undefined ? await this.storage.resolveImage(dto.image, 'space-elements') : undefined;
    const updated = await this.prisma.spaceElement.update({
      where: { id: elementId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(image !== undefined && { image }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.type !== undefined && { type: dto.type as any }),
        ...(dto.shopTypes !== undefined && { shopTypes: dto.shopTypes }),
      },
    });

    await this.invalidateSpaceCache(tenantId, space.id);
    return updated;
  }

  /**
   * Builder v2 : trouve/crée la Zone (spaceId, kind, level) — cible des assignations
   * Data Integration sur les espaces gérés en v2.
   */
  private async ensureZone(
    spaceId: string,
    kind: 'FLOOR' | 'FORECOURT' | 'EXTERNAL',
    level: number,
    defaults: { name: string; width?: number; length?: number; height?: number },
  ) {
    const existing = await this.prisma.zone.findFirst({
      where: { spaceId, kind: kind as any, level },
    });
    if (existing) return existing;
    return this.prisma.zone.create({
      data: {
        spaceId,
        kind: kind as any,
        level,
        name: defaults.name,
        width: defaults.width ?? 200,
        length: defaults.length ?? 200,
        height: defaults.height ?? (kind === 'FLOOR' ? 4 : 0),
      },
    });
  }

  /**
   * Dimensions du dialogue « Assigner un étage » → patch de la Zone v2 cible.
   * `ensureZone` ne les applique qu'à la CRÉATION : sur une zone existante elles
   * étaient silencieusement perdues (le 3D Builder gardait les anciennes dimensions).
   */
  private zoneDimensionsPatch(
    zone: { width: number | null; length: number | null; height: number | null },
    opts: { width?: number; length?: number; height?: number },
  ) {
    const patch: { width?: number; length?: number; height?: number } = {};
    if (opts.width !== undefined && opts.width !== zone.width) patch.width = opts.width;
    if (opts.length !== undefined && opts.length !== zone.length) patch.length = opts.length;
    if (opts.height !== undefined && opts.height !== zone.height) patch.height = opts.height;
    return patch;
  }

  /**
   * Résout la configuration cible des opérations d'assignation (quick-element, assign-floor,
   * forecourt, externalMerch) de l'étape 2 de l'intégration.
   *
   * Contrat STRICT (aucune création de config par défaut / « Weezevent Import », jamais) :
   *  1. `configId` explicite (config choisie au sélecteur d'étage / 3D Builder) → utilisée.
   *  2. Sinon, la config UTILISATEUR principale (la plus ancienne `isSystem = false`),
   *     c.-à-d. celle créée à l'étape 1 ou dans le 3D Builder.
   *  3. Sinon → erreur 400. On NE crée RIEN : pas de config « Weezevent Import », pas de
   *     config par défaut. L'utilisateur doit d'abord créer une config (étape 1 / 3D Builder).
   */
  private async resolveTargetConfig(spaceId: string, configId?: string) {
    if (configId) {
      const explicit = await this.prisma.config.findFirst({
        where: { id: configId, spaceId, isSystem: false },
      });
      if (explicit) return explicit;
    }

    const userConfig = await this.prisma.config.findFirst({
      where: { spaceId, isSystem: false },
      orderBy: { createdAt: 'asc' },
    });
    if (userConfig) return userConfig;

    throw new BadRequestException(
      "Aucune configuration pour cet espace. Créez-en une à l'étape 1 ou dans le 3D Builder " +
        "avant d'assigner ou de créer des shops. (Aucune configuration « Weezevent Import » n'est créée.)",
    );
  }

  /**
   * Position en grille (en mètres) pour le `index`-ième shop d'une zone, afin d'éviter
   * que tous les shops importés s'empilent à l'origine. Pas de 10 m, en partant de (5,5).
   */
  private gridPosition(index: number, areaWidth = 200): { x: number; y: number } {
    const STEP = 10;
    const MARGIN = 5;
    const cols = Math.max(1, Math.floor((areaWidth - MARGIN) / STEP));
    const col = index % cols;
    const row = Math.floor(index / cols);
    return { x: MARGIN + col * STEP, y: MARGIN + row * STEP };
  }

  /**
   * Géométrie (position en rangée + dimensions) à appliquer au `index`-ième élément
   * d'une assignation venant du dialogue « Assigner un étage » (étape 2). Les shops
   * sont posés côte à côte à partir de `position` (pas de `width + 1` m).
   */
  private elementGeometryData(
    index: number,
    position?: { x: number; y: number },
    dims?: { width?: number; depth?: number; height?: number },
  ): Record<string, number> {
    const data: Record<string, number> = {};
    if (dims?.width != null) data.width = dims.width;
    if (dims?.depth != null) data.depth = dims.depth;
    if (dims?.height != null) {
      data.height = dims.height;
      data.height3d = dims.height;
    }
    if (position) {
      const w = dims?.width ?? 4;
      data.x = position.x + index * (w + 1);
      data.y = position.y;
    }
    return data;
  }

  /**
   * Liste LÉGÈRE des zones/étages disponibles pour le dialogue « Assigner un étage »
   * (étape 2 Data Integration) — remplace la lecture de getConfiguration (fusion
   * complète) qui, en plus d'être lourde, faisait disparaître les zones VIDES.
   *
   * v2 D'ABORD : la table Zone (par espace) est la source de vérité — toutes les
   * zones sont retournées, y compris vides. Le bloc v1 (Floor relationnel + JSON
   * config.data) est legacy : il ne complète que les levels sans Zone v2 et
   * disparaîtra avec la fin de la migration.
   */
  async getFloorOptions(spaceId: string, tenantId: string, configId?: string) {
    const elementSelect = { id: true, name: true, x: true, y: true, width: true, depth: true } as const;
    const serializeJsonEl = (el: any) => ({
      id: el?.id ?? null, name: el?.name ?? '', x: el?.x ?? null, y: el?.y ?? null,
      width: el?.width ?? null, depth: el?.depth ?? null,
    });

    // Toutes les lectures sont indépendantes → UN aller-retour réseau (DB distante).
    const [space, zones, relFloors, legacyConfig] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { id: true } }),
      // ── v2 (prioritaire) : toutes les zones de l'espace, même vides ──
      this.prisma.zone.findMany({
        where: { spaceId, space: { tenantId } },
        orderBy: { level: 'asc' },
        include: { elements: { select: elementSelect } },
      }),
      configId
        ? this.prisma.floor.findMany({
            where: { configId, config: { spaceId, space: { tenantId } } },
            include: { elements: { select: elementSelect } },
          })
        : Promise.resolve([]),
      configId
        ? this.prisma.config.findFirst({
            where: { id: configId, spaceId, space: { tenantId } },
            select: { data: true },
          })
        : Promise.resolve(null),
    ]);
    if (!space) throw new NotFoundException('Space not found or access denied');

    const floors: any[] = [];
    let forecourt: any = null;
    let externalMerch: any = null;
    for (const z of zones) {
      const entry = {
        id: z.id, name: z.name, level: z.level,
        width: z.width, length: z.length, height: z.height,
        elements: z.elements, source: 'v2',
      };
      if (z.kind === 'FLOOR') floors.push(entry);
      else if (z.kind === 'FORECOURT') forecourt = forecourt ?? entry;
      else externalMerch = externalMerch ?? entry;
    }

    // ── LEGACY v1 (à supprimer avec la migration) : Floor relationnel + JSON de la
    //    config (préchargés dans le batch pré-vol) — uniquement pour les levels/zones
    //    non couverts par une Zone v2. ──
    if (configId) {
      const jsonData = (legacyConfig?.data as any) || {};
      const v2Levels = new Set(floors.map((f) => f.level));
      const byLevel = new Map<number, any>();

      for (const jf of Array.isArray(jsonData.floors) ? jsonData.floors : []) {
        const lvl = typeof jf?.level === 'number' && !Number.isNaN(jf.level) ? jf.level : 0;
        if (v2Levels.has(lvl)) continue;
        let b = byLevel.get(lvl);
        if (!b) {
          b = {
            id: jf.id ?? null, name: jf.name ?? '', level: lvl,
            width: jf.width ?? 100, length: jf.length ?? 100, height: jf.height ?? 4,
            elements: [], source: 'v1',
          };
          byLevel.set(lvl, b);
        }
        for (const el of jf.elements || []) {
          if (el?.id && !b.elements.some((e: any) => e.id === el.id)) b.elements.push(serializeJsonEl(el));
        }
      }
      for (const rf of relFloors) {
        const lvl = rf.level ?? 0;
        if (v2Levels.has(lvl)) continue;
        let b = byLevel.get(lvl);
        if (!b) {
          b = {
            id: rf.id, name: rf.name, level: lvl,
            width: rf.width ?? 100, length: rf.length ?? 100, height: rf.height ?? 4,
            elements: [], source: 'v1',
          };
          byLevel.set(lvl, b);
        }
        for (const el of rf.elements) {
          if (!b.elements.some((e: any) => e.id === el.id)) b.elements.push(el);
        }
      }
      floors.push(...byLevel.values());

      if (!forecourt && jsonData.forecourt) {
        const fc = jsonData.forecourt;
        forecourt = {
          id: fc.id ?? null, name: fc.name ?? 'Parvis', level: 0,
          width: fc.width ?? 50, length: fc.length ?? 50, height: fc.height ?? 4,
          elements: (fc.elements || []).map(serializeJsonEl), source: 'v1',
        };
      }
      if (!externalMerch && jsonData.externalMerch) {
        const em = jsonData.externalMerch;
        externalMerch = {
          id: em.id ?? null, name: em.name ?? 'External', level: 0,
          width: em.width ?? 50, length: em.length ?? 50, height: em.height ?? 4,
          elements: (em.elements || []).map(serializeJsonEl), source: 'v1',
        };
      }
    }

    floors.sort((a, b) => a.level - b.level);
    return { managedByV2: zones.length > 0, floors, forecourt, externalMerch };
  }

  /**
   * A21 — Read-modify-write de `config.data` avec verrou optimiste (champ `version`).
   * `mutate` reçoit le `data` JSON courant (relu à chaque tentative) et retourne le nouveau `data`.
   * L'écriture n'aboutit que si `version` n'a pas changé entre la lecture et l'écriture ;
   * sinon on relit et on ré-applique `mutate` (jusqu'à `maxRetries`). À la dernière tentative,
   * écriture inconditionnelle (last-write-wins) pour ne jamais perdre la mutation.
   */
  private async updateConfigDataOptimistic(
    configId: string,
    mutate: (currentData: any) => any | Promise<any>,
    maxRetries = 3,
  ): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const fresh = await this.prisma.config.findFirst({
        where: { id: configId },
        select: { data: true, version: true },
      });
      if (!fresh) throw new NotFoundException(`Configuration ${configId} not found`);

      const newData = await mutate((fresh.data as any) || {});
      const isLastAttempt = attempt === maxRetries;

      const res = await this.prisma.config.updateMany({
        // Dernière tentative : on retombe sur un update inconditionnel (last-write-wins).
        where: isLastAttempt ? { id: configId } : { id: configId, version: fresh.version },
        data: { data: newData, version: { increment: 1 } },
      });
      if (res.count >= 1) return;
      // Conflit concurrent (version a changé) → on retente.
    }
  }

  /**
   * Quick-create a SpaceElement (shop) for a space without needing the floor plan editor.
   * Le shop est créé dans la configuration UTILISATEUR de l'espace (étape 1 / 3D Builder),
   * résolue par `resolveTargetConfig` — plus de config auto-générée « Weezevent Import »
   * tant qu'une config utilisateur existe.
   */
  async quickCreateElement(spaceId: string, tenantId: string, dto: { name: string; type?: string }, user?: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>) {
    // Lectures pré-vol INDÉPENDANTES → un seul aller-retour réseau (DB distante).
    const [space, config, prefetchedZone, count] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId } }),
      // Cible : la configuration utilisateur (étape 1 / 3D Builder), pas « Weezevent Import ».
      this.resolveTargetConfig(spaceId, (dto as any).configId),
      this.prisma.zone.findFirst({ where: { spaceId, kind: 'FLOOR' as any, level: 0 } }),
      this.prisma.spaceElement.count({ where: { zone: { spaceId, kind: 'FLOOR' as any, level: 0 } } }),
    ]);
    if (!space) throw new NotFoundException('Space not found or access denied');
    await this.assertSpaceAccess(space.id, user);

    // v2 D'ABORD (bug étape 2 : bulk/quick-create invisibles dans builder2) : les
    // créations Data Integration atterrissent TOUJOURS en v2 — zone RDC créée au
    // besoin, adhésion à la config cible. Le chemin v1 n'accueille plus de nouveaux
    // éléments ici ; le builder v1 les AFFICHE via l'injection lecture de
    // getConfiguration (managedByBuilderV2).
      const zone = prefetchedZone ?? await this.ensureZone(spaceId, 'FLOOR', 0, {
        name: 'RDC', width: 100, length: 100, height: 4,
      });
      const v2Type = this.mapElementType(dto.type || 'shop');
      const v2Tags = this.mapShopTypeTags(dto.type);
      const pos = this.gridPosition(count, zone.width ?? 200);
      const created = await this.prisma.spaceElement.create({
        data: {
          zoneId: zone.id,
          name: dto.name,
          type: v2Type,
          subtypes: v2Tags,
          shopTypes: v2Tags,
          x: pos.x,
          y: pos.y,
          width: 2,
          height: 2,
          depth: 2,
          height3d: 2,
          area: (dto as any).area ?? null,
          attributes: { originalType: dto.type || 'shop', importedFromWeezevent: true },
        } as any,
      });
      await this.prisma.configurationElement.createMany({
        data: [{ configId: config.id, elementId: created.id }],
        skipDuplicates: true,
      });
      await this.invalidateSpaceCache(space.tenantId, spaceId);
      return {
        id: created.id,
        name: created.name,
        type: dto.type || 'shop',
        configName: config.name,
        areaName: zone.name,
      };
  }

  /**
   * Bulk « créer & mapper » de l'étape 2 Data Integration — remplace la boucle front
   * quick-element + location-shop unitaires (2 allers-retours HTTP par location).
   *
   * - item AVEC `elementId` : mapping seul vers l'élément existant (vérifié tenant, 1 requête
   *   pour tout le lot) — rien n'est créé.
   * - item SANS `elementId` : création d'un SpaceElement (mêmes règles que quickCreateElement :
   *   zone RDC niveau 0, 2×2×2 m, positions en grille) puis mapping.
   *
   * Config cible et zone RDC résolues UNE fois pour le lot ; créations puis upserts de
   * mappings chacun en une transaction (forme tableau → résultats dans l'ordre des items) ;
   * une seule invalidation de cache à la fin.
   */
  async bulkQuickCreateAndMap(
    spaceId: string,
    tenantId: string,
    dto: { configId?: string; items: Array<{ weezeventLocationId: string; name: string; type?: string; elementId?: string }> },
  ) {
    const toMap = dto.items.filter((i) => i.elementId);
    const toCreate = dto.items.filter((i) => !i.elementId);
    const errors: Array<{ weezeventLocationId: string; error: string }> = [];

    // 1. Lectures pré-vol INDÉPENDANTES → un seul aller-retour réseau (la DB distante
    //    coûte ~600 ms PAR requête en dev local ; ne jamais les enchaîner).
    const [space, foundExisting, resolvedConfig, prefetchedZone, baseCount] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId } }),
      // Cibles existantes : une seule requête de vérification d'appartenance tenant.
      toMap.length
        ? this.prisma.spaceElement.findMany({
            where: {
              id: { in: toMap.map((i) => i.elementId as string) },
              OR: [
                { floor: { config: { space: { tenantId } } } },
                { forecourt: { config: { space: { tenantId } } } },
                { externalMerch: { config: { space: { tenantId } } } },
                { zone: { space: { tenantId } } }, // Builder v2
              ],
            },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      toCreate.length ? this.resolveTargetConfig(spaceId, dto.configId) : Promise.resolve(null),
      toCreate.length
        ? this.prisma.zone.findFirst({ where: { spaceId, kind: 'FLOOR' as any, level: 0 } })
        : Promise.resolve(null),
      toCreate.length
        ? this.prisma.spaceElement.count({ where: { zone: { spaceId, kind: 'FLOOR' as any, level: 0 } } })
        : Promise.resolve(0),
    ]);
    if (!space) throw new NotFoundException('Space not found or access denied');

    const existingById = new Map<string, { id: string; name: string }>();
    for (const e of foundExisting) existingById.set(e.id, e);

    // 2. Créations en lot dans la zone RDC de la config cible.
    const config: { id: string; name: string } | null = resolvedConfig;
    let zone: { id: string; name: string; level: number; width: number | null } | null = prefetchedZone;
    let created: Array<{ id: string; name: string }> = [];
    if (toCreate.length) {
      if (!zone) {
        zone = await this.ensureZone(spaceId, 'FLOOR', 0, { name: 'RDC', width: 100, length: 100, height: 4 });
      }
      created = await this.prisma.$transaction(
        toCreate.map((item, idx) => {
          const pos = this.gridPosition(baseCount + idx, zone!.width ?? 200);
          const v2Tags = this.mapShopTypeTags(item.type);
          return this.prisma.spaceElement.create({
            data: {
              zoneId: zone!.id,
              name: item.name,
              type: this.mapElementType(item.type || 'shop'),
              subtypes: v2Tags,
              shopTypes: v2Tags,
              x: pos.x,
              y: pos.y,
              width: 2,
              height: 2,
              depth: 2,
              height3d: 2,
              attributes: { originalType: item.type || 'shop', importedFromWeezevent: true },
            } as any,
            select: { id: true, name: true },
          });
        }),
      );
    }

    // 3. Adhésions + upserts des mappings dans UNE transaction (un seul pipeline réseau).
    const pairs: Array<{ weezeventLocationId: string; elementId: string; elementName: string; created: boolean }> = [];
    for (const item of toMap) {
      const found = existingById.get(item.elementId as string);
      if (!found) {
        errors.push({ weezeventLocationId: item.weezeventLocationId, error: `SpaceElement ${item.elementId} not found` });
        continue;
      }
      pairs.push({ weezeventLocationId: item.weezeventLocationId, elementId: found.id, elementName: found.name, created: false });
    }
    toCreate.forEach((item, idx) => {
      pairs.push({ weezeventLocationId: item.weezeventLocationId, elementId: created[idx].id, elementName: created[idx].name, created: true });
    });
    const writes: any[] = [];
    if (created.length) {
      writes.push(
        this.prisma.configurationElement.createMany({
          data: created.map((e) => ({ configId: config!.id, elementId: e.id })),
          skipDuplicates: true,
        }),
      );
    }
    writes.push(
      ...pairs.map((p) =>
        this.prisma.locationShopMapping.upsert({
          where: { tenantId_salesLocationId: { tenantId, salesLocationId: p.weezeventLocationId } },
          create: { tenantId, salesLocationId: p.weezeventLocationId, spaceElementId: p.elementId },
          update: { spaceElementId: p.elementId },
        }),
      ),
    );
    if (writes.length) await this.prisma.$transaction(writes);

    await this.invalidateSpaceCache(space.tenantId, spaceId);

    return {
      total: dto.items.length,
      createdCount: created.length,
      mappedCount: pairs.length,
      failed: errors.length,
      errors,
      configName: config?.name ?? null,
      areaName: zone?.name ?? null,
      floorLevel: zone?.level ?? null,
      mapped: pairs.map((p) => ({
        weezeventLocationId: p.weezeventLocationId,
        elementId: p.elementId,
        elementName: p.elementName,
        created: p.created,
        configName: p.created ? config?.name ?? null : null,
        areaName: p.created ? zone?.name ?? null : null,
        floorLevel: p.created ? zone?.level ?? 0 : null,
      })),
    };
  }

  /**
   * BUG-23 — Journalise la bascule v1→v2 lorsqu'un espace "v1 pur" route une assignation
   * en v2 uniquement parce qu'au moins une `Zone` existe déjà pour cet espace (ex. créée
   * par un `quick-element` antérieur). Purement observabilité : ne change AUCUN
   * comportement de routage, ne fait que rendre la bascule visible en log (cf.
   * docs/bugs/23_bascule_silencieuse_v1_v2_assign_floor.md).
   */
  private logBuilderV2Switch(
    origin: 'assignElementsToFloorLevel' | 'assignElementsToForecourt' | 'assignElementsToExternalMerch',
    spaceId: string,
    tenantId: string,
    zoneCount: number,
  ): void {
    this.logger.warn(
      `[BUG-23] Bascule v1→v2 (builderVersion=v2) pour spaceId=${spaceId} tenantId=${tenantId} ` +
        `dans ${origin} : l'espace possède déjà ${zoneCount} zone(s), toute nouvelle assignation ` +
        `est routée en v2 même si l'utilisateur n'a jamais ouvert le builder v2.`,
    );
  }

  /**
   * Assign a list of SpaceElements to a given floor level (or to the forecourt/"Parvis")
   * within the same space. Le Floor/Forecourt est trouvé/créé dans la configuration cible
   * (`opts.configId`, sinon la config utilisateur principale via `resolveTargetConfig`).
   */
  async assignElementsToFloorLevel(
    spaceId: string,
    tenantId: string,
    elementIds: string[],
    level: number | 'forecourt' | 'externalmerch',
    opts: {
      configId?: string;
      width?: number;
      length?: number;
      height?: number;
      zoneName?: string;
      position?: { x: number; y: number };
      shopDimensions?: { width?: number; depth?: number; height?: number };
    } = {},
  ) {
    if (level === 'forecourt') {
      return this.assignElementsToForecourt(spaceId, tenantId, elementIds, opts);
    }
    if (level === 'externalmerch') {
      return this.assignElementsToExternalMerch(spaceId, tenantId, elementIds, opts);
    }
    // Garde défensive : tout `level` non géré ci-dessus doit être un entier (RDC=0,
    // étages positifs, sous-sols négatifs). Le DTO valide déjà ce contrat — cette garde
    // évite un 500 Prisma (`level` Int) si l'endpoint est appelé hors validation.
    if (typeof level !== 'number' || !Number.isInteger(level)) {
      throw new BadRequestException(`level invalide: ${String(level)} (entier, 'forecourt' ou 'externalmerch' attendu)`);
    }

    // Resolve floor name from level
    let floorName: string;
    if (level === 0) floorName = 'RDC';
    else if (level < 0) floorName = `Sous-sol ${Math.abs(level)}`;
    else floorName = `Étage ${level}`;

    // Lectures pré-vol INDÉPENDANTES → un seul aller-retour réseau. En dev local la
    // DB (pooler Supabase eu-west-1) coûte ~600 ms PAR requête : les enchaîner
    // séquentiellement faisait exploser la latence de l'endpoint.
    const [space, config, zoneCount, prefetchedZone, verified] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId } }),
      // Cible : la config utilisateur (étape 1 / 3D Builder), pas « Weezevent Import ».
      this.resolveTargetConfig(spaceId, opts.configId),
      // Espace géré en v2 → toute assignation ADOPTE l'élément en v2 (zone + adhésion).
      this.prisma.zone.count({ where: { spaceId } }),
      this.prisma.zone.findFirst({ where: { spaceId, kind: 'FLOOR' as any, level } }),
      // Vérification d'appartenance en UNE requête pour tout le lot (au lieu de N
      // findFirst à 4 includes imbriqués). L'ordre d'entrée est préservé : les
      // positions en rangée (opts.position) en dépendent.
      this.prisma.spaceElement.findMany({
        where: {
          id: { in: elementIds },
          OR: [
            { floor: { config: { space: { id: spaceId, tenantId } } } },
            { forecourt: { config: { space: { id: spaceId, tenantId } } } },
            { externalMerch: { config: { space: { id: spaceId, tenantId } } } },
            { zone: { space: { id: spaceId, tenantId } } }, // Builder v2
          ],
        },
        select: { id: true, zoneId: true, floorId: true },
      }),
    ]);
    if (!space) throw new NotFoundException('Space not found or access denied');
    const spaceHasZones = zoneCount > 0;
    if (spaceHasZones) {
      this.logBuilderV2Switch('assignElementsToFloorLevel', spaceId, tenantId, zoneCount);
    }

    // Containers PARESSEUX : le Floor v1 n'est créé que si un élément v1 doit y aller
    // (ne pas polluer un espace géré en v2), la Zone v2 que si un élément v2 arrive.
    let floor: any = null;
    const ensureV1Floor = async () => {
      if (floor) return floor;
      floor = await this.prisma.floor.findFirst({ where: { configId: config.id, level } });
      if (!floor) {
        floor = await this.prisma.floor.create({
          data: {
            configId: config.id,
            name: floorName,
            level,
            width: opts.width ?? 200,
            height: opts.height ?? 4,
            length: opts.length ?? 200,
          },
        });
      }
      return floor;
    };
    let targetZone: any = prefetchedZone; // déjà lue dans le batch pré-vol
    const ensureTargetZone = async () => {
      if (targetZone) return targetZone;
      targetZone = await this.ensureZone(spaceId, 'FLOOR', level, {
        name: floorName, width: opts.width, length: opts.length, height: opts.height,
      });
      return targetZone;
    };

    const verifiedById = new Map(verified.map((e) => [e.id, e]));
    const orderedElements = elementIds
      .map((id) => verifiedById.get(id))
      .filter((e): e is (typeof verified)[number] => !!e);

    const updated: string[] = [];
    const updatedV2: string[] = [];
    // Track which source floors lost elements (for JSON sync)
    const movedElements: Array<{ id: string; sourceFloorId: string | null }> = [];
    const zoneName = opts.zoneName?.trim() || null;

    if (orderedElements.length && spaceHasZones) {
      // ── v2 (PRIORITAIRE) : zone cible unique, puis TOUTES les écritures (renommage,
      //    updates avec géométrie du dialogue, adhésions) dans UNE transaction — un
      //    seul pipeline réseau au lieu de 3 allers-retours et plus. ──
      const zone = await ensureTargetZone();
      const writes: any[] = [];
      const zonePatch: any = this.zoneDimensionsPatch(zone, opts);
      if (zoneName && zoneName !== zone.name) zonePatch.name = zoneName;
      if (Object.keys(zonePatch).length) {
        writes.push(this.prisma.zone.update({ where: { id: zone.id }, data: zonePatch }));
        Object.assign(zone, zonePatch);
      }
      writes.push(
        ...orderedElements.map((el, i) =>
          this.prisma.spaceElement.update({
            where: { id: el.id },
            data: {
              zoneId: zone.id,
              floorId: null,
              forecourtId: null,
              externalMerchId: null,
              ...this.elementGeometryData(i, opts.position, opts.shopDimensions),
            },
          }),
        ),
      );
      writes.push(
        this.prisma.configurationElement.createMany({
          data: orderedElements.map((el) => ({ configId: config.id, elementId: el.id })),
          skipDuplicates: true,
        }),
      );
      await this.prisma.$transaction(writes);
      updatedV2.push(...orderedElements.map((el) => el.id));
    } else if (orderedElements.length) {
      // ── LEGACY v1 (à supprimer avec la fin de la migration v2) : Floor relationnel
      //    + sync JSON plus bas. Comportement historique conservé. ──
      for (const [i, element] of orderedElements.entries()) {
        await ensureV1Floor();
        movedElements.push({ id: element.id, sourceFloorId: element.floorId ?? null });

        await this.prisma.spaceElement.update({
          where: { id: element.id },
          data: {
            floorId: floor.id,
            forecourtId: null,
            externalMerchId: null,
            ...this.elementGeometryData(i, opts.position, opts.shopDimensions),
          },
        });
        updated.push(element.id);
      }
      if (zoneName && floor && zoneName !== floor.name) {
        await this.prisma.floor.update({ where: { id: floor.id }, data: { name: zoneName } });
        floor.name = zoneName;
      }
    }

    // Sync config.data JSON: move elements from their source floor to the target floor
    if (updated.length > 0) {
      await this.updateConfigDataOptimistic(config.id, async (currentData) => {
        const jsonFloors: any[] = Array.isArray(currentData.floors) ? [...currentData.floors] : [];

        // Remove moved elements from their source floors in the JSON
        const movedIds = new Set(updated);
        for (const jsonFloorEntry of jsonFloors) {
          if (Array.isArray(jsonFloorEntry.elements)) {
            jsonFloorEntry.elements = jsonFloorEntry.elements.filter((e: any) => !movedIds.has(e.id));
          }
        }

        // Ensure the target floor entry exists in JSON
        let targetJsonFloor = jsonFloors.find((f: any) => f.id === floor.id);
        if (!targetJsonFloor) {
          targetJsonFloor = {
            id: floor.id,
            name: floor.name,
            level: floor.level ?? level,
            width: floor.width ?? 200,
            height: floor.height ?? 4,
            length: floor.length ?? 200,
            elements: [],
            cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
            hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } },
          };
          jsonFloors.push(targetJsonFloor);
        }
        if (!Array.isArray(targetJsonFloor.elements)) targetJsonFloor.elements = [];

        // Find element JSON entries from all floors (they were in JSON after quickCreateElement)
        const allElements: any[] = [];
        for (const jf of jsonFloors) {
          if (Array.isArray(jf.elements)) allElements.push(...jf.elements);
        }

        for (const movedEl of movedElements) {
          if (!updated.includes(movedEl.id)) continue;
          // Reuse the existing JSON representation if available, otherwise create a minimal stub
          const existing = allElements.find((e: any) => e.id === movedEl.id);
          if (existing && !targetJsonFloor.elements.find((e: any) => e.id === movedEl.id)) {
            targetJsonFloor.elements.push(existing);
          } else if (!existing) {
            const relElement = await this.prisma.spaceElement.findFirst({ where: { id: movedEl.id } });
            if (relElement) {
              const attrs = relElement.attributes as any;
              targetJsonFloor.elements.push({
                id: relElement.id,
                name: relElement.name,
                type: attrs?.originalType ?? 'shop',
                x: relElement.x ?? 0,
                y: relElement.y ?? 0,
                width: relElement.width ?? 2,
                height: relElement.height ?? 2,
                depth: relElement.depth ?? 2,
                shopType: (relElement as any).shopTypes ?? [],
                storageType: (relElement as any).storageTypes ?? [],
                hospitalityType: (relElement as any).hospitalityTypes ?? [],
                accessType: (relElement as any).accessTypes ?? [],
                entertainmentType: (relElement as any).entertainmentTypes ?? [],
                entranceType: (relElement as any).entranceTypes ?? [],
                kitchenType: (relElement as any).kitchenTypes ?? [],
                attributes: attrs ?? {},
                cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
              });
            }
          }
        }

        // Nom + géométrie du dialogue répercutés dans le JSON v1 (remplace le
        // getConfiguration + updateConfiguration full-save que faisait le front).
        if (zoneName) targetJsonFloor.name = zoneName;
        if (opts.position || opts.shopDimensions) {
          const geomById = new Map(updated.map((id, i) => [id, this.elementGeometryData(i, opts.position, opts.shopDimensions)]));
          for (const jsonEl of targetJsonFloor.elements) {
            const g = jsonEl?.id ? geomById.get(jsonEl.id) : undefined;
            if (!g) continue;
            if (g.x !== undefined) jsonEl.x = g.x;
            if (g.y !== undefined) jsonEl.y = g.y;
            if (g.width !== undefined) jsonEl.width = g.width;
            if (g.depth !== undefined) jsonEl.depth = g.depth;
            if (g.height !== undefined) jsonEl.height = g.height;
          }
        }

        // Remove empty source floors from JSON to keep it clean
        const cleanedJsonFloors = jsonFloors.filter(
          (f: any) => f.id === floor.id || (Array.isArray(f.elements) && f.elements.length > 0),
        );

        return { ...currentData, floors: cleanedJsonFloors };
      });

      await this.invalidateSpaceCache(tenantId, spaceId);
    } else if (updatedV2.length > 0) {
      await this.invalidateSpaceCache(tenantId, spaceId);
    }

    // Réponse en union discriminée (`kind`) cohérente entre floor / forecourt / externalmerch.
    // `builderVersion` (BUG-23) : champ additif indiquant le routage effectif de cet appel,
    // pour que le frontend/debug n'ait plus à le déduire silencieusement du payload.
    return {
      kind: 'floor' as const,
      floorId: floor?.id ?? targetZone?.id ?? null,
      floorName: zoneName ?? floorName,
      level,
      updatedElementIds: [...updated, ...updatedV2],
      builderVersion: spaceHasZones ? ('v2' as const) : ('v1' as const),
    };
  }

  /**
   * Assign a list of SpaceElements to the forecourt ("Parvis") of the element's
   * "Weezevent Import" config. Finds or creates the Forecourt if needed.
   */
  private async assignElementsToForecourt(
    spaceId: string,
    tenantId: string,
    elementIds: string[],
    opts: {
      configId?: string;
      width?: number;
      length?: number;
      zoneName?: string;
      position?: { x: number; y: number };
      shopDimensions?: { width?: number; depth?: number; height?: number };
    } = {},
  ) {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId } });
    if (!space) throw new NotFoundException('Space not found or access denied');

    // Cible : la config utilisateur (étape 1 / 3D Builder), pas « Weezevent Import ».
    const config = await this.resolveTargetConfig(spaceId, opts.configId);
    // Espace géré en v2 → toute assignation ADOPTE l'élément en v2 (zone + adhésion).
    const zoneCount = await this.prisma.zone.count({ where: { spaceId } });
    const spaceHasZones = zoneCount > 0;
    if (spaceHasZones) {
      this.logBuilderV2Switch('assignElementsToForecourt', spaceId, tenantId, zoneCount);
    }

    // Containers PARESSEUX (cf. assignElementsToFloorLevel) : v1 Forecourt / v2 Zone.
    let forecourt: any = null;
    const ensureV1Forecourt = async () => {
      if (forecourt) return forecourt;
      forecourt = await this.prisma.forecourt.findUnique({ where: { configId: config.id } });
      if (!forecourt) {
        forecourt = await this.prisma.forecourt.create({
          data: { configId: config.id, name: 'Parvis', width: opts.width ?? 200, length: opts.length ?? 200 },
        });
      }
      return forecourt;
    };
    let targetZone: any = null;
    const ensureTargetZone = async () => {
      if (targetZone) return targetZone;
      targetZone = await this.ensureZone(spaceId, 'FORECOURT', 0, {
        name: 'Parvis', width: opts.width, length: opts.length,
      });
      return targetZone;
    };

    // Verify all elements belong to this tenant's space, then move them to the forecourt
    const updated: string[] = [];
    const updatedV2: string[] = [];
    const movedElements: { id: string }[] = [];
    const zoneName = opts.zoneName?.trim() || null;
    let geomIndex = 0;

    for (const elementId of elementIds) {
      const element = await this.prisma.spaceElement.findFirst({
        where: { id: elementId },
        include: {
          floor: { include: { config: { include: { space: true } } } },
          forecourt: { include: { config: { include: { space: true } } } },
          externalMerch: { include: { config: { include: { space: true } } } },
          zone: { include: { space: true } }, // Builder v2
        },
      });
      if (!element) continue;
      const elemSpace = element.floor?.config?.space ?? element.forecourt?.config?.space ?? element.externalMerch?.config?.space ?? (element as any).zone?.space;
      if (!elemSpace || elemSpace.tenantId !== tenantId || elemSpace.id !== spaceId) continue;

      // Builder v2 : déplacement de zone + adhésion — pas de JSON.
      if (element.zoneId || spaceHasZones) {
        const zone = await ensureTargetZone();
        await this.prisma.spaceElement.update({
          where: { id: elementId },
          data: {
            zoneId: zone.id,
            floorId: null,
            forecourtId: null,
            externalMerchId: null,
            ...this.elementGeometryData(geomIndex++, opts.position, opts.shopDimensions),
          },
        });
        await this.prisma.configurationElement.createMany({
          data: [{ configId: config.id, elementId }],
          skipDuplicates: true,
        });
        updatedV2.push(elementId);
        continue;
      }

      await ensureV1Forecourt();
      movedElements.push({ id: element.id });

      await this.prisma.spaceElement.update({
        where: { id: elementId },
        data: {
          floorId: null,
          forecourtId: forecourt.id,
          externalMerchId: null,
          ...this.elementGeometryData(geomIndex++, opts.position, opts.shopDimensions),
        },
      });
      updated.push(elementId);
    }

    // Nom + dimensions du dialogue appliqués à la zone cible v2 (hauteur exclue :
    // les zones non-FLOOR restent à 0 par convention) ; v1 legacy = nom seul
    // (le JSON est patché plus bas).
    if (targetZone) {
      const zonePatch: any = this.zoneDimensionsPatch(targetZone, { width: opts.width, length: opts.length });
      if (zoneName && zoneName !== targetZone.name) zonePatch.name = zoneName;
      if (Object.keys(zonePatch).length) {
        await this.prisma.zone.update({ where: { id: targetZone.id }, data: zonePatch });
        Object.assign(targetZone, zonePatch);
      }
    }
    if (zoneName && forecourt && zoneName !== forecourt.name) {
      forecourt = await this.prisma.forecourt.update({ where: { id: forecourt.id }, data: { name: zoneName } });
    }

    // Sync config.data JSON: move elements from their source floor(s) to the forecourt
    if (updated.length > 0) {
      await this.updateConfigDataOptimistic(config.id, async (currentData) => {
      const jsonFloors: any[] = Array.isArray(currentData.floors) ? [...currentData.floors] : [];
      const movedIds = new Set(updated);

      // Collect existing JSON entries for moved elements (to preserve dimensions/types)
      const allElements: any[] = [];
      for (const jf of jsonFloors) {
        if (Array.isArray(jf.elements)) allElements.push(...jf.elements);
      }

      // Remove moved elements from their source floors in the JSON
      for (const jsonFloorEntry of jsonFloors) {
        if (Array.isArray(jsonFloorEntry.elements)) {
          jsonFloorEntry.elements = jsonFloorEntry.elements.filter((e: any) => !movedIds.has(e.id));
        }
      }

      // Ensure the forecourt entry exists in JSON
      let jsonForecourt = currentData.forecourt;
      if (!jsonForecourt) {
        jsonForecourt = {
          id: forecourt.id,
          name: forecourt.name,
          width: forecourt.width ?? 200,
          length: forecourt.length ?? 200,
          elements: [],
          cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
        };
      }
      if (!Array.isArray(jsonForecourt.elements)) jsonForecourt.elements = [];

      for (const movedEl of movedElements) {
        if (jsonForecourt.elements.find((e: any) => e.id === movedEl.id)) continue;
        const existing = allElements.find((e: any) => e.id === movedEl.id);
        if (existing) {
          jsonForecourt.elements.push(existing);
        } else {
          const relElement = await this.prisma.spaceElement.findFirst({ where: { id: movedEl.id } });
          if (relElement) {
            const attrs = relElement.attributes as any;
            jsonForecourt.elements.push({
              id: relElement.id,
              name: relElement.name,
              type: attrs?.originalType ?? 'shop',
              x: relElement.x ?? 0,
              y: relElement.y ?? 0,
              width: relElement.width ?? 2,
              height: relElement.height ?? 2,
              depth: relElement.depth ?? 2,
              shopType: (relElement as any).shopTypes ?? [],
              storageType: (relElement as any).storageTypes ?? [],
              hospitalityType: (relElement as any).hospitalityTypes ?? [],
              accessType: (relElement as any).accessTypes ?? [],
              entertainmentType: (relElement as any).entertainmentTypes ?? [],
              entranceType: (relElement as any).entranceTypes ?? [],
              kitchenType: (relElement as any).kitchenTypes ?? [],
              attributes: attrs ?? {},
              cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
            });
          }
        }
      }

      // Nom + géométrie du dialogue répercutés dans le JSON v1.
      if (zoneName) jsonForecourt.name = zoneName;
      if (opts.position || opts.shopDimensions) {
        const geomById = new Map(updated.map((id, i) => [id, this.elementGeometryData(i, opts.position, opts.shopDimensions)]));
        for (const jsonEl of jsonForecourt.elements) {
          const g = jsonEl?.id ? geomById.get(jsonEl.id) : undefined;
          if (!g) continue;
          if (g.x !== undefined) jsonEl.x = g.x;
          if (g.y !== undefined) jsonEl.y = g.y;
          if (g.width !== undefined) jsonEl.width = g.width;
          if (g.depth !== undefined) jsonEl.depth = g.depth;
          if (g.height !== undefined) jsonEl.height = g.height;
        }
      }

      // Remove now-empty source floors from JSON to keep it clean
      const cleanedJsonFloors = jsonFloors.filter(
        (f: any) => Array.isArray(f.elements) && f.elements.length > 0,
      );

        return { ...currentData, floors: cleanedJsonFloors, forecourt: jsonForecourt };
      });

      await this.invalidateSpaceCache(tenantId, spaceId);
    }

    if (updated.length === 0 && updatedV2.length > 0) {
      await this.invalidateSpaceCache(tenantId, spaceId);
    }
    // `builderVersion` (BUG-23) : voir commentaire dans assignElementsToFloorLevel.
    return {
      kind: 'forecourt' as const,
      forecourtId: forecourt?.id ?? targetZone?.id ?? null,
      forecourtName: forecourt?.name ?? targetZone?.name ?? 'Parvis',
      level: null,
      updatedElementIds: [...updated, ...updatedV2],
      builderVersion: spaceHasZones ? ('v2' as const) : ('v1' as const),
    };
  }

  /**
   * Assign a list of SpaceElements to the "External Merch" zone of the element's
   * internal import config. Miroir de assignElementsToForecourt pour la zone externalMerch.
   */
  private async assignElementsToExternalMerch(
    spaceId: string,
    tenantId: string,
    elementIds: string[],
    opts: {
      configId?: string;
      width?: number;
      length?: number;
      zoneName?: string;
      position?: { x: number; y: number };
      shopDimensions?: { width?: number; depth?: number; height?: number };
    } = {},
  ) {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId } });
    if (!space) throw new NotFoundException('Space not found or access denied');

    // Cible : la config utilisateur (étape 1 / 3D Builder), pas « Weezevent Import ».
    const config = await this.resolveTargetConfig(spaceId, opts.configId);
    // Espace géré en v2 → toute assignation ADOPTE l'élément en v2 (zone + adhésion).
    const zoneCount = await this.prisma.zone.count({ where: { spaceId } });
    const spaceHasZones = zoneCount > 0;
    if (spaceHasZones) {
      this.logBuilderV2Switch('assignElementsToExternalMerch', spaceId, tenantId, zoneCount);
    }

    // Containers PARESSEUX (cf. assignElementsToFloorLevel) : v1 ExternalMerch / v2 Zone.
    let externalMerch: any = null;
    const ensureV1External = async () => {
      if (externalMerch) return externalMerch;
      externalMerch = await this.prisma.externalMerch.findUnique({ where: { configId: config.id } });
      if (!externalMerch) {
        externalMerch = await this.prisma.externalMerch.create({
          data: { configId: config.id, name: 'Espace Externe', width: opts.width ?? 200, length: opts.length ?? 200 },
        });
      }
      return externalMerch;
    };
    let targetZone: any = null;
    const ensureTargetZone = async () => {
      if (targetZone) return targetZone;
      targetZone = await this.ensureZone(spaceId, 'EXTERNAL', 0, {
        name: 'Espace externe', width: opts.width, length: opts.length,
      });
      return targetZone;
    };

    // Verify all elements belong to this tenant's space, then move them to the external merch zone
    const updated: string[] = [];
    const updatedV2: string[] = [];
    const movedElements: { id: string }[] = [];
    const zoneName = opts.zoneName?.trim() || null;
    let geomIndex = 0;

    for (const elementId of elementIds) {
      const element = await this.prisma.spaceElement.findFirst({
        where: { id: elementId },
        include: {
          floor: { include: { config: { include: { space: true } } } },
          forecourt: { include: { config: { include: { space: true } } } },
          externalMerch: { include: { config: { include: { space: true } } } },
          zone: { include: { space: true } }, // Builder v2
        },
      });
      if (!element) continue;
      const elemSpace = element.floor?.config?.space ?? element.forecourt?.config?.space ?? element.externalMerch?.config?.space ?? (element as any).zone?.space;
      if (!elemSpace || elemSpace.tenantId !== tenantId || elemSpace.id !== spaceId) continue;

      // Builder v2 : déplacement de zone + adhésion — pas de JSON.
      if (element.zoneId || spaceHasZones) {
        const zone = await ensureTargetZone();
        await this.prisma.spaceElement.update({
          where: { id: elementId },
          data: {
            zoneId: zone.id,
            floorId: null,
            forecourtId: null,
            externalMerchId: null,
            ...this.elementGeometryData(geomIndex++, opts.position, opts.shopDimensions),
          },
        });
        await this.prisma.configurationElement.createMany({
          data: [{ configId: config.id, elementId }],
          skipDuplicates: true,
        });
        updatedV2.push(elementId);
        continue;
      }

      await ensureV1External();
      movedElements.push({ id: element.id });

      await this.prisma.spaceElement.update({
        where: { id: elementId },
        data: {
          floorId: null,
          forecourtId: null,
          externalMerchId: externalMerch.id,
          ...this.elementGeometryData(geomIndex++, opts.position, opts.shopDimensions),
        },
      });
      updated.push(elementId);
    }

    // Nom + dimensions du dialogue appliqués à la zone cible v2 (hauteur exclue :
    // les zones non-FLOOR restent à 0 par convention) ; v1 legacy = nom seul
    // (le JSON est patché plus bas).
    if (targetZone) {
      const zonePatch: any = this.zoneDimensionsPatch(targetZone, { width: opts.width, length: opts.length });
      if (zoneName && zoneName !== targetZone.name) zonePatch.name = zoneName;
      if (Object.keys(zonePatch).length) {
        await this.prisma.zone.update({ where: { id: targetZone.id }, data: zonePatch });
        Object.assign(targetZone, zonePatch);
      }
    }
    if (zoneName && externalMerch && zoneName !== externalMerch.name) {
      externalMerch = await this.prisma.externalMerch.update({ where: { id: externalMerch.id }, data: { name: zoneName } });
    }

    // Sync config.data JSON: move elements from their source zone(s) to externalMerch
    if (updated.length > 0) {
      await this.updateConfigDataOptimistic(config.id, async (currentData) => {
      const jsonFloors: any[] = Array.isArray(currentData.floors) ? [...currentData.floors] : [];
      const movedIds = new Set(updated);

      // Collect existing JSON entries for moved elements (to preserve dimensions/types)
      const allElements: any[] = [];
      for (const jf of jsonFloors) {
        if (Array.isArray(jf.elements)) allElements.push(...jf.elements);
      }
      if (Array.isArray(currentData.forecourt?.elements)) allElements.push(...currentData.forecourt.elements);

      // Remove moved elements from their source floors / forecourt in the JSON
      for (const jsonFloorEntry of jsonFloors) {
        if (Array.isArray(jsonFloorEntry.elements)) {
          jsonFloorEntry.elements = jsonFloorEntry.elements.filter((e: any) => !movedIds.has(e.id));
        }
      }
      const jsonForecourt = currentData.forecourt
        ? { ...currentData.forecourt, elements: (currentData.forecourt.elements || []).filter((e: any) => !movedIds.has(e.id)) }
        : currentData.forecourt ?? null;

      // Ensure the externalMerch entry exists in JSON
      let jsonExternalMerch = currentData.externalMerch;
      if (!jsonExternalMerch) {
        jsonExternalMerch = {
          id: externalMerch.id,
          name: externalMerch.name,
          width: externalMerch.width ?? 200,
          length: externalMerch.length ?? 200,
          elements: [],
          cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
        };
      }
      if (!Array.isArray(jsonExternalMerch.elements)) jsonExternalMerch.elements = [];

      for (const movedEl of movedElements) {
        if (jsonExternalMerch.elements.find((e: any) => e.id === movedEl.id)) continue;
        const existing = allElements.find((e: any) => e.id === movedEl.id);
        if (existing) {
          jsonExternalMerch.elements.push(existing);
        } else {
          const relElement = await this.prisma.spaceElement.findFirst({ where: { id: movedEl.id } });
          if (relElement) {
            const attrs = relElement.attributes as any;
            jsonExternalMerch.elements.push({
              id: relElement.id,
              name: relElement.name,
              type: attrs?.originalType ?? 'shop',
              x: relElement.x ?? 0,
              y: relElement.y ?? 0,
              width: relElement.width ?? 2,
              height: relElement.height ?? 2,
              depth: relElement.depth ?? 2,
              shopType: (relElement as any).shopTypes ?? [],
              storageType: (relElement as any).storageTypes ?? [],
              hospitalityType: (relElement as any).hospitalityTypes ?? [],
              accessType: (relElement as any).accessTypes ?? [],
              entertainmentType: (relElement as any).entertainmentTypes ?? [],
              entranceType: (relElement as any).entranceTypes ?? [],
              kitchenType: (relElement as any).kitchenTypes ?? [],
              attributes: attrs ?? {},
              cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
            });
          }
        }
      }

      // Nom + géométrie du dialogue répercutés dans le JSON v1.
      if (zoneName) jsonExternalMerch.name = zoneName;
      if (opts.position || opts.shopDimensions) {
        const geomById = new Map(updated.map((id, i) => [id, this.elementGeometryData(i, opts.position, opts.shopDimensions)]));
        for (const jsonEl of jsonExternalMerch.elements) {
          const g = jsonEl?.id ? geomById.get(jsonEl.id) : undefined;
          if (!g) continue;
          if (g.x !== undefined) jsonEl.x = g.x;
          if (g.y !== undefined) jsonEl.y = g.y;
          if (g.width !== undefined) jsonEl.width = g.width;
          if (g.depth !== undefined) jsonEl.depth = g.depth;
          if (g.height !== undefined) jsonEl.height = g.height;
        }
      }

      // Remove now-empty source floors from JSON to keep it clean
      const cleanedJsonFloors = jsonFloors.filter(
        (f: any) => Array.isArray(f.elements) && f.elements.length > 0,
      );

        return { ...currentData, floors: cleanedJsonFloors, forecourt: jsonForecourt, externalMerch: jsonExternalMerch };
      });

      await this.invalidateSpaceCache(tenantId, spaceId);
    }

    if (updated.length === 0 && updatedV2.length > 0) {
      await this.invalidateSpaceCache(tenantId, spaceId);
    }
    // `builderVersion` (BUG-23) : voir commentaire dans assignElementsToFloorLevel.
    return {
      kind: 'externalmerch' as const,
      externalMerchId: externalMerch?.id ?? targetZone?.id ?? null,
      externalMerchName: externalMerch?.name ?? targetZone?.name ?? 'Espace externe',
      level: null,
      updatedElementIds: [...updated, ...updatedV2],
      builderVersion: spaceHasZones ? ('v2' as const) : ('v1' as const),
    };
  }

  /**
   * Delete a SpaceElement (and its config.data JSON entry) if no
   * WeezeventLocationShopMapping still references it. Used when a Weezevent
   * shop mapping is removed in Data Integration so the corresponding 3D
   * builder element is removed too.
   */
  async deleteElementIfUnreferenced(elementId: string, tenantId: string): Promise<boolean> {
    const remainingMappings = await this.prisma.locationShopMapping.count({
      where: { spaceElementId: elementId },
    });
    if (remainingMappings > 0) return false;

    const element = await this.prisma.spaceElement.findFirst({
      where: { id: elementId },
      include: {
        floor: { include: { config: { include: { space: true } } } },
        forecourt: { include: { config: { include: { space: true } } } },
        externalMerch: { include: { config: { include: { space: true } } } },
        zone: { include: { space: true } }, // Builder v2
      },
    });
    if (!element) return false;

    const space = element.floor?.config?.space ?? element.forecourt?.config?.space ?? element.externalMerch?.config?.space ?? (element as any).zone?.space;
    if (!space || space.tenantId !== tenantId) return false;

    // Builder v2 : pas de JSON à nettoyer — suppression directe (cascade adhésions).
    if ((element as any).zoneId) {
      await this.prisma.spaceElement.delete({ where: { id: elementId } });
      await this.invalidateSpaceCache(tenantId, space.id);
      return true;
    }

    const config = element.floor?.config ?? element.forecourt?.config ?? element.externalMerch?.config;
    if (!config) return false;

    await this.prisma.spaceElement.delete({ where: { id: elementId } });

    // Remove the element from config.data JSON (floors[].elements / forecourt.elements)
    const freshConfig = await this.prisma.config.findFirst({ where: { id: config.id } });
    const currentData = (freshConfig?.data as any) || {};
    let changed = false;

    const jsonFloors: any[] = Array.isArray(currentData.floors) ? currentData.floors : [];
    for (const jf of jsonFloors) {
      if (Array.isArray(jf.elements)) {
        const before = jf.elements.length;
        jf.elements = jf.elements.filter((e: any) => e.id !== elementId);
        if (jf.elements.length !== before) changed = true;
      }
    }

    const jsonForecourt = currentData.forecourt;
    if (jsonForecourt && Array.isArray(jsonForecourt.elements)) {
      const before = jsonForecourt.elements.length;
      jsonForecourt.elements = jsonForecourt.elements.filter((e: any) => e.id !== elementId);
      if (jsonForecourt.elements.length !== before) changed = true;
    }

    const jsonExternalMerch = currentData.externalMerch;
    if (jsonExternalMerch && Array.isArray(jsonExternalMerch.elements)) {
      const before = jsonExternalMerch.elements.length;
      jsonExternalMerch.elements = jsonExternalMerch.elements.filter((e: any) => e.id !== elementId);
      if (jsonExternalMerch.elements.length !== before) changed = true;
    }

    if (changed) {
      await this.prisma.config.update({
        where: { id: config.id },
        data: { data: { ...currentData, floors: jsonFloors, forecourt: jsonForecourt ?? null, externalMerch: jsonExternalMerch ?? null }, version: { increment: 1 } },
      });
    }

    await this.invalidateSpaceCache(tenantId, space.id);
    return true;
  }
}
