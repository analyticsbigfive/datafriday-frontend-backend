import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

const ASSERT_SPACE_ACCESS_MESSAGES = {
  none: "Ce prix n'est rattaché à aucun espace — réservé aux comptes à accès complet.",
  denied: "Vous n'avez pas accès à l'espace du fournisseur de ce prix.",
};

/**
 * Lectures des prix du marché, seuls ou avec les ingrédients et emballages liés, dans le périmètre d'espaces de l'utilisateur.
 */
@Injectable()
export class MarketPriceQueryService {
  constructor(
    private prisma: PrismaService,
    private spaceAccess: SpaceAccessService,
  ) {}

  private readonly logger = new Logger(MarketPriceQueryService.name);

  /** Filtre Prisma à ajouter au `where` d'une liste : restreint aux prix dont le fournisseur
   * dessert un espace accessible. Un prix sans fournisseur, ou dont le fournisseur ne
   * déclare aucun site, ne dessert aucun espace accessible par construction. */
  async spaceScopeFilter(user?: SpaceScopedUser): Promise<any> {
    if (!user || this.spaceAccess.hasFullAccess(user)) return {};
    const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
    if (accessible === 'ALL') return {};
    return {
      supplierRel: { sites: { hasSome: accessible } },
    };
  }

  /**
   * Convertit les champs Decimal (sérialisés en string par Prisma) en number,
   * pour que le frontend reçoive `price: 3.5` au lieu de `"3.5"`. Normalise aussi
   * les coûts des ingredients/packagings liés quand ils sont inclus.
   */
  serialize(mp: any): any {
    if (!mp) return mp;
    const toNum = (v: any) => (v === null || v === undefined ? v : Number(v));
    const out: any = {
      ...mp,
      price: toNum(mp.price),
      pricePerUnit: toNum(mp.pricePerUnit),
    };
    if (Array.isArray(mp.ingredients)) {
      out.ingredients = mp.ingredients.map((i: any) => ({
        ...i,
        costPerRecipeUnit: toNum(i.costPerRecipeUnit),
        costPerPurchaseUnit: toNum(i.costPerPurchaseUnit),
      }));
    }
    if (Array.isArray(mp.packagings)) {
      out.packagings = mp.packagings.map((p: any) => ({
        ...p,
        costPerRecipeUnit: toNum(p.costPerRecipeUnit),
        costPerPurchaseUnit: toNum(p.costPerPurchaseUnit),
      }));
    }
    return out;
  }

  async findAll(tenantId: string, page = 1, limit = 200, user?: SpaceScopedUser) {
    this.logger.log(`Fetching market prices for tenant ${tenantId} (page=${page}, limit=${limit})`);
    try {
      const skip = (page - 1) * limit;
      const where: any = { tenantId, ...(await this.spaceScopeFilter(user)) };
      const [prices, total] = await Promise.all([
        this.prisma.marketPrice.findMany({
          where,
          orderBy: { itemName: 'asc' },
          include: { supplierRel: true },
          skip,
          take: limit,
        }),
        this.prisma.marketPrice.count({ where }),
      ]);
      this.logger.log(`Found ${prices.length}/${total} market prices`);
      return {
        data: prices.map((p) => this.serialize(p)),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch market prices: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAllWithIngredients(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      category?: string;
      goodType?: string;
    } = {},
    user?: SpaceScopedUser,
  ) {
    const { page = 1, limit = 100, search, category, goodType } = options;
    this.logger.log(
      `Fetching market prices with ingredients for tenant ${tenantId} ` +
      `(page=${page}, limit=${limit}, search="${search}", category="${category}", goodType=${goodType})`,
    );

    try {
      const skip = (page - 1) * limit;

      // Build where clause - always filter by tenantId for security
      const where: any = { tenantId };
      const andClauses: any[] = [];
      const scopeFilter = await this.spaceScopeFilter(user);
      if (Object.keys(scopeFilter).length) andClauses.push(scopeFilter);

      // Search filter
      if (search && search.trim()) {
        andClauses.push({
          OR: [
            { itemName: { contains: search.trim(), mode: 'insensitive' } },
            { category: { contains: search.trim(), mode: 'insensitive' } },
            { supplier: { contains: search.trim(), mode: 'insensitive' } },
          ],
        });
      }

      // Category filter
      if (category && category.trim()) {
        where.category = { contains: category.trim(), mode: 'insensitive' };
      }

      // GoodType filter
      if (goodType) {
        where.goodType = goodType;
      }

      if (andClauses.length) where.AND = andClauses;

      const [data, total] = await Promise.all([
        this.prisma.marketPrice.findMany({
          where,
          orderBy: { itemName: 'asc' },
          include: {
            supplierRel: true,
            marketPriceCategory: true,
            ingredients: {
              where: { deletedAt: null },
              orderBy: { name: 'asc' },
            },
          },
          skip,
          take: limit,
        }),
        this.prisma.marketPrice.count({ where }),
      ]);

      this.logger.log(`Found ${data.length}/${total} market prices with ingredients`);
      return {
        data: data.map((p) => this.serialize(p)),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch market prices with ingredients: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAllWithPackagings(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      category?: string;
    } = {},
    user?: SpaceScopedUser,
  ) {
    const { page = 1, limit = 100, search, category } = options;
    this.logger.log(
      `Fetching market prices with packagings for tenant ${tenantId} ` +
      `(page=${page}, limit=${limit}, search="${search}", category="${category}")`,
    );

    try {
      const skip = (page - 1) * limit;

      const where: any = { tenantId, goodType: 'Packaging' };
      const andClauses: any[] = [];
      const scopeFilter = await this.spaceScopeFilter(user);
      if (Object.keys(scopeFilter).length) andClauses.push(scopeFilter);

      if (search && search.trim()) {
        andClauses.push({
          OR: [
            { itemName: { contains: search.trim(), mode: 'insensitive' } },
            { category: { contains: search.trim(), mode: 'insensitive' } },
            { supplier: { contains: search.trim(), mode: 'insensitive' } },
          ],
        });
      }

      if (category && category.trim()) {
        where.category = { contains: category.trim(), mode: 'insensitive' };
      }

      if (andClauses.length) where.AND = andClauses;

      const [data, total] = await Promise.all([
        this.prisma.marketPrice.findMany({
          where,
          orderBy: { itemName: 'asc' },
          include: {
            supplierRel: true,
            marketPriceCategory: true,
            packagings: {
              where: { deletedAt: null },
              orderBy: { name: 'asc' },
            },
          },
          skip,
          take: limit,
        }),
        this.prisma.marketPrice.count({ where }),
      ]);

      this.logger.log(`Found ${data.length}/${total} market prices with packagings`);
      return {
        data: data.map((p) => this.serialize(p)),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch market prices with packagings: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Fetching market price ${id} for tenant ${tenantId}`);
    const price = await this.prisma.marketPrice.findFirst({
      where: { id, tenantId },
      include: { supplierRel: true },
    });

    if (!price) {
      this.logger.warn(`Market price ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Market price with ID ${id} not found`);
    }
    await this.spaceAccess.assertCanAccessAny(user, price.supplierRel?.sites, ASSERT_SPACE_ACCESS_MESSAGES);

    return this.serialize(price);
  }
}
