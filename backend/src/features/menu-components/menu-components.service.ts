import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { SupabaseStorageService } from '../../core/supabase/supabase-storage.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { resolveKitchenFields } from '../../shared/utils/resolve-kitchen';
import { mergeScopedSpaces } from '../../shared/utils/scoped-spaces';
import { CreateMenuComponentDto } from './dto/create-menu-component.dto';
import { UpdateMenuComponentDto } from './dto/update-menu-component.dto';
import { TenantListCache } from '../../shared/cache/tenant-list-cache';
import { MenuComponentCostService } from './services/menu-component-cost.service';
import { MenuComponentValidationService } from './services/menu-component-validation.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * Composants de menu : création, lecture, modification, suppression, réparation et remplacement de la composition.
 */
@Injectable()
export class MenuComponentsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private spaceAccess: SpaceAccessService,
    private storage: SupabaseStorageService,
    private readonly menuComponentCostService: MenuComponentCostService,
    private readonly menuComponentValidationService: MenuComponentValidationService,
  ) {}

  private readonly logger = new Logger(MenuComponentsService.name);

  /**
   * Espaces visibles par `user` : 'ALL' (accès complet, ou appel interne sans user) ou
   * la liste de ses espaces. Un composant SANS espace est commun et visible de tous
   * (décision Ulrich/Bertrand 2026-10-08 : aucun composant n'en avait au déploiement).
   */
  private async visibleSpaces(user?: SpaceScopedUser): Promise<'ALL' | string[]> {
    if (!user || this.spaceAccess.hasFullAccess(user)) return 'ALL';
    return this.spaceAccess.getAccessibleSpaceIds(user);
  }

  private async assertComponentSpaces(spaceIds: string[] | undefined, user?: SpaceScopedUser) {
    if (!spaceIds?.length) return;
    const visible = await this.visibleSpaces(user);
    if (visible === 'ALL') return;
    if (!spaceIds.some((sid) => visible.includes(sid))) {
      throw new ForbiddenException("Vous n'avez pas accès à l'espace de ce composant.");
    }
  }

  /**
   * Espaces à enregistrer pour un composant : un compte restreint n'ajoute que ses
   * propres espaces, ceux qu'il ne voit pas sont conservés (mergeScopedSpaces).
   */
  private async scopedSpaces(requested: string[], existing: string[], user?: SpaceScopedUser) {
    const { spaces, foreign } = mergeScopedSpaces(requested, existing, await this.visibleSpaces(user));
    if (foreign.length) {
      throw new ForbiddenException("Vous ne pouvez rattacher un composant qu'à vos propres espaces.");
    }
    return spaces;
  }

  private readonly listCache = new TenantListCache(this.redis, 'menu-components');

  async replaceIngredients(
    componentId: string,
    ingredients: CreateMenuComponentDto['ingredients'],
    tenantId: string,
  ) {
    this.logger.log(`Replacing ingredient lines for component ${componentId} (tenant ${tenantId})`);
    await this.findOne(componentId, tenantId);

    const lines = Array.isArray(ingredients) ? ingredients : [];

    await this.menuComponentValidationService.assertIngredientsExist(
      lines.map((l: any) => l?.ingredientId),
      tenantId,
    );

    try {
      await this.prisma.menuComponent.update({
        where: { id: componentId },
        data: {
          ingredients: {
            deleteMany: {},
            create: lines.map((l: any) => ({
              ingredientId: l.ingredientId,
              quantity: Number(l.quantity ?? l.numberOfUnits),
              unit: l.unit,
              unitCost: this.menuComponentValidationService.toDecimalOrUndefined((l as any).unitCost),
              cost: this.menuComponentValidationService.toDecimalOrUndefined((l as any).cost),
            })),
          },
        },
      });

      await this.menuComponentCostService.refreshCosts(tenantId, { componentIds: [componentId] });
      return this.findOne(componentId, tenantId);
    } catch (error) {
      this.logger.error(
        `Failed to replace ingredients for component ${componentId}: ${error.message}`,
        error.stack,
      );
      if (error.code === 'P2003') {
        const field = (error as any)?.meta?.field_name;
        throw new BadRequestException(
          field ? `Invalid reference: ${field}` : `Invalid ingredient ID in the provided list`,
        );
      }
      throw error;
    }
  }

  async replaceChildren(
    componentId: string,
    children: CreateMenuComponentDto['children'],
    tenantId: string,
  ) {
    this.logger.log(
      `Replacing child component lines for component ${componentId} (tenant ${tenantId})`,
    );
    await this.findOne(componentId, tenantId);

    const lines = Array.isArray(children) ? children : [];

    await this.menuComponentValidationService.assertChildrenExist(
      lines.map((l: any) => l?.childId),
      tenantId,
    );

    try {
      await this.prisma.menuComponent.update({
        where: { id: componentId },
        data: {
          children: {
            deleteMany: {},
            create: lines.map((l: any) => ({
              childId: l.childId,
              quantity: Number(l.quantity),
              unit: l.unit,
              cost: this.menuComponentValidationService.toDecimalOrUndefined((l as any).cost),
            })),
          },
        },
      });

      await this.menuComponentCostService.refreshCosts(tenantId, { componentIds: [componentId] });
      return this.findOne(componentId, tenantId);
    } catch (error) {
      this.logger.error(
        `Failed to replace children for component ${componentId}: ${error.message}`,
        error.stack,
      );
      if (error.code === 'P2003') {
        const field = (error as any)?.meta?.field_name;
        throw new BadRequestException(
          field ? `Invalid reference: ${field}` : `Invalid child component ID in the provided list`,
        );
      }
      throw error;
    }
  }

  private readonly includeRelations = {
    // Nom de la cuisine : affiché même si elle est hors des espaces de l'utilisateur.
    kitchen: { select: { id: true, name: true } },
    ingredients: {
      // marketPrice scopé (supplier/supplierId/supplierRel.name seulement, PAS image qui peut
      // être un base64 volumineux) : nécessaire pour résoudre le fournisseur affiché colonne
      // Supplier côté front (ComponentCreateView.vue), sans alourdir findAll() (liste catalogue,
      // même includeRelations) avec le payload complet MarketPrice pour chaque ingrédient de
      // chaque composant. supplierRel.name : `MarketPrice.supplier` (string dénormalisée) est
      // parfois vide alors que `supplierId` pointe vers un Supplier valide (données historiques
      // désynchronisées) — la relation sert de source de vérité de secours.
      include: {
        ingredient: {
          include: {
            marketPrice: {
              select: { supplier: true, supplierId: true, supplierRel: { select: { name: true } } },
            },
          },
        },
      },
    },
    children: {
      include: { child: true },
    },
    parents: {
      include: { parent: true },
    },
  };

  async create(dto: CreateMenuComponentDto, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Creating menu component "${dto.name}" for tenant ${tenantId}`);
    try {
      const ingredientsLines = Array.isArray((dto as any).ingredients)
        ? (dto as any).ingredients
        : undefined;
      const childrenLines = Array.isArray((dto as any).children)
        ? (dto as any).children
        : undefined;

      await Promise.all([
        this.menuComponentValidationService.assertIngredientsExist(
          (ingredientsLines || []).map((l: any) => l?.ingredientId),
          tenantId,
        ),
        this.menuComponentValidationService.assertChildrenExist(
          (childrenLines || []).map((l: any) => l?.childId),
          tenantId,
        ),
        this.menuComponentValidationService.assertComponentTypeAccessible(dto.componentTypeId, tenantId),
        this.menuComponentValidationService.assertComponentCategoryAccessible(dto.componentCategoryId, tenantId),
      ]);
      const spaceIds = await this.scopedSpaces(dto.spaceIds ?? [], [], user);
      const kitchen = await resolveKitchenFields(this.prisma, dto, tenantId);
      const picture = await this.storage.resolveImage(dto.picture ?? undefined, 'components');

      const component = await this.prisma.menuComponent.create({
        data: {
          tenantId,
          name: dto.name,
          unit: dto.unit,
          category: dto.category,
          unitCost: dto.unitCost,
          allergens: dto.allergens || [],
          description: dto.description,
          storageType: dto.storageType,
          subComponents: dto.subComponents,
          componentCategory: dto.componentCategory,
          numberOfUnitsRecipe: dto.numberOfUnitsRecipe,
          packedUnits: dto.packedUnits,
          inventoryPackaging: dto.inventoryPackaging,
          readyForSale: dto.readyForSale,
          ...kitchen,
          picture,
          spaceIds,
          componentTypeId: dto.componentTypeId,
          componentCategoryId: dto.componentCategoryId,

          ...(ingredientsLines
            ? {
                ingredients: {
                  create: ingredientsLines.map((l: any) => ({
                    ingredientId: l.ingredientId,
                    quantity: Number(l.quantity ?? l.numberOfUnits),
                    unit: l.unit,
                    unitCost: this.menuComponentValidationService.toDecimalOrUndefined(l.unitCost),
                    cost: this.menuComponentValidationService.toDecimalOrUndefined(l.cost),
                  })),
                },
              }
            : {}),

          ...(childrenLines
            ? {
                children: {
                  create: childrenLines.map((l: any) => ({
                    childId: l.childId,
                    quantity: Number(l.quantity),
                    unit: l.unit,
                    cost: this.menuComponentValidationService.toDecimalOrUndefined(l.cost),
                  })),
                },
              }
            : {}),
        },
        include: this.includeRelations,
      });

      this.logger.log(`Menu component created: ${component.id}`);

      if (ingredientsLines || childrenLines) {
        await this.menuComponentCostService.refreshCosts(tenantId, { componentIds: [component.id] });
        // Même patron que update() : un composant créé avec des ingrédients ou des
        // sous-composants (le cas courant) sortait ici SANS invalider le cache liste
        // (`findAll`, TTL 1 h) et n'apparaissait pas dans la liste Composants avant
        // expiration. Purge après refreshCosts, pour ne pas remettre en cache un coût à 0.
        await this.listCache.invalidate(tenantId);
        return this.findOne(component.id, tenantId);
      }

      await this.listCache.invalidate(tenantId);
      return component;
    } catch (error) {
      this.logger.error(`Failed to create menu component: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        const field = (error as any)?.meta?.field_name;
        throw new BadRequestException(
          field
            ? `Invalid reference: ${field}`
            : `Invalid ingredient or child component ID in the provided data`,
        );
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(`A component with this name already exists`);
      }
      throw error;
    }
  }

  async findAll(tenantId: string, page = 1, limit = 100, user?: SpaceScopedUser) {
    this.logger.log(
      `Fetching menu components for tenant ${tenantId} (page=${page}, limit=${limit})`,
    );
    try {
      // Compte restreint : composants communs (sans espace) + ceux de ses espaces. Le
      // périmètre fait partie de la clé de cache (même réflexe que menu-items.service.ts).
      const visible = await this.visibleSpaces(user);
      const scope = visible === 'ALL' ? 'all' : `s:${[...visible].sort().join(',')}`;
      const where: any = { tenantId, deletedAt: null };
      if (visible !== 'ALL') {
        where.OR = [{ spaceIds: { isEmpty: true } }, { spaceIds: { hasSome: visible } }];
      }
      const cacheKey = this.listCache.key(tenantId, `list:${scope}:${page}:${limit}`);
      return this.redis.getOrSet(
        cacheKey,
        async () => {
          const skip = (page - 1) * limit;
          const [components, total] = await Promise.all([
            this.prisma.menuComponent.findMany({
              where,
              orderBy: { name: 'asc' },
              include: this.includeRelations,
              skip,
              take: limit,
            }),
            this.prisma.menuComponent.count({ where }),
          ]);
          this.logger.log(`Found ${components.length}/${total} menu components`);
          return {
            data: components,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
          };
        },
        // 3600 (pas 60) : catalogue rarement modifié, `listCache.invalidate()` purge déjà
        // cette clé à chaque écriture (:20-28) — le TTL est un filet de sécurité, pas
        // le mécanisme de fraîcheur (même raisonnement que menu-items.service.ts).
        { ttl: 3600 },
      );
    } catch (error) {
      this.logger.error(`Failed to fetch menu components: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Fetching menu component ${id} for tenant ${tenantId}`);
    const component = await this.prisma.menuComponent.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: this.includeRelations,
    });

    if (!component) {
      this.logger.warn(`Menu component ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Menu component with ID ${id} not found`);
    }

    await this.assertComponentSpaces(component.spaceIds, user);
    return component;
  }

  async update(id: string, dto: UpdateMenuComponentDto, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Updating menu component ${id} for tenant ${tenantId}`);
    const existing = await this.findOne(id, tenantId, user);

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.unit !== undefined) updateData.unit = dto.unit;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.unitCost !== undefined) updateData.unitCost = dto.unitCost;
    if (dto.allergens !== undefined) updateData.allergens = dto.allergens;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.storageType !== undefined) updateData.storageType = dto.storageType;
    if (dto.subComponents !== undefined) updateData.subComponents = dto.subComponents;
    if (dto.componentCategory !== undefined) updateData.componentCategory = dto.componentCategory;
    if (dto.numberOfUnitsRecipe !== undefined)
      updateData.numberOfUnitsRecipe = dto.numberOfUnitsRecipe;
    if (dto.packedUnits !== undefined) updateData.packedUnits = dto.packedUnits;
    if (dto.inventoryPackaging !== undefined)
      updateData.inventoryPackaging = dto.inventoryPackaging;
    if (dto.readyForSale !== undefined) updateData.readyForSale = dto.readyForSale;
    Object.assign(updateData, await resolveKitchenFields(this.prisma, dto, tenantId));
    if (dto.picture !== undefined) updateData.picture = await this.storage.resolveImage(dto.picture, 'components');
    if (dto.spaceIds !== undefined) updateData.spaceIds = await this.scopedSpaces(dto.spaceIds, existing.spaceIds, user);
    if (dto.componentTypeId !== undefined) updateData.componentTypeId = dto.componentTypeId;
    if (dto.componentCategoryId !== undefined)
      updateData.componentCategoryId = dto.componentCategoryId;

    const ingredientsLines = Array.isArray((dto as any).ingredients)
      ? (dto as any).ingredients
      : undefined;
    const childrenLines = Array.isArray((dto as any).children) ? (dto as any).children : undefined;

    await Promise.all([
      this.menuComponentValidationService.assertIngredientsExist(
        (ingredientsLines || []).map((l: any) => l?.ingredientId),
        tenantId,
      ),
      this.menuComponentValidationService.assertChildrenExist(
        (childrenLines || []).map((l: any) => l?.childId),
        tenantId,
      ),
      this.menuComponentValidationService.assertComponentTypeAccessible(dto.componentTypeId, tenantId),
      this.menuComponentValidationService.assertComponentCategoryAccessible(dto.componentCategoryId, tenantId),
    ]);

    if (ingredientsLines) {
      updateData.ingredients = {
        deleteMany: {},
        create: ingredientsLines.map((l: any) => ({
          ingredientId: l.ingredientId,
          quantity: Number(l.quantity ?? l.numberOfUnits),
          unit: l.unit,
          unitCost: this.menuComponentValidationService.toDecimalOrUndefined(l.unitCost),
          cost: this.menuComponentValidationService.toDecimalOrUndefined(l.cost),
        })),
      };
    }

    if (childrenLines) {
      updateData.children = {
        deleteMany: {},
        create: childrenLines.map((l: any) => ({
          childId: l.childId,
          quantity: Number(l.quantity),
          unit: l.unit,
          cost: this.menuComponentValidationService.toDecimalOrUndefined(l.cost),
        })),
      };
    }

    try {
      const component = await this.prisma.menuComponent.update({
        where: { id },
        data: updateData,
        include: this.includeRelations,
      });
      this.logger.log(`Menu component ${id} updated`);

      if (ingredientsLines || childrenLines) {
        await this.menuComponentCostService.refreshCosts(tenantId, { componentIds: [id] });
        await this.listCache.invalidate(tenantId);
        return this.findOne(id, tenantId);
      }

      await this.listCache.invalidate(tenantId);
      return component;
    } catch (error) {
      this.logger.error(`Failed to update menu component ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        const field = (error as any)?.meta?.field_name;
        throw new BadRequestException(
          field
            ? `Invalid reference: ${field}`
            : `Invalid ingredient or child component ID in the provided data`,
        );
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`Menu component with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Deleting menu component ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId, user);

    try {
      const result = await this.prisma.menuComponent.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      this.logger.log(`Menu component ${id} soft-deleted`);
      await this.listCache.invalidate(tenantId);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete menu component ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2025') {
        throw new NotFoundException(`Menu component with ID ${id} not found`);
      }
      throw error;
    }
  }

  async repair(tenantId: string) {
    this.logger.log(`Repairing menu components for tenant ${tenantId}...`);
    try {
      // Recalculate unit costs from subComponents
      const components = await this.prisma.menuComponent.findMany({
        where: { tenantId },
        include: this.includeRelations,
      });

      let repaired = 0;
      for (const comp of components) {
        const subComps = comp.subComponents as any[];
        if (subComps && Array.isArray(subComps) && subComps.length > 0) {
          const totalCost = subComps.reduce((sum, sub) => sum + (Number(sub.cost) || 0), 0);
          const unitCost = totalCost * (comp.numberOfUnitsRecipe || 1);
          await this.prisma.menuComponent.update({
            where: { id: comp.id },
            data: { unitCost },
          });
          repaired++;
        }
      }

      this.logger.log(`Repaired ${repaired} menu components`);
      return { repaired, total: components.length };
    } catch (error) {
      this.logger.error(`Failed to repair menu components: ${error.message}`, error.stack);
      throw error;
    }
  }
}
