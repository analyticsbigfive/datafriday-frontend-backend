import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { CreateMenuItemDto } from '../dto/create-menu-item.dto';
import { UpdateMenuItemDto } from '../dto/update-menu-item.dto';
import { SupabaseStorageService } from '../../../core/supabase/supabase-storage.service';
import { MenuItemCostService } from './menu-item-cost.service';
import { MenuItemSupportService } from './menu-item-support.service';
import { MenuItemQueryService } from './menu-item-query.service';
import { resolveKitchenFields } from '../../../shared/utils/resolve-kitchen';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

// Mapping des valeurs diet frontend → enum Diet Prisma
function mapDiet(diet: string[]): string[] {
  if (!diet?.length) return [];
  const map: Record<string, string> = {
    Vegan: 'Vegan',
    vegan: 'Vegan',
    'Végétarien': 'Vegetarian',
    Vegetarian: 'Vegetarian',
    vegetarian: 'Vegetarian',
    'Sans gluten': 'GlutenFree',
    GlutenFree: 'GlutenFree',
    glutenfree: 'GlutenFree',
    Halal: 'Halal',
    halal: 'Halal',
    Casher: 'Kosher',
    Kosher: 'Kosher',
    kosher: 'Kosher',
  };
  return diet.map(d => map[d] ?? null).filter(Boolean);
}

/**
 * Création, mise à jour et suppression d'un article de menu.
 */
