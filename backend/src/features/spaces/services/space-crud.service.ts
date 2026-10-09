import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { CreateSpaceDto } from '../dto/create-space.dto';
import { UpdateSpaceDto } from '../dto/update-space.dto';
import { QuerySpaceDto } from '../dto/query-space.dto';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { CurrentUserData } from '../../../core/auth/decorators/current-user.decorator';
import { SupabaseStorageService } from '../../../core/supabase/supabase-storage.service';
import { SpaceRevenueSummaryService } from './space-revenue-summary.service';
import { hasPermission, PermissionCheckableUser } from '../../../core/rbac/permission.util';
import { SpaceCacheService } from './space-cache.service';
import { SpaceZoneElementsService } from './space-zone-elements.service';

/**
 * Espaces : création, lecture (avec masquage des données financières), mise à jour, suppression,
 * image et statistiques.
 */
@Injectable()
export class SpaceCrudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly storage: SupabaseStorageService,
    private readonly revenueSummary: SpaceRevenueSummaryService,
    private readonly spaceCacheService: SpaceCacheService,
    private readonly spaceZoneElementsService: SpaceZoneElementsService,
  ) {}

  /**
   * Périmètre d'espaces de l'utilisateur pour le filtrage des LISTES.
   * Retourne `null` = accès complet (aucun filtre, cache tenant-wide autorisé),
   * sinon la liste des spaceId accessibles (cache tenant-wide à NE PAS utiliser).
   */
  async restrictedSpaceIds(
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>,
  ): Promise<string[] | null> {
    const ids = await this.spaceAccess.getAccessibleSpaceIds(user);
    return ids === 'ALL' ? null : ids;
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

    await this.spaceCacheService.invalidateSpaceCache(tenantId);
    return space;
  }

  // Champs monétaires retirés des réponses quand l'appelant n'a pas `stats.financial.view`.
  // Rédaction faite APRÈS lecture/écriture du cache Redis (findAll/findOne/getShopDetails/
  // getTransactionBasketsBatch sont cachés par tenant, pas par utilisateur) : sinon le premier
  // appelant autorisé mettrait les chiffres en cache pour tout le monde derrière lui.
  private static readonly FINANCIAL_SPACE_FIELDS = [
    'totalRevenue',
    'fbRevenue',
    'merchRevenue',
    'ticketingCount',
    'avgTransaction',
    'avgEvent',
    'perCapita',
  ] as const;

  stripFields<T extends Record<string, any>>(obj: T, fields: readonly string[]): T {
    const clone: any = { ...obj };
    for (const field of fields) delete clone[field];
    return clone;
  }

  private redactSpaceFinancials<T extends Record<string, any>>(space: T, user: PermissionCheckableUser): T {
    if (hasPermission(user, 'stats.financial.view')) return space;
    return this.stripFields(space, SpaceCrudService.FINANCIAL_SPACE_FIELDS);
  }

  /**
   * Find all spaces for a tenant with pagination (Redis-cached, TTL 60s).
   * Cache is bypassed when a search filter is applied.
   */
  async findAll(
    tenantId: string,
    query: QuerySpaceDto,
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess' | 'role'>,
  ) {
    const { search, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    // Périmètre espaces : null = accès complet ; sinon liste restreinte.
    const accessibleIds = await this.restrictedSpaceIds(user);

    // Cache tenant-wide réservé aux utilisateurs à accès complet (sinon fuite d'espaces
    // non autorisés à un user restreint).
    const isCacheable = !search && page === 1 && limit === 10 && accessibleIds === null;
    if (isCacheable) {
      const cached = await this.redis.get<any>(this.spaceCacheService.SPACES_LIST_CACHE_KEY(tenantId));
      if (cached) return this.redactSpaceListResult(cached, user);
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

    const revenueSummaries = await this.revenueSummary.getSummaries(tenantId, spaces.map((s) => s.id));
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
      await this.redis.set(this.spaceCacheService.SPACES_LIST_CACHE_KEY(tenantId), result, {
        ttl: this.spaceCacheService.SPACES_CACHE_TTL,
      });
    }

    return this.redactSpaceListResult(result, user);
  }

  private redactSpaceListResult(
    result: { data: Record<string, any>[]; meta: any },
    user: PermissionCheckableUser,
  ) {
    if (hasPermission(user, 'stats.financial.view')) return result;
    return {
      ...result,
      data: result.data.map((space) => this.stripFields(space, SpaceCrudService.FINANCIAL_SPACE_FIELDS)),
    };
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
    const cacheKey = this.spaceCacheService.SPACES_LIGHT_CACHE_KEY(tenantId);

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
      await this.redis.set(cacheKey, spaces, { ttl: this.spaceCacheService.SPACES_CACHE_TTL });
    }
    return spaces;
  }

  /**
   * Find one space by ID
   */
  async findOne(id: string, tenantId: string, user?: PermissionCheckableUser) {
    const cacheKey = this.spaceCacheService.SPACE_DETAIL_CACHE_KEY(id);
    const cached = await this.redis.get<any>(cacheKey);
    if (cached && cached.tenantId === tenantId) {
      return user ? this.redactSpaceFinancials(cached, user) : cached;
    }

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
      const zoneElements = await this.spaceZoneElementsService.fetchZoneElementsForSpace(id);
      if (zoneElements.length > 0) {
        (space as any).configs = space.configs.map((c: any) => ({
          ...c,
          data: this.spaceZoneElementsService.mergeZoneElementsIntoConfigData(c.data, zoneElements, c.id),
        }));
      }
    }

    // Cache the result to skip 3 round-trips on subsequent loads (TTL 2 min)
    await this.redis.set(cacheKey, space, { ttl: this.spaceCacheService.SPACE_DETAIL_CACHE_TTL });

    return user ? this.redactSpaceFinancials(space, user) : space;
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

    await this.spaceCacheService.invalidateSpaceCache(tenantId, id);
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

    await this.spaceCacheService.invalidateSpaceCache(tenantId, id);
    return {
      message: 'Space deleted successfully',
    };
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
}
