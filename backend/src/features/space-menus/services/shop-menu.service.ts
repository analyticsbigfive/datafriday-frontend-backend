import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { MenuItemPricingService } from '../../../shared/pricing/menu-item-pricing.service';
import { linksToSpacePrices, spaceLinksSelect } from '../../../shared/pricing/space-links.util';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { SpaceMenuScopeService } from './space-menu-scope.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

const ASSERT_SPACE_ACCESS_DENIED = "Vous n'avez pas accès à l'espace de ce shop.";

/**
 * Menu d'un shop (articles assignés, prix et disponibilité).
 */
@Injectable()
export class ShopMenuService {
  constructor(
    private prisma: PrismaService,
    private pricing: MenuItemPricingService,
    private spaceAccess: SpaceAccessService,
    private readonly spaceMenuScopeService: SpaceMenuScopeService,
  ) {}

  private readonly logger = new Logger(ShopMenuService.name);

  /**
   * Get all menu items assigned to a shop (SpaceElement)
   * Returns shop info + all menu items with their ingredients, components, and packagings
   * `configId` : scope des assignations (cf. resolveShopConfigId pour le repli).
   */
  async getShopMenu(shopId: string, tenantId: string, configId?: string, user?: SpaceScopedUser) {
    this.logger.debug(`Getting shop menu for shopId=${shopId} tenantId=${tenantId} configId=${configId ?? '(auto)'}`);

    // Get the shop (SpaceElement) with its menu assignments
    const shop = await this.prisma.spaceElement.findFirst({
      where: {
        id: shopId,
        ...this.spaceMenuScopeService.tenantShopOwnershipWhere(tenantId),
      },
      select: {
        id: true,
        name: true,
        type: true,
        notes: true,
        image: true,
        attributes: true,
        shopTypes: true,
        subtypes: true,
        floor: { select: { config: { select: { id: true, spaceId: true } } } },
        forecourt: { select: { config: { select: { id: true, spaceId: true } } } },
        externalMerch: { select: { config: { select: { id: true, spaceId: true } } } },
        zone: { select: { spaceId: true } }, // Builder v2
        configurationElements: { select: { configId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        menuAssignments: {
          // BUG-051 : une MenuAssignment ne doit jamais exposer un MenuItem soft-deleted (ex.
          // doublon nettoyé lors d'un re-mapping Data Integration) — sinon l'article réapparaît
          // ici avec un prix à 0/vide comme s'il était toujours en vente.
          where: { menuItem: { deletedAt: null } },
          select: {
            menuItemId: true,
            enabled: true,
            configId: true,
            menuItem: {
              select: {
                id: true,
                name: true,
                basePrice: true,
                vatRate: true,
                discountType: true,
                discountValue: true,
                spaceLinks: spaceLinksSelect,
                totalCost: true,
                margin: true,
                description: true,
                picture: true,
                diet: true,
                allergens: true,
                storageType: true,
                readyForSale: true,
                comboItem: true,
                numberOfPiecesRecipe: true,
                productType: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                productCategory: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                // Components with their details (MenuItemComponent)
                components: {
                  select: {
                    id: true,
                    numberOfUnits: true,
                    unitCost: true,
                    totalCost: true,
                    storageType: true,
                    component: {
                      select: {
                        id: true,
                        name: true,
                        unit: true,
                        unitCost: true,
                        storageType: true,
                        category: true,
                        allergens: true,
                        description: true,
                        componentCategory: true,
                        numberOfUnitsRecipe: true,
                        // Nested ingredients in components (ComponentIngredient)
                        ingredients: {
                          select: {
                            id: true,
                            quantity: true,
                            unit: true,
                            unitCost: true,
                            cost: true,
                            ingredient: {
                              select: {
                                id: true,
                                name: true,
                                recipeUnit: true,
                                purchaseUnit: true,
                                costPerRecipeUnit: true,
                                costPerPurchaseUnit: true,
                                storageType: true,
                                ingredientCategory: true,
                                supplier: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                // Direct ingredients (MenuItemIngredient)
                ingredients: {
                  select: {
                    id: true,
                    numberOfUnits: true,
                    unitCost: true,
                    totalCost: true,
                    storageType: true,
                    ingredient: {
                      select: {
                        id: true,
                        name: true,
                        recipeUnit: true,
                        purchaseUnit: true,
                        costPerRecipeUnit: true,
                        costPerPurchaseUnit: true,
                        storageType: true,
                        ingredientCategory: true,
                        supplier: true,
                      },
                    },
                  },
                },
                // Packagings (MenuItemPackaging)
                packagings: {
                  select: {
                    id: true,
                    numberOfUnits: true,
                    unitCost: true,
                    totalCost: true,
                    storageType: true,
                    packaging: {
                      select: {
                        id: true,
                        name: true,
                        recipeUnit: true,
                        purchaseUnit: true,
                        costPerRecipeUnit: true,
                        costPerPurchaseUnit: true,
                        storageType: true,
                        supplier: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    } as any);

    if (!shop) {
      throw new NotFoundException(`Shop with ID ${shopId} not found`);
    }

    const shopAny = shop as any;
    const tenantVatRate = await this.pricing.getTenantDefaultVatRate(tenantId);

    // Ne garder que les assignations de la config effective : depuis le scoping par
    // configuration, un élément partagé porte une ligne PAR config — sans ce filtre,
    // chaque menu item apparaîtrait en double (une fois par config adhérente).
    const effectiveConfigId = this.spaceMenuScopeService.resolveShopConfigId(shopAny, configId);
    const scopedAssignments = (shopAny.menuAssignments ?? []).filter(
      (a: any) => (a.configId ?? null) === effectiveConfigId,
    );

    // spaceId du shop — BUG-060 : sans lui, `spaceLinks` ne peut pas être scopé et la réponse
    // exposait les prix custom de TOUS les espaces ayant un SpaceMenuItem pour l'item, pas
    // seulement celui du shop.
    const spaceId = this.spaceMenuScopeService.resolveShopSpaceId(shopAny);
    await this.spaceAccess.assertCanAccessSpace(user, spaceId, ASSERT_SPACE_ACCESS_DENIED);

    // Transform the data to a cleaner format
    const menuItems = scopedAssignments.map((assignment: any) => {
      const mi = assignment.menuItem;
      const spaceScopedLinks = (mi.spaceLinks ?? []).filter((l: any) => l.spaceId === spaceId);
      return {
        id: mi.id,
        name: mi.name,
        description: mi.description,
        picture: mi.picture,
        basePrice: Number(mi.basePrice || 0),
        totalCost: Number(mi.totalCost || 0),
        margin: mi.margin,
        // Décomposition prix complète (TTC/HT/taxe/remise) — même contrat que /menu-items.
        pricing: this.pricing.computePricing(mi, tenantVatRate, null),
        spacePricing: this.pricing.computeSpacePricing(
          { ...mi, spacePrices: linksToSpacePrices(spaceScopedLinks) },
          tenantVatRate,
          null,
        ),
        diet: mi.diet || [],
        allergens: mi.allergens || [],
        storageType: mi.storageType || [],
        readyForSale: mi.readyForSale,
        comboItem: mi.comboItem,
        numberOfPiecesRecipe: mi.numberOfPiecesRecipe,
        enabled: assignment.enabled,
        productType: mi.productType,
        productCategory: mi.productCategory,

        // Components with nested ingredients
        components: (mi.components || []).map((comp: any) => ({
          id: comp.id,
          numberOfUnits: comp.numberOfUnits,
          unitCost: Number(comp.unitCost || 0),
          totalCost: Number(comp.totalCost || 0),
          storageType: comp.storageType,
          component: {
            id: comp.component.id,
            name: comp.component.name,
            unit: comp.component.unit,
            unitCost: Number(comp.component.unitCost || 0),
            storageType: comp.component.storageType,
            category: comp.component.category,
            componentCategory: comp.component.componentCategory,
            allergens: comp.component.allergens || [],
            description: comp.component.description,
            numberOfUnitsRecipe: comp.component.numberOfUnitsRecipe,
            ingredients: (comp.component.ingredients || []).map((ing: any) => ({
              id: ing.id,
              quantity: ing.quantity,
              unit: ing.unit,
              unitCost: Number(ing.unitCost || 0),
              cost: Number(ing.cost || 0),
              ingredient: {
                id: ing.ingredient.id,
                name: ing.ingredient.name,
                recipeUnit: ing.ingredient.recipeUnit,
                purchaseUnit: ing.ingredient.purchaseUnit,
                costPerRecipeUnit: Number(ing.ingredient.costPerRecipeUnit || 0),
                costPerPurchaseUnit: Number(ing.ingredient.costPerPurchaseUnit || 0),
                storageType: ing.ingredient.storageType,
                ingredientCategory: ing.ingredient.ingredientCategory,
                supplier: ing.ingredient.supplier,
              },
            })),
          },
        })),

        // Direct ingredients
        ingredients: (mi.ingredients || []).map((ing: any) => ({
          id: ing.id,
          numberOfUnits: ing.numberOfUnits,
          unitCost: Number(ing.unitCost || 0),
          totalCost: Number(ing.totalCost || 0),
          storageType: ing.storageType,
          ingredient: {
            id: ing.ingredient.id,
            name: ing.ingredient.name,
            recipeUnit: ing.ingredient.recipeUnit,
            purchaseUnit: ing.ingredient.purchaseUnit,
            costPerRecipeUnit: Number(ing.ingredient.costPerRecipeUnit || 0),
            costPerPurchaseUnit: Number(ing.ingredient.costPerPurchaseUnit || 0),
            storageType: ing.ingredient.storageType,
            ingredientCategory: ing.ingredient.ingredientCategory,
            supplier: ing.ingredient.supplier,
          },
        })),

        // Packagings
        packagings: (mi.packagings || []).map((pack: any) => ({
          id: pack.id,
          numberOfUnits: pack.numberOfUnits,
          unitCost: Number(pack.unitCost || 0),
          totalCost: Number(pack.totalCost || 0),
          storageType: pack.storageType,
          packaging: {
            id: pack.packaging.id,
            name: pack.packaging.name,
            recipeUnit: pack.packaging.recipeUnit,
            purchaseUnit: pack.packaging.purchaseUnit,
            costPerRecipeUnit: Number(pack.packaging.costPerRecipeUnit || 0),
            costPerPurchaseUnit: Number(pack.packaging.costPerPurchaseUnit || 0),
            storageType: pack.packaging.storageType,
            supplier: pack.packaging.supplier,
          },
        })),
      };
    });

    return {
      shopId: shopAny.id,
      shopName: shopAny.name,
      shopType: shopAny.type,
      // Priorité subtypes (Builder v2, autoritaire) > shopTypes (colonne v1 héritée) —
      // même règle que getSpaceShops (spaces.service.ts), sinon ce endpoint pré-remplirait
      // ShopDetailEditDrawer avec une valeur périmée pour un shop édité depuis le Builder.
      shopSubTypes: (Array.isArray(shopAny.subtypes) && shopAny.subtypes.length) ? shopAny.subtypes : (shopAny.shopTypes || []),
      notes: shopAny.notes,
      image: shopAny.image,
      attributes: shopAny.attributes,
      spaceId,
      configId: effectiveConfigId,
      menuItems,
    };
  }
}