@Injectable()
export class MenuItemCommandService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private readonly menuItemCostService: MenuItemCostService,
    private readonly menuItemSupportService: MenuItemSupportService,
    private readonly menuItemQueryService: MenuItemQueryService,
  ) {}

  private readonly logger = new Logger(MenuItemCommandService.name);

  async create(dto: CreateMenuItemDto, tenantId: string) {
    this.logger.log(`Creating menu item "${dto.name}" for tenant ${tenantId}`);
    this.logger.debug(`Validating IDs - typeId: ${dto.typeId}, categoryId: ${dto.categoryId}`);

    if (dto.dedupeByName && dto.name?.trim()) {
      const existing = await this.prisma.menuItem.findFirst({
        where: { tenantId, deletedAt: null, name: { equals: dto.name.trim(), mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing) {
        this.logger.log(
          `dedupeByName: reusing existing menu item ${existing.id} for name "${dto.name}" instead of creating a duplicate`,
        );
        await this.menuItemSupportService.linkSpacesAdditive(existing.id, tenantId, (dto as any).spaceIds, (dto as any).spacePrices);
        return this.menuItemQueryService.findOne(existing.id, tenantId);
      }
    }

    try {
      const componentsLines = Array.isArray((dto as any).components) ? (dto as any).components : undefined;
      const ingredientsLines = Array.isArray((dto as any).ingredients) ? (dto as any).ingredients : undefined;
      const packagingsLines = Array.isArray((dto as any).packagings) ? (dto as any).packagings : undefined;
      const comboItemsLines = Array.isArray((dto as any).comboItems) ? (dto as any).comboItems : undefined;

      if (ingredientsLines) {
        this.logger.debug(`Ingredient IDs: ${ingredientsLines.map((i: any) => i.ingredientId).join(', ')}`);
      }
      if (packagingsLines) {
        this.logger.debug(`Packaging IDs: ${packagingsLines.map((p: any) => p.packagingId).join(', ')}`);
      }
      if (componentsLines) {
        this.logger.debug(`Component IDs: ${componentsLines.map((c: any) => c.componentId).join(', ')}`);
      }

      const picture = await this.storage.resolveImage(dto.picture, 'menu-items');
      const item = await this.prisma.menuItem.create({
        data: {
          tenantId,
          name: dto.name,
          typeId: dto.typeId || null,
          categoryId: dto.categoryId || null,
          brandId: dto.brandId || null,
          displayNameId: dto.displayNameId || null,
          seasonId: dto.seasonId || null,
          isCombo: dto.isCombo ?? false,
          basePrice: dto.basePrice,
          vatRate: dto.vatRate ?? null,
          discountType: dto.discountType ?? null,
          discountValue: dto.discountValue ?? null,
          totalCost: dto.totalCost,
          margin: dto.margin,
          description: dto.description,
          picture,
          allergens: dto.allergens || [],
          diet: mapDiet(dto.diet || []) as any[],
          storageType: dto.storageType || [],
          readyForSale: dto.readyForSale,
          kitchenType: null,
          ...(await resolveKitchenFields(this.prisma, dto, tenantId)),
          comboItem: dto.comboItem,
          numberOfPiecesRecipe: dto.numberOfPiecesRecipe,
          componentsData: dto.componentsData,
          inventoryPackagingType: (dto as any).inventoryPackagingType ?? null,
          inventoryNumberOfUnits: (dto as any).inventoryNumberOfUnits ?? null,
          inventoryUnit: (dto as any).inventoryUnit ?? null,

          ...(componentsLines
            ? {
                components: {
                  create: componentsLines.map((l: any) => ({
                    componentId: l.componentId,
                    numberOfUnits: this.menuItemSupportService.toNumber(l.numberOfUnits),
                  })),
                },
              }
            : {}),

          ...(ingredientsLines
            ? {
                ingredients: {
                  create: ingredientsLines.map((l: any) => ({
                    ingredientId: l.ingredientId,
                    numberOfUnits: this.menuItemSupportService.toNumber(l.numberOfUnits),
                  })),
                },
              }
            : {}),

          ...(packagingsLines
            ? {
                packagings: {
                  create: packagingsLines.map((l: any) => ({
                    packagingId: l.packagingId,
                    numberOfUnits: this.menuItemSupportService.toNumber(l.numberOfUnits),
                  })),
                },
              }
            : {}),

          ...(comboItemsLines
            ? {
                comboChildren: {
                  create: comboItemsLines.map((l: any) => ({
                    childId: l.childId,
                    quantity: this.menuItemSupportService.toNumber(l.quantity),
                    unit: l.unit,
                    cost: l.cost != null ? Number(l.cost) : undefined,
                  })),
                },
              }
            : {}),

          // Promotion « cet item est en promotion » → ligne Promotion liée (0 ou 1).
          ...(dto.isOnPromotion
            ? {
                promotion: {
                  create: {
                    tenantId,
                    discountedProductId: dto.discountedProductId || null,
                    promotionTypeId: dto.promotionTypeId || null,
                    isActive: true,
                  },
                },
              }
            : {}),
        } as any,
        include: this.menuItemSupportService.includeRelations,
      });
      this.logger.log(`Menu item created: ${item.id}`);

      // Associations espace + prix par espace → table SpaceMenuItem (contrat DTO inchangé).
      await this.menuItemSupportService.syncSpaceLinks(item.id, tenantId, {
        spaceIds: (dto as any).spaceIds,
        spacePrices: (dto as any).spacePrices,
      });

      if (componentsLines || ingredientsLines || packagingsLines) {
        await this.menuItemCostService.refreshCosts(tenantId, { itemIds: [item.id] });
      }
      if (comboItemsLines && comboItemsLines.length > 0) {
        await this.menuItemCostService.refreshComboCost(tenantId, item.id);
      }

      await this.menuItemSupportService.listCache.invalidate(tenantId);
      const refreshed = await this.menuItemQueryService.findOne(item.id, tenantId);
      return refreshed;
    } catch (error) {
      this.logger.error(`Failed to create menu item: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        const fieldName = error.meta?.field_name || 'unknown field';
        this.logger.error(`Foreign key constraint failed on: ${fieldName}`);
        throw new BadRequestException(
          `Invalid ID provided. Foreign key constraint failed on: ${fieldName}. ` +
          `Please verify that the typeId, categoryId, componentId, ingredientId, or packagingId exists in the database.`
        );
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(this.menuItemSupportService.describeMenuItemUniqueConstraintError(error));
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateMenuItemDto, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Updating menu item ${id} for tenant ${tenantId}`);
    // Contrôle d'existence et d'accès espace (404/403) avant toute écriture.
    await this.menuItemQueryService.findOne(id, tenantId, user);

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.typeId !== undefined) updateData.typeId = dto.typeId;
    if (dto.categoryId !== undefined) updateData.categoryId = dto.categoryId;
    if (dto.brandId !== undefined) updateData.brandId = dto.brandId || null;
    if (dto.displayNameId !== undefined) updateData.displayNameId = dto.displayNameId || null;
    if (dto.seasonId !== undefined) updateData.seasonId = dto.seasonId || null;
    if (dto.isCombo !== undefined) updateData.isCombo = dto.isCombo;
    if (dto.basePrice !== undefined) updateData.basePrice = dto.basePrice;
    if (dto.vatRate !== undefined) updateData.vatRate = dto.vatRate ?? null;
    if (dto.discountType !== undefined) updateData.discountType = dto.discountType ?? null;
    if (dto.discountValue !== undefined) updateData.discountValue = dto.discountValue ?? null;
    if (dto.totalCost !== undefined) updateData.totalCost = dto.totalCost;
    if (dto.margin !== undefined) updateData.margin = dto.margin;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.picture !== undefined) updateData.picture = await this.storage.resolveImage(dto.picture, 'menu-items');
    if (dto.allergens !== undefined) updateData.allergens = dto.allergens;
    if (dto.diet !== undefined) updateData.diet = mapDiet(dto.diet) as any[];
    if (dto.storageType !== undefined) updateData.storageType = dto.storageType;
    if (dto.readyForSale !== undefined) updateData.readyForSale = dto.readyForSale;
    Object.assign(updateData, await resolveKitchenFields(this.prisma, dto, tenantId));
    if (dto.comboItem !== undefined) updateData.comboItem = dto.comboItem;
    if (dto.numberOfPiecesRecipe !== undefined) updateData.numberOfPiecesRecipe = dto.numberOfPiecesRecipe;
    if (dto.componentsData !== undefined) updateData.componentsData = dto.componentsData;
    if ((dto as any).inventoryPackagingType !== undefined) updateData.inventoryPackagingType = (dto as any).inventoryPackagingType;
    if ((dto as any).inventoryNumberOfUnits !== undefined) updateData.inventoryNumberOfUnits = (dto as any).inventoryNumberOfUnits;
    if ((dto as any).inventoryUnit !== undefined) updateData.inventoryUnit = (dto as any).inventoryUnit;
    // spaceIds/spacePrices : plus des colonnes — synchronisés vers SpaceMenuItem après l'update.

    const componentsLines = Array.isArray((dto as any).components) ? (dto as any).components : undefined;
    const ingredientsLines = Array.isArray((dto as any).ingredients) ? (dto as any).ingredients : undefined;
    const packagingsLines = Array.isArray((dto as any).packagings) ? (dto as any).packagings : undefined;
    const comboItemsLines = Array.isArray((dto as any).comboItems) ? (dto as any).comboItems : undefined;

    if (componentsLines) {
      updateData.components = {
        deleteMany: {},
        create: componentsLines.map((l: any) => ({
          componentId: l.componentId,
          numberOfUnits: this.menuItemSupportService.toNumber(l.numberOfUnits),
        })),
      };
    }
    if (ingredientsLines) {
      updateData.ingredients = {
        deleteMany: {},
        create: ingredientsLines.map((l: any) => ({
          ingredientId: l.ingredientId,
          numberOfUnits: this.menuItemSupportService.toNumber(l.numberOfUnits),
        })),
      };
    }
    if (packagingsLines) {
      updateData.packagings = {
        deleteMany: {},
        create: packagingsLines.map((l: any) => ({
          packagingId: l.packagingId,
          numberOfUnits: this.menuItemSupportService.toNumber(l.numberOfUnits),
        })),
      };
    }
    if (comboItemsLines) {
      updateData.comboChildren = {
        deleteMany: {},
        create: comboItemsLines.map((l: any) => ({
          childId: l.childId,
          quantity: this.menuItemSupportService.toNumber(l.quantity),
          unit: l.unit,
          cost: l.cost != null ? Number(l.cost) : undefined,
        })),
      };
    }

    try {
      await this.prisma.menuItem.update({
        where: { id },
        data: updateData,
        include: this.menuItemSupportService.includeRelations,
      });
      this.logger.log(`Menu item ${id} updated`);

      await this.menuItemSupportService.syncSpaceLinks(id, tenantId, {
        spaceIds: (dto as any).spaceIds,
        spacePrices: (dto as any).spacePrices,
      });

      // Promotion « cet item est en promotion » : upsert (créer/maj le produit remisé + type)
      // ou suppression selon le flag. menuItemId est @unique → upsert par menuItemId.
      if (dto.isOnPromotion !== undefined) {
        if (dto.isOnPromotion) {
          await this.prisma.promotion.upsert({
            where: { menuItemId: id },
            create: {
              tenantId,
              menuItemId: id,
              discountedProductId: dto.discountedProductId || null,
              promotionTypeId: dto.promotionTypeId || null,
              isActive: true,
            },
            update: {
              discountedProductId: dto.discountedProductId || null,
              promotionTypeId: dto.promotionTypeId || null,
              isActive: true,
            },
          });
        } else {
          await this.prisma.promotion.deleteMany({ where: { menuItemId: id } });
        }
      }

      if (componentsLines || ingredientsLines || packagingsLines) {
        await this.menuItemCostService.refreshCosts(tenantId, { itemIds: [id] });
      }
      if (comboItemsLines && comboItemsLines.length > 0) {
        await this.menuItemCostService.refreshComboCost(tenantId, id);
      }

      await this.menuItemSupportService.listCache.invalidate(tenantId);
      return this.menuItemQueryService.findOne(id, tenantId);
    } catch (error) {
      this.logger.error(`Failed to update menu item ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid typeId, categoryId, componentId, ingredientId, or packagingId provided`);
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`Menu item with ID ${id} not found`);
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(this.menuItemSupportService.describeMenuItemUniqueConstraintError(error));
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Soft-deleting menu item ${id} for tenant ${tenantId}`);
    await this.menuItemQueryService.findOne(id, tenantId, user);
    try {
      const result = await this.prisma.menuItem.update({ where: { id }, data: { deletedAt: new Date() } });
      // Invariant : un MenuItem soft-deleted ne doit JAMAIS rester référencé par un mapping
      // Weezevent → sinon la Data Integration affiche un mapping vers un article disparu de la
      // liste (champ vide, non remappable). On supprime donc les mappings produit liés.
      // (Le soft-delete ne déclenche pas le cascade FK qui n'agit qu'au hard-delete.)
      const purged = await this.prisma.productMapping.deleteMany({ where: { tenantId, menuItemId: id } });
      if (purged.count > 0) {
        this.logger.log(`Removed ${purged.count} Weezevent product mapping(s) pointing to soft-deleted menu item ${id}`);
      }
      // Même invariant côté prix par espace : un MenuItem soft-deleted ne doit jamais laisser de
      // SpaceMenuItem orphelin derrière lui (BUG-051), sinon ces lignes s'accumulent à chaque
      // ré-import/re-mapping sans jamais être nettoyées.
      const purgedSpaceLinks = await this.prisma.spaceMenuItem.deleteMany({ where: { menuItemId: id } });
      if (purgedSpaceLinks.count > 0) {
        this.logger.log(`Removed ${purgedSpaceLinks.count} space price override(s) pointing to soft-deleted menu item ${id}`);
      }
      this.logger.log(`Menu item ${id} soft-deleted`);
      await this.menuItemSupportService.listCache.invalidate(tenantId);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete menu item ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2025') {
        throw new NotFoundException(`Menu item with ID ${id} not found`);
      }
      throw error;
    }
  }
}
