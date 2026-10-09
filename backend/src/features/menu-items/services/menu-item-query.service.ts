import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { MenuItemSupportService } from './menu-item-support.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

const ASSERT_SPACE_ACCESS_MESSAGES = {
  none: "Cet article n'est rattaché à aucun espace — réservé aux comptes à accès complet.",
  denied: "Vous n'avez pas accès à l'espace de cet article.",
};

/**
 * Lecture des articles de menu (liste paginée en cache, détail).
 */
@Injectable()
export class MenuItemQueryService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private spaceAccess: SpaceAccessService,
    private readonly menuItemSupportService: MenuItemSupportService,
  ) {}

  private readonly logger = new Logger(MenuItemQueryService.name);

  async findAll(
    tenantId: string,
    page = 1,
    limit = 100,
    spaceId?: string,
    filters?: { search?: string; typeId?: string; categoryId?: string; readyForSale?: string },
    user?: SpaceScopedUser,
  ) {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const { search, typeId, categoryId, readyForSale } = filters || {};

    // Sans spaceId explicite (ex. sélecteur front resté sur "Tous les espaces"), un
    // utilisateur restreint à certains espaces ne doit voir que les articles qui y sont
    // rattachés (+ les articles globaux, non rattachés à aucun espace) — jamais le
    // catalogue entier du tenant, y compris les espaces auxquels il n'a pas droit.
    const accessibleSpaceIds: 'ALL' | string[] =
      !spaceId && user ? await this.spaceAccess.getAccessibleSpaceIds(user) : 'ALL';
    const scopeKey = spaceId
      ? spaceId
      : accessibleSpaceIds === 'ALL'
        ? 'all'
        : `restricted:${[...accessibleSpaceIds].sort().join(',')}`;

    this.logger.log(
      `Fetching menu items for tenant ${tenantId} (page=${page}, limit=${safeLimit}, spaceId=${spaceId ?? 'all'}, search=${search ?? ''}, typeId=${typeId ?? ''}, categoryId=${categoryId ?? ''}, readyForSale=${readyForSale ?? ''})`,
    );
    try {
      const cacheKey = this.menuItemSupportService.listCache.key(
        tenantId,
        `list:${page}:${safeLimit}:${scopeKey}:${search ?? ''}:${typeId ?? ''}:${categoryId ?? ''}:${readyForSale ?? ''}`,
      );
      return this.redis.getOrSet(cacheKey, async () => {
        const skip = (page - 1) * safeLimit;
        // spaceId filtre sur la table SpaceMenuItem (join indexé) : évite de charger tout
        // le catalogue tenant quand seul un espace nous intéresse (cf. /space-menus qui
        // paginait sur l'intégralité des menu items avant de filtrer côté client).
        const where: any = { tenantId, deletedAt: null };
        if (spaceId) {
          where.spaceLinks = { some: { spaceId } };
        } else if (accessibleSpaceIds !== 'ALL') {
          // Un article sans espace n'est pas un « catalogue global » : il reste invisible
          // à un utilisateur restreint, comme un article d'un espace non accessible.
          where.spaceLinks = { some: { spaceId: { in: accessibleSpaceIds } } };
        }
        if (search) where.name = { contains: search, mode: 'insensitive' };
        if (typeId) where.typeId = typeId;
        if (categoryId) where.categoryId = categoryId;
        if (readyForSale) where.readyForSale = readyForSale;
        const [items, total, tenantVatRate] = await Promise.all([
          this.prisma.menuItem.findMany({
            where,
            orderBy: { name: 'asc' },
            include: this.menuItemSupportService.includeRelations,
            skip,
            take: safeLimit,
          }),
          this.prisma.menuItem.count({ where }),
          this.menuItemSupportService.getTenantDefaultVatRate(tenantId),
        ]);
        this.logger.log(`Found ${items.length}/${total} menu items`);
        return {
          data: items.map(i => this.menuItemSupportService.serializeItem(i, tenantVatRate)),
          meta: { total, page, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
        };
      // 3600 (pas 60) : le catalogue menu items change rarement (édition manuelle),
      // et `invalidateCache()` purge déjà cette clé à chaque écriture (:73-78, bug de
      // double-préfixe corrigé le 2026-08-14) — le TTL n'est qu'un filet de sécurité,
      // pas le mécanisme de fraîcheur. 60s ne protégeait qu'un pic de charge, au prix
      // d'un cache-miss quasi systématique pour des écrans qui rechargent le catalogue
      // à chaque montage (ex. Live v2) sans jamais rien y avoir changé entre-temps.
      }, { ttl: 3600 });
    } catch (error) {
      this.logger.error(`Failed to fetch menu items: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Fetching menu item ${id} for tenant ${tenantId}`);
    const [item, tenantVatRate] = await Promise.all([
      this.prisma.menuItem.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: this.menuItemSupportService.includeRelations,
      }),
      this.menuItemSupportService.getTenantDefaultVatRate(tenantId),
    ]);
    if (!item) {
      this.logger.warn(`Menu item ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }
    const result = this.menuItemSupportService.serializeItem(item, tenantVatRate);
    await this.spaceAccess.assertCanAccessAny(user, result.spaceIds, ASSERT_SPACE_ACCESS_MESSAGES);
    return result;
  }
}
