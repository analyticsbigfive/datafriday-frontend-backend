import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { MenuItemPricingService } from '../../shared/pricing/menu-item-pricing.service';
import { linksToSpacePrices, spaceLinksSelect } from '../../shared/pricing/space-links.util';
import { SpaceAccessService } from '../../core/auth/space-access.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/** Raison structurée d'indisponibilité d'un menu item (par ingrédient/packaging). */
type MissingReason = {
  kind: 'ingredient' | 'packaging';
  name: string;
  reason: 'INACTIVE' | 'NO_SUPPLIER' | 'SUPPLIER_NOT_IN_SPACE';
  supplierId?: string;
  supplierName?: string;
};

@Injectable()
export class SpaceMenusService {
  private readonly logger = new Logger(SpaceMenusService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private pricing: MenuItemPricingService,
    private spaceAccess: SpaceAccessService,
  ) {}

  /** Lève 403 si `user` n'a pas accès à cet espace (cf. SpaceAccessService). */
  private async assertSpaceAccess(spaceId: string | null | undefined, user?: SpaceScopedUser) {
    if (!user || !spaceId) return;
    if (this.spaceAccess.hasFullAccess(user)) return;
    const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
    if (accessible === 'ALL' || accessible.includes(spaceId)) return;
    throw new ForbiddenException("Vous n'avez pas accès à l'espace de ce shop.");
  }

  /**
   * Invalidations croisées après une écriture d'assignation menu : sans elles, le front
   * relisait des compteurs/lists périmés même avec un forceRefresh (cause racine des
   * « je dois hard-refresh » sur /space-menus).
   * ⚠️ Les motifs de clés dupliquent ceux de MenuItemsService.cacheKey et
   * SpacesService.SPACE_SHOPS_CACHE_KEY — à garder synchronisés.
   */
  private async invalidateAfterAssignmentWrite(tenantId: string, spaceId: string) {
    await Promise.all([
      this.redis.deletePattern(`menu-items:${tenantId}:*`),
      this.redis.deletePattern(`spaces:shops:${tenantId}:${spaceId}*`),
    ]);
  }

  /**
   * Condition 0 (spec utilisateur 2026-07-03) : un menu item n'est visible sur
   * /space-menus (Available OU Not Available) que s'il est associé à l'espace.
   * Association = STRICTEMENT une ligne `SpaceMenuItem` (table relationnelle, un item
   * peut appartenir à 1..N espaces) pour ce spaceId — alimentée par le select « Space »
   * du formulaire d'édition (contrat API `spaceIds` inchangé). Aucune ligne = associé
   * à aucun espace = invisible partout.
   * ⚠️ Pas de repli sur les MenuAssignment existants : une 1re version incluait les
   * items « déjà attachés à un shop de l'espace » (heal legacy) — explicitement
   * rejetée par l'utilisateur (item au champ Space vide qui s'affichait quand même).
   */
  private spaceAssociationWhere(spaceId: string) {
    return { spaceLinks: { some: { spaceId } } };
  }

  /**
   * Config effective d'un shop pour lire ses assignations menu :
   * configId explicite (fourni par le front) > config du parent v1 (floor/forecourt/
   * externalMerch) > PREMIÈRE adhésion v2 (ordre createdAt — repli rétro-compat pour les
   * appelants qui n'envoient pas encore de configId ; arbitraire quand l'élément est
   * partagé entre configs, le front doit TOUJOURS l'envoyer).
   */
  private resolveShopConfigId(
    shop: { floor?: any; forecourt?: any; externalMerch?: any; configurationElements?: any[] },
    explicitConfigId?: string,
  ): string | null {
    if (explicitConfigId) return explicitConfigId;
    const v1Config = shop.floor?.config ?? shop.forecourt?.config ?? shop.externalMerch?.config;
    return v1Config?.id ?? shop.configurationElements?.[0]?.configId ?? null;
  }

  /**
   * BUG-061 : clause d'appartenance tenant d'un SpaceElement (shop), dupliquée à l'identique
   * dans getShopMenu/getShopAvailableMenuItems/getShopInventory/getStorageInventory avant cette
   * factorisation — un shop appartient au tenant via son floor/forecourt/externalMerch (builder
   * v1) ou sa zone (builder v2, `ConfigurationElement`).
   */
  private tenantShopOwnershipWhere(tenantId: string) {
    return {
      OR: [
        { floor: { config: { space: { tenantId } } } },
        { forecourt: { config: { space: { tenantId } } } },
        { externalMerch: { config: { space: { tenantId } } } },
        { zone: { space: { tenantId } } }, // Builder v2
      ],
    };
  }

  /**
   * BUG-061 : résolution du spaceId d'un shop — dupliquée à l'identique dans les 4 mêmes
   * méthodes. ⚠️ Suppose que le `select` Prisma de l'appelant inclut bien `spaceId` sur
   * floor/forecourt/externalMerch.config ET sur zone (cause racine de BUG-060 : un `select`
   * qui l'omettait empêchait silencieusement la résolution).
   */
  private resolveShopSpaceId(shop: {
    floor?: any;
    forecourt?: any;
    externalMerch?: any;
    zone?: any;
  }): string | null {
    const config = shop.floor?.config ?? shop.forecourt?.config ?? shop.externalMerch?.config ?? null;
    return config?.spaceId ?? shop.zone?.spaceId ?? null;
  }

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
        ...this.tenantShopOwnershipWhere(tenantId),
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
    const effectiveConfigId = this.resolveShopConfigId(shopAny, configId);
    const scopedAssignments = (shopAny.menuAssignments ?? []).filter(
      (a: any) => (a.configId ?? null) === effectiveConfigId,
    );

    // spaceId du shop — BUG-060 : sans lui, `spaceLinks` ne peut pas être scopé et la réponse
    // exposait les prix custom de TOUS les espaces ayant un SpaceMenuItem pour l'item, pas
    // seulement celui du shop.
    const spaceId = this.resolveShopSpaceId(shopAny);
    await this.assertSpaceAccess(spaceId, user);

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

  /**
   * Menu items ASSOCIÉS À L'ESPACE (condition 0, cf. spaceAssociationWhere) avec
   * disponibilité calculée côté serveur. Une seule réponse légère : le front n'a
   * plus aucun calcul à faire.
   *
   * Un item associé est `available` pour cet espace ssi :
   *  1. il a une recette (au moins un ingrédient / composant / packaging) ;
   *  2. chaque ingrédient (direct, via composants récursifs, et packaging) est actif ;
   *  3. chaque ingrédient a un fournisseur résolu (Ingredient.marketPriceId →
   *     MarketPrice.supplierId) ;
   *  4. ce fournisseur livre l'espace : Supplier.sites contient EXPLICITEMENT
   *     le spaceId. Règle STRICTE (correction utilisateur 2026-07-03) : sites vide =
   *     ne livre pas cet espace → non disponible (l'ancienne règle prototype
   *     « vide = tous les espaces » est abandonnée).
   * Sinon `missingIngredients` liste chaque blocage avec sa raison.
   *
   * `spaceId` null (shop orphelin de config) → aucune association déterminable → [].
   */
  private async getItemsWithAvailabilityForSpace(
    tenantId: string,
    spaceId: string | null,
    onlyMenuItemIds?: string[],
  ) {
    if (!spaceId) return [];
    // Scope explicite (ex. enabledOnly : les seuls items activés sur un shop) — la condition 0
    // reste appliquée en plus : un item activé mais désassocié de l'espace ne réapparaît pas.
    if (onlyMenuItemIds && onlyMenuItemIds.length === 0) return [];

    // Tout le référentiel nécessaire en 7 requêtes parallèles indexées (tenant-scopées),
    // puis résolution en mémoire — pas de N+1, pas de recette imbriquée dans le payload.
    const [
      menuItems,
      ingredients,
      packagings,
      components,
      marketPrices,
      suppliers,
      tenantVatRate,
      comboSourceMenuItems,
    ] = await Promise.all([
        this.prisma.menuItem.findMany({
          where: {
            tenantId,
            deletedAt: null,
            ...this.spaceAssociationWhere(spaceId),
            ...(onlyMenuItemIds ? { id: { in: onlyMenuItemIds } } : {}),
          },
          select: {
            id: true,
            name: true,
            picture: true,
            basePrice: true,
            vatRate: true,
            discountType: true,
            discountValue: true,
            // Seule la ligne de CET espace nous intéresse (prix espace) — include scopé.
            spaceLinks: { where: { spaceId }, ...spaceLinksSelect },
            totalCost: true,
            productType: { select: { name: true } },
            productCategory: { select: { name: true } },
            ingredients: { select: { ingredientId: true } },
            packagings: { select: { packagingId: true } },
            components: { select: { componentId: true } },
            comboChildren: { select: { childId: true } },
          },
          orderBy: { name: 'asc' },
        }),
        this.prisma.ingredient.findMany({
          where: { tenantId },
          select: { id: true, name: true, active: true, deletedAt: true, marketPriceId: true },
        }),
        this.prisma.packaging.findMany({
          where: { tenantId },
          select: { id: true, name: true, active: true, deletedAt: true, marketPriceId: true },
        }),
        this.prisma.menuComponent.findMany({
          where: { tenantId },
          select: {
            id: true,
            name: true,
            deletedAt: true,
            ingredients: { select: { ingredientId: true } },
            children: { select: { childId: true } },
          },
        }),
        this.prisma.marketPrice.findMany({
          where: { tenantId },
          select: { id: true, supplierId: true, deletedAt: true },
        }),
        this.prisma.supplier.findMany({
          where: { tenantId },
          select: { id: true, name: true, sites: true },
        }),
        this.pricing.getTenantDefaultVatRate(tenantId),
        // Catalogue tenant complet (pas scopé espace) requis pour résoudre récursivement un
        // article combo qui référence un enfant absent de `menuItems` ci-dessus (enfant non
        // lui-même associé à cet espace) — même besoin que ingredients/packagings/components,
        // déjà chargés tenant-wide plus haut pour la même raison.
        this.prisma.menuItem.findMany({
          where: { tenantId },
          select: {
            id: true,
            deletedAt: true,
            ingredients: { select: { ingredientId: true } },
            packagings: { select: { packagingId: true } },
            components: { select: { componentId: true } },
            comboChildren: { select: { childId: true } },
          },
        }),
      ]);

    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
    const packagingById = new Map(packagings.map((p) => [p.id, p]));
    const componentById = new Map(components.map((c) => [c.id, c]));
    const marketPriceById = new Map(marketPrices.map((mp) => [mp.id, mp]));
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));
    const comboSourceById = new Map(comboSourceMenuItems.map((m) => [m.id, m]));

    const supplierServesSpace = (supplierId: string): boolean => {
      const supplier = supplierById.get(supplierId);
      if (!supplier) return false;
      // STRICT : le fournisseur ne livre l'espace que s'il y est explicitement rattaché.
      // sites vide = ne livre pas cet espace (pas d'interprétation « vide = tous »).
      return spaceId != null && Array.isArray(supplier.sites) && supplier.sites.includes(spaceId);
    };

    // Applique les 3 règles à un ingrédient OU un packaging ; null = OK.
    const checkSupplyItem = (
      item: { id: string; name: string; active: boolean; deletedAt: Date | null; marketPriceId: string | null } | undefined,
      kind: MissingReason['kind'],
    ): MissingReason | null => {
      if (!item || item.deletedAt || item.active === false) {
        return { kind, name: item?.name ?? 'Unknown', reason: 'INACTIVE' };
      }
      const marketPrice = item.marketPriceId ? marketPriceById.get(item.marketPriceId) : null;
      const supplierId = marketPrice && !marketPrice.deletedAt ? marketPrice.supplierId : null;
      if (!supplierId) {
        return { kind, name: item.name, reason: 'NO_SUPPLIER' };
      }
      if (!supplierServesSpace(supplierId)) {
        return {
          kind,
          name: item.name,
          reason: 'SUPPLIER_NOT_IN_SPACE',
          supplierId,
          supplierName: supplierById.get(supplierId)?.name,
        };
      }
      return null;
    };

    // Blocages d'un composant (récursif via ComponentComponent), mémoïsé — un même
    // composant partagé par des centaines d'items n'est résolu qu'une fois.
    const componentIssuesCache = new Map<string, MissingReason[]>();
    const collectComponentIssues = (componentId: string, stack: Set<string>): MissingReason[] => {
      const cached = componentIssuesCache.get(componentId);
      if (cached) return cached;
      if (stack.has(componentId)) return []; // garde anti-cycle
      stack.add(componentId);

      const component = componentById.get(componentId);
      const issues: MissingReason[] = [];
      if (!component || component.deletedAt) {
        stack.delete(componentId);
        return issues;
      }
      for (const ci of component.ingredients) {
        const issue = checkSupplyItem(ingredientById.get(ci.ingredientId), 'ingredient');
        if (issue) issues.push(issue);
      }
      for (const child of component.children) {
        issues.push(...collectComponentIssues(child.childId, stack));
      }
      stack.delete(componentId);
      componentIssuesCache.set(componentId, issues);
      return issues;
    };

    // Blocages d'un article combo (récursif via MenuItemCombo — un combo peut, en théorie,
    // référencer un autre combo), mémoïsé — même principe que collectComponentIssues. Un enfant
    // absent/soft-delete ne bloque pas le parent (parité avec collectComponentIssues) : ce n'est
    // pas une raison structurée exposable (kind 'ingredient'/'packaging' uniquement), et un combo
    // cassé remonte de toute façon "no recipe" ailleurs si besoin de durcir plus tard.
    const menuItemComboIssuesCache = new Map<string, MissingReason[]>();
    const collectMenuItemComboIssues = (menuItemId: string, stack: Set<string>): MissingReason[] => {
      const cached = menuItemComboIssuesCache.get(menuItemId);
      if (cached) return cached;
      if (stack.has(menuItemId)) return []; // garde anti-cycle
      stack.add(menuItemId);

      const child = comboSourceById.get(menuItemId);
      const issues: MissingReason[] = [];
      if (!child || child.deletedAt) {
        stack.delete(menuItemId);
        return issues;
      }
      for (const link of child.ingredients) {
        const issue = checkSupplyItem(ingredientById.get(link.ingredientId), 'ingredient');
        if (issue) issues.push(issue);
      }
      for (const link of child.packagings) {
        const issue = checkSupplyItem(packagingById.get(link.packagingId), 'packaging');
        if (issue) issues.push(issue);
      }
      for (const link of child.components) {
        issues.push(...collectComponentIssues(link.componentId, new Set()));
      }
      for (const link of child.comboChildren) {
        issues.push(...collectMenuItemComboIssues(link.childId, stack));
      }
      stack.delete(menuItemId);
      menuItemComboIssuesCache.set(menuItemId, issues);
      return issues;
    };

    return menuItems.map((mi) => {
      const dedup = new Map<string, MissingReason>();
      const push = (issue: MissingReason | null) => {
        if (issue) dedup.set(`${issue.kind}:${issue.name}:${issue.reason}`, issue);
      };

      for (const link of mi.ingredients) push(checkSupplyItem(ingredientById.get(link.ingredientId), 'ingredient'));
      for (const link of mi.packagings) push(checkSupplyItem(packagingById.get(link.packagingId), 'packaging'));
      for (const link of mi.components) {
        for (const issue of collectComponentIssues(link.componentId, new Set())) push(issue);
      }
      for (const link of mi.comboChildren) {
        for (const issue of collectMenuItemComboIssues(link.childId, new Set())) push(issue);
      }

      const hasRecipe =
        mi.ingredients.length > 0 ||
        mi.packagings.length > 0 ||
        mi.components.length > 0 ||
        mi.comboChildren.length > 0;
      const missingIngredients = [...dedup.values()];
      const available = hasRecipe && missingIngredients.length === 0;

      // Prix TTC de l'espace si défini (ligne SpaceMenuItem), sinon prix global.
      const spacePricing = this.pricing.computeSpacePricing(
        { ...mi, spacePrices: linksToSpacePrices((mi as any).spaceLinks) },
        tenantVatRate,
        null,
      );
      const pricing =
        spacePricing?.[spaceId] || this.pricing.computePricing(mi, tenantVatRate, null);

      return {
        id: mi.id,
        name: mi.name,
        picture: mi.picture,
        type: mi.productType?.name ?? null,
        category: mi.productCategory?.name ?? null,
        price: pricing.gross.ttc,
        vatRate: pricing.vatRate,
        available,
        hasRecipe,
        missingIngredients,
      };
    });
  }

  private availabilityCounts(items: Array<{ available: boolean }>) {
    return {
      total: items.length,
      available: items.filter((i) => i.available).length,
      notAvailable: items.filter((i) => !i.available).length,
    };
  }

  /**
   * Drawer « By Shop » : items associés à l'espace du shop (condition 0) + disponibilité
   * serveur + état `enabled`/`assigned` sur CE shop. Remplace les 2 appels lourds du
   * front (catalogue tenant paginé + recettes complètes du shop).
   */
  async getShopAvailableMenuItems(
    shopId: string,
    tenantId: string,
    configId?: string,
    enabledOnly = false,
    user?: SpaceScopedUser,
  ) {
    this.logger.debug(
      `Getting available menu items for shopId=${shopId} tenantId=${tenantId} configId=${configId ?? '(auto)'} enabledOnly=${enabledOnly}`,
    );

    const shop = await this.prisma.spaceElement.findFirst({
      where: {
        id: shopId,
        ...this.tenantShopOwnershipWhere(tenantId),
      },
      select: {
        id: true,
        name: true,
        floor: { select: { config: { select: { id: true, spaceId: true } } } },
        forecourt: { select: { config: { select: { id: true, spaceId: true } } } },
        externalMerch: { select: { config: { select: { id: true, spaceId: true } } } },
        // Builder v2 : l'espace vient de la Zone, la config du configId reçu (repli : 1re adhésion)
        zone: { select: { spaceId: true } },
        configurationElements: { select: { configId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        menuAssignments: { select: { menuItemId: true, enabled: true, configId: true } },
      },
    } as any);

    if (!shop) {
      throw new NotFoundException(`Shop with ID ${shopId} not found`);
    }

    const shopAny = shop as any;
    const spaceId = this.resolveShopSpaceId(shopAny);
    await this.assertSpaceAccess(spaceId, user);

    // Scoping par configuration : ne considérer que les assignations de la config effective
    // (élément v2 partagé = une ligne par config ; sans filtre, l'état coché de la config A
    // fuirait vers la config B dans le drawer).
    const effectiveConfigId = this.resolveShopConfigId(shopAny, configId);
    const enabledByMenuItemId = new Map<string, boolean>(
      (shopAny.menuAssignments ?? [])
        .filter((a: any) => (a.configId ?? null) === effectiveConfigId)
        .map((a: any) => [a.menuItemId, !!a.enabled]),
    );

    // enabledOnly : ne calculer/renvoyer que le menu du shop (items activés sur cette config),
    // pas le catalogue complet de l'espace — lecteurs non-assignation (inspecteur builder2).
    const onlyIds = enabledOnly
      ? [...enabledByMenuItemId.entries()].filter(([, on]) => on).map(([id]) => id)
      : undefined;

    const items = (await this.getItemsWithAvailabilityForSpace(tenantId, spaceId, onlyIds)).map(
      (item) => ({
        ...item,
        enabled: enabledByMenuItemId.get(item.id) ?? false,
        assigned: enabledByMenuItemId.has(item.id),
      }),
    );

    return {
      shopId: shopAny.id,
      shopName: shopAny.name,
      spaceId,
      configId: effectiveConfigId,
      counts: {
        ...this.availabilityCounts(items),
        enabled: items.filter((i) => i.enabled).length,
      },
      items,
    };
  }

  /**
   * Inventaire dérivé d'un shop : liste À PLAT et DÉDUPLIQUÉE des ingrédients directs,
   * packagings et composants (lignes TERMINALES — les sous-recettes ne sont PAS dépliées
   * en sous-ingrédients, spec utilisateur 2026-07-05) des menu items ACTIVÉS sur ce shop
   * dans la config effective — exactement les items de la section Menu (enabledOnly).
   * Une ligne par référence, avec les menu items qui l'utilisent (« Used in »), jamais
   * répétée quand plusieurs produits partagent le même ingrédient.
   */
  async getShopInventory(shopId: string, tenantId: string, configId?: string, user?: SpaceScopedUser) {
    this.logger.debug(
      `Getting shop inventory for shopId=${shopId} tenantId=${tenantId} configId=${configId ?? '(auto)'}`,
    );

    const shop = await this.prisma.spaceElement.findFirst({
      where: {
        id: shopId,
        ...this.tenantShopOwnershipWhere(tenantId),
      },
      select: {
        id: true,
        name: true,
        floor: { select: { config: { select: { id: true, spaceId: true } } } },
        forecourt: { select: { config: { select: { id: true, spaceId: true } } } },
        externalMerch: { select: { config: { select: { id: true, spaceId: true } } } },
        zone: { select: { spaceId: true } },
        configurationElements: { select: { configId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        menuAssignments: { select: { menuItemId: true, enabled: true, configId: true } },
      },
    } as any);
    if (!shop) {
      throw new NotFoundException(`Shop with ID ${shopId} not found`);
    }

    const shopAny = shop as any;
    const spaceId = this.resolveShopSpaceId(shopAny);
    await this.assertSpaceAccess(spaceId, user);
    const effectiveConfigId = this.resolveShopConfigId(shopAny, configId);
    const enabledIds: string[] = [
      ...new Set<string>(
        ((shopAny.menuAssignments ?? []) as any[])
          .filter((a) => (a.configId ?? null) === effectiveConfigId && a.enabled)
          .map((a) => String(a.menuItemId)),
      ),
    ];

    const base = { shopId: shopAny.id, shopName: shopAny.name, spaceId, configId: effectiveConfigId };
    if (!spaceId || enabledIds.length === 0) {
      return { ...base, counts: { total: 0, menuItems: 0 }, items: [] };
    }

    // Mêmes items que la section Menu : activés sur le shop ET associés à l'espace (condition 0).
    const menuItems = await this.prisma.menuItem.findMany({
      where: { tenantId, deletedAt: null, id: { in: enabledIds }, ...this.spaceAssociationWhere(spaceId) },
      select: {
        id: true,
        name: true,
        picture: true,
        ingredients: { select: { ingredient: { select: { id: true, name: true, recipeUnit: true, deletedAt: true } } } },
        packagings: { select: { packaging: { select: { id: true, name: true, recipeUnit: true, deletedAt: true } } } },
        components: { select: { component: { select: { id: true, name: true, unit: true, deletedAt: true } } } },
      },
      orderBy: { name: 'asc' },
    });

    type InventoryLine = {
      kind: 'ingredient' | 'packaging' | 'component';
      id: string;
      name: string;
      unit: string | null;
      usedIn: Array<{ id: string; name: string; picture: string | null }>;
    };
    const lines = new Map<string, InventoryLine>();
    const push = (kind: InventoryLine['kind'], ref: any, mi: { id: string; name: string; picture: string | null }) => {
      if (!ref || ref.deletedAt) return; // référence soft-deleted = pas une ligne de stock
      const key = `${kind}:${ref.id}`;
      let line = lines.get(key);
      if (!line) {
        line = { kind, id: ref.id, name: ref.name, unit: ref.recipeUnit ?? ref.unit ?? null, usedIn: [] };
        lines.set(key, line);
      }
      if (!line.usedIn.some((u) => u.id === mi.id)) {
        line.usedIn.push({ id: mi.id, name: mi.name, picture: mi.picture ?? null });
      }
    };
    for (const mi of menuItems) {
      for (const l of mi.ingredients) push('ingredient', l.ingredient, mi);
      for (const l of mi.packagings) push('packaging', l.packaging, mi);
      for (const l of mi.components) push('component', l.component, mi);
    }

    const items = [...lines.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { ...base, counts: { total: items.length, menuItems: menuItems.length }, items };
  }

  /**
   * Inventaire agrégé d'un STORAGE (palette builder2) : union des inventaires dérivés
   * des shops SÉLECTIONNÉS sur le storage, dédupliquée ENTRE shops.
   * - Shop F&B/hospitality : mêmes règles que getShopInventory (items ACTIVÉS dans la
   *   config effective + associés à l'espace, lignes TERMINALES non dépliées) — les
   *   RÉFÉRENCES de recette sont les lignes, avec « Used in: shop → menu item ».
   * - Shop MERCH : pas de recette — les menu items activés SONT les lignes
   *   (kind 'article', storageType 'merch'), « Used in » liste juste les shops porteurs.
   * `storageType` (dry|cold|belowzero|merch|null) : fiche de la référence pour les
   * lignes F&B, 'merch' forcé pour les articles — le front filtre selon les sous-types
   * du storage (prototype : non typé = dry ; merch visible si sous-type merch/material).
   */
  async getStorageInventory(shopIds: string[], tenantId: string, configId?: string, user?: SpaceScopedUser) {
    const ids = [...new Set(shopIds.map((s) => s.trim()).filter(Boolean))];
    this.logger.debug(
      `Getting storage inventory for ${ids.length} shops tenantId=${tenantId} configId=${configId ?? '(auto)'}`,
    );
    const empty = {
      configId: configId ?? null,
      shops: [] as Array<{ id: string; name: string }>,
      counts: { shops: 0, menuItems: 0, total: 0 },
      items: [] as any[],
    };
    if (ids.length === 0) return empty;

    const shops = await this.prisma.spaceElement.findMany({
      where: {
        id: { in: ids },
        ...this.tenantShopOwnershipWhere(tenantId),
      },
      select: {
        id: true,
        name: true,
        type: true,
        floor: { select: { config: { select: { id: true, spaceId: true } } } },
        forecourt: { select: { config: { select: { id: true, spaceId: true } } } },
        externalMerch: { select: { config: { select: { id: true, spaceId: true } } } },
        zone: { select: { spaceId: true } },
        configurationElements: { select: { configId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        menuAssignments: { select: { menuItemId: true, enabled: true, configId: true } },
      },
    } as any);
    if (shops.length === 0) return empty;

    // Ids hors tenant silencieusement ignorés (findMany filtré) — pas de 404 : une
    // sélection storage peut référencer un shop supprimé depuis. Même traitement pour un
    // shop d'un espace non accessible à `user` : exclu silencieusement plutôt qu'un 403
    // qui ferait échouer l'agrégat entier pour les autres shops légitimes de la sélection.
    const accessibleSpaces =
      user && !this.spaceAccess.hasFullAccess(user) ? await this.spaceAccess.getAccessibleSpaceIds(user) : 'ALL';
    const authorizedShops = (shops as any[]).filter((shop) => {
      if (accessibleSpaces === 'ALL') return true;
      const spaceId = this.resolveShopSpaceId(shop);
      return !spaceId || accessibleSpaces.includes(spaceId);
    });
    if (authorizedShops.length === 0) return empty;

    const shopInfos = authorizedShops.map((shop) => {
      const spaceId = this.resolveShopSpaceId(shop);
      const effectiveConfigId = this.resolveShopConfigId(shop, configId);
      const enabledIds = [
        ...new Set<string>(
          ((shop.menuAssignments ?? []) as any[])
            .filter((a) => (a.configId ?? null) === effectiveConfigId && a.enabled)
            .map((a) => String(a.menuItemId)),
        ),
      ];
      // La règle est portée par le TYPE du shop (comme le prototype) : un merchshop
      // liste ses articles, un vendeur F&B décompose ses recettes.
      const isMerch = String(shop.type ?? '').toLowerCase().startsWith('merch');
      return { id: shop.id as string, name: shop.name as string, spaceId, enabledIds, isMerch };
    });

    // Une requête catalogue PAR ESPACE distinct (un seul en pratique) : la condition 0
    // (association espace) s'évalue avec le spaceId du shop, comme getShopInventory.
    const idsBySpace = new Map<string, Set<string>>();
    for (const s of shopInfos) {
      if (!s.spaceId || s.enabledIds.length === 0) continue;
      let set = idsBySpace.get(s.spaceId);
      if (!set) idsBySpace.set(s.spaceId, (set = new Set()));
      for (const id of s.enabledIds) set.add(id);
    }

    const refWithStorage = { id: true, name: true, recipeUnit: true, storageType: true, deletedAt: true };
    const menuItemsBySpace = new Map<string, Map<string, any>>();
    await Promise.all(
      [...idsBySpace].map(async ([spaceId, idSet]) => {
        const rows = await this.prisma.menuItem.findMany({
          where: { tenantId, deletedAt: null, id: { in: [...idSet] }, ...this.spaceAssociationWhere(spaceId) },
          select: {
            id: true,
            name: true,
            picture: true,
            ingredients: { select: { ingredient: { select: refWithStorage } } },
            packagings: { select: { packaging: { select: refWithStorage } } },
            components: { select: { component: { select: { id: true, name: true, unit: true, storageType: true, deletedAt: true } } } },
          },
        });
        menuItemsBySpace.set(spaceId, new Map(rows.map((r) => [r.id, r])));
      }),
    );

    // StorageType est un référentiel CRUD-éditable (Configurations) depuis CFG-2 — la valeur
    // stockée sur Ingredient/Packaging/MenuComponent est le `name` (texte libre, renommable),
    // le code stable 'dry'/'cold'/'belowzero' attendu par SpaceElement.subtypes[] du Builder vit
    // sur `StorageType.code`, seulement pour les 3 lignes historiques. Compat legacy 'Freezer'
    // conservée (BUG-005 : anciennes valeurs jamais migrées côté données historiques).
    const storageTypeRows = await this.prisma.storageType.findMany({ where: { tenantId } });
    const storageTypeByNameLower = new Map(storageTypeRows.map((r) => [r.name.toLowerCase(), r.code ?? r.id]));
    const mapStorageType = (st?: string | null): string | null => {
      if (!st) return null;
      if (st === 'Freezer') return 'belowzero'; // legacy pré-BUG-005
      return storageTypeByNameLower.get(st.toLowerCase()) ?? null;
    };

    type StorageLine = {
      kind: 'ingredient' | 'packaging' | 'component' | 'article';
      id: string;
      name: string;
      unit: string | null;
      picture: string | null; // articles merch uniquement (les références n'ont pas d'image)
      storageType: string | null; // code stable ('dry'|'cold'|'belowzero'), id StorageType custom, ou 'merch'
      usedIn: Array<{
        shopId: string;
        shopName: string;
        menuItems: Array<{ id: string; name: string; picture: string | null }>;
      }>;
    };
    const lines = new Map<string, StorageLine>();
    const seenMenuItemIds = new Set<string>();
    const usageOf = (line: StorageLine, shop: { id: string; name: string }) => {
      let usage = line.usedIn.find((u) => u.shopId === shop.id);
      if (!usage) {
        usage = { shopId: shop.id, shopName: shop.name, menuItems: [] };
        line.usedIn.push(usage);
      }
      return usage;
    };
    const push = (
      kind: 'ingredient' | 'packaging' | 'component',
      ref: any,
      shop: { id: string; name: string },
      mi: { id: string; name: string; picture: string | null },
    ) => {
      if (!ref || ref.deletedAt) return; // référence soft-deleted = pas une ligne de stock
      const key = `${kind}:${ref.id}`;
      let line = lines.get(key);
      if (!line) {
        line = {
          kind,
          id: ref.id,
          name: ref.name,
          unit: ref.recipeUnit ?? ref.unit ?? null,
          picture: null,
          storageType: mapStorageType(ref.storageType),
          usedIn: [],
        };
        lines.set(key, line);
      }
      const usage = usageOf(line, shop);
      if (!usage.menuItems.some((m) => m.id === mi.id)) {
        usage.menuItems.push({ id: mi.id, name: mi.name, picture: mi.picture ?? null });
      }
    };
    // Article merch : le menu item EST la ligne — « Used in » ne liste que les shops
    // porteurs (menuItems vide, l'item ne s'utilise pas lui-même).
    const pushArticle = (
      mi: { id: string; name: string; picture: string | null },
      shop: { id: string; name: string },
    ) => {
      const key = `article:${mi.id}`;
      let line = lines.get(key);
      if (!line) {
        line = {
          kind: 'article',
          id: mi.id,
          name: mi.name,
          unit: null,
          picture: mi.picture ?? null,
          storageType: 'merch',
          usedIn: [],
        };
        lines.set(key, line);
      }
      usageOf(line, shop);
    };

    for (const shop of shopInfos) {
      const catalog = shop.spaceId ? menuItemsBySpace.get(shop.spaceId) : undefined;
      if (!catalog) continue;
      for (const menuItemId of shop.enabledIds) {
        const mi = catalog.get(menuItemId);
        if (!mi) continue; // non associé à l'espace (condition 0) ou soft-deleted
        seenMenuItemIds.add(mi.id);
        if (shop.isMerch) {
          pushArticle(mi, shop);
          continue;
        }
        for (const l of mi.ingredients) push('ingredient', l.ingredient, shop, mi);
        for (const l of mi.packagings) push('packaging', l.packaging, shop, mi);
        for (const l of mi.components) push('component', l.component, shop, mi);
      }
    }

    const items = [...lines.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return {
      configId: configId ?? null,
      shops: shopInfos.map((s) => ({ id: s.id, name: s.name })),
      counts: { shops: shopInfos.length, menuItems: seenMenuItemIds.size, total: items.length },
      items,
    };
  }

  /**
   * Vue « By Menu Item » : mêmes items/disponibilité que le drawer (condition 0 +
   * règles fournisseur×espace), sans état par shop — la matrice d'assignation
   * shop×item est déjà servie séparément par getMenuConfiguration.
   */
  async getSpaceMenuItems(spaceId: string, tenantId: string) {
    this.logger.debug(`Getting space menu items for spaceId=${spaceId} tenantId=${tenantId}`);

    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
      select: { id: true },
    });
    if (!space) {
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    }

    const items = await this.getItemsWithAvailabilityForSpace(tenantId, spaceId);
    return { spaceId, counts: this.availabilityCounts(items), items };
  }

  /**
   * Get menu assignments for all elements in a config
   * Returns { [elementId]: { [menuItemId]: boolean } }
   */
  async getMenuConfiguration(spaceId: string, configId: string, tenantId: string) {
    this.logger.debug(`Getting menu config for space=${spaceId} config=${configId} tenant=${tenantId}`);

    // Vérifie que la config appartient bien à CET espace ET à CE tenant — sans ce check,
    // n'importe quel utilisateur authentifié pouvait passer le configId d'un autre tenant et
    // récupérer sa matrice d'assignation menu (fuite cross-tenant, aucune vérification avant).
    const config = await this.prisma.config.findFirst({
      where: { id: configId, spaceId, space: { tenantId } },
      select: { id: true },
    });
    if (!config) {
      return { spaceId, configId, menuItems: {} };
    }

    // Get all elements belonging to floors/forecourt/externalMerch de cette config.
    // Assignations filtrées par configId : un élément v2 partagé entre configs ne doit
    // renvoyer QUE les lignes de la config demandée (scoping par configuration).
    const elements = await this.prisma.spaceElement.findMany({
      where: {
        OR: [
          { floor: { configId } },
          { forecourt: { configId } },
          { externalMerch: { configId } },
          { configurationElements: { some: { configId } } }, // Builder v2
        ],
      },
      select: {
        id: true,
        // BUG-058 (réplique du fix BUG-051) : un MenuItem soft-deleted ne doit jamais apparaître
        // dans la matrice d'assignation, même s'il a encore une ligne MenuAssignment.
        menuAssignments: {
          where: { configId, menuItem: { deletedAt: null } },
          select: { menuItemId: true, enabled: true },
        },
      },
    } as any);

    // Build the { elementId: { menuItemId: boolean } } map
    const menuItems: Record<string, Record<string, boolean>> = {};
    for (const el of elements) {
      if ((el as any).menuAssignments?.length) {
        menuItems[el.id] = {};
        for (const a of (el as any).menuAssignments) {
          menuItems[el.id][a.menuItemId] = a.enabled;
        }
      }
    }

    return { spaceId, configId, menuItems };
  }

  /**
   * Version LÉGÈRE de "menu items assignés par shop, pour tout un config" — un seul
   * appel/une seule requête au lieu de N appels à getShopMenu (un par shop), chacun
   * remontant la structure imbriquée complète (composants→ingrédients, pricing…).
   * Ne renvoie que ce dont la page Analyse a besoin pour reconstruire l'assignation
   * par shop : id/nom/catégorie/basePrice des articles ENABLED. Pas de pricing/recette
   * ici — si un futur consommateur en a besoin, utiliser getShopMenu (par shop).
   *
   * ⚠️ Règle DURE (BUG-199) : ne JAMAIS ajouter ici un champ volumineux porté par le
   * MenuItem (photo, description longue, blob…). La sélection est par ligne
   * d'assignation : tout champ ajouté est réémis autant de fois que l'article est
   * assigné à un PdV. C'est ce qui a fait passer cette réponse à 5,6 Mo / 53 s.
   */
  async getConfigShopMenuItemsLight(spaceId: string, configId: string, tenantId: string) {
    const config = await this.prisma.config.findFirst({
      where: { id: configId, spaceId, space: { tenantId } },
      select: { id: true },
    });
    if (!config) return {};

    const elements = await this.prisma.spaceElement.findMany({
      where: {
        OR: [
          { floor: { configId } },
          { forecourt: { configId } },
          { externalMerch: { configId } },
          { configurationElements: { some: { configId } } }, // Builder v2
        ],
      },
      select: {
        id: true,
        name: true,
        // BUG-058 (réplique du fix BUG-051) : un MenuItem soft-deleted ne doit jamais apparaître
        // ici (sert la page Analyse) même s'il a encore une ligne MenuAssignment(enabled: true).
        menuAssignments: {
          where: { configId, enabled: true, menuItem: { deletedAt: null } },
          select: {
            menuItem: {
              // basePrice : additif (2026-07-18) — permet à Space Inventory de
              // consommer ce batch au lieu d'un GET shop/:shopId par shop
              // (N+1, cf. fiche BUG-010 backend). Scalaire, coût nul.
              //
              // `picture` est VOLONTAIREMENT absent (BUG-199) : la sélection se fait
              // par ligne d'assignation, donc un article présent dans N PdV voyait sa
              // photo sérialisée N fois. Les photos sont stockées en base64 dans
              // MenuItem.picture — un seul article de 915 ko × 15 assignations = 13 Mo
              // sur une réponse dont tout le reste pèse 38 ko (53 s de chargement).
              // La vignette se résout depuis le catalogue (GET /menu-items, qui porte
              // `picture` UNE fois par article). Même réflexe que
              // `marketPriceSelectNoImage` dans menu-items.service.ts.
              select: {
                id: true,
                name: true,
                basePrice: true,
                productCategory: { select: { name: true } },
              },
            },
          },
        },
      } as any,
    });

    const out: Record<string, { shopName: string; items: { id: string; name: string; category: string; basePrice: number | null }[] }> = {};
    for (const el of elements as any[]) {
      const items = (el.menuAssignments || [])
        .map((a: any) => a.menuItem)
        .filter(Boolean)
        .map((mi: any) => ({
          id: mi.id,
          name: mi.name,
          category: mi.productCategory?.name || '',
          basePrice: mi.basePrice != null ? Number(mi.basePrice) : null,
        }));
      if (items.length) out[el.id] = { shopName: el.name, items };
    }
    return out;
  }

  /**
   * Save menu assignments for elements in a config
   * Input: { [elementId]: { [menuItemId]: boolean } }
   */
  async saveMenuConfiguration(
    spaceId: string,
    configId: string,
    menuItems: Record<string, Record<string, boolean>>,
    tenantId: string,
  ) {
    this.logger.log(`Saving menu config for space=${spaceId} config=${configId} tenant=${tenantId}`);

    // Même vérification que getMenuConfiguration côté écriture : sans elle, un utilisateur
    // authentifié pouvait passer un elementId/menuItemId d'un AUTRE tenant et modifier ses
    // assignations menu (upsert MenuAssignment aveugle, aucune vérification avant). On ne
    // traite que les elementId qui appartiennent réellement à cette config+tenant, et les
    // menuItemId qui appartiennent réellement à ce tenant — le reste est silencieusement ignoré.
    const config = await this.prisma.config.findFirst({
      where: { id: configId, spaceId, space: { tenantId } },
      select: { id: true },
    });
    if (!config) {
      throw new NotFoundException('Configuration not found for this space/tenant');
    }

    const [validElements, validMenuItems] = await Promise.all([
      this.prisma.spaceElement.findMany({
        where: {
          id: { in: Object.keys(menuItems) },
          OR: [
            { floor: { configId } },
            { forecourt: { configId } },
            { externalMerch: { configId } },
            { configurationElements: { some: { configId } } }, // Builder v2
          ],
        },
        select: { id: true },
      }),
      // BUG-058 (réplique du fix BUG-051) : un menuItemId soft-deleted ne doit jamais être accepté
      // comme valide côté écriture, même si l'appelant l'envoie encore (state front périmé).
      this.prisma.menuItem.findMany({
        where: {
          id: { in: [...new Set(Object.values(menuItems).flatMap((items) => Object.keys(items)))] },
          tenantId,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);
    const validElementIds = new Set(validElements.map((e) => e.id));
    const validMenuItemIds = new Set(validMenuItems.map((m) => m.id));

    // Ids réellement activés (calculés une seule fois, réutilisés par la transaction) —
    // BUG-063 : une valeur `enabled` non strictement booléenne (payload malformé) est ignorée
    // ici comme un id invalide, plutôt que de remonter jusqu'à Prisma sous forme d'erreur opaque.
    const enabledMenuItemIds = [
      ...new Set(
        Object.values(menuItems)
          .flatMap((items) => Object.entries(items))
          .filter(([menuItemId, enabled]) => enabled === true && validMenuItemIds.has(menuItemId))
          .map(([menuItemId]) => menuItemId),
      ),
    ];

    await this.prisma.$transaction(async (tx) => {
      // For each element, upsert menu assignments
      for (const [elementId, items] of Object.entries(menuItems)) {
        if (!validElementIds.has(elementId)) continue;
        const scopedItems = Object.entries(items).filter(
          ([menuItemId, enabled]) => validMenuItemIds.has(menuItemId) && typeof enabled === 'boolean',
        );
        // Upsert PARTIEL uniquement : ne touche QUE les menuItemId présents dans le payload.
        // ⚠️ Avant : un `deleteMany({menuItemId: {notIn: activeMenuItemIds}})` supprimait
        // TOUTE assignation de ce shop absente du payload — correct seulement si l'appelant
        // envoie l'état complet désiré. Or 2 des 3 appelants front envoient un DELTA (un seul
        // item togglé depuis SpaceMenuItemView, ou seulement les items modifiés depuis
        // ShopMenuItemsDrawer) : chaque toggle/save partiel effaçait silencieusement tous les
        // autres menu items déjà assignés à ce shop. Le 3e appelant (EventPredictView) envoie
        // déjà l'état complet ("préserve l'existant") donc rien ne change pour lui.
        for (const [menuItemId, enabled] of scopedItems) {
          await (tx as any).menuAssignment.upsert({
            where: { elementId_menuItemId_configId: { elementId, menuItemId, configId } },
            create: { elementId, menuItemId, configId, enabled },
            update: { enabled },
          });
        }
      }

      // Attacher un item à un shop = l'associer à l'espace (condition 0) : lignes SpaceMenuItem
      // pour les items activés qui n'en ont pas encore. Sans ça, la vue « By Menu Item »
      // (GET /menu-items?spaceId= filtre sur l'association) affichait « Aucun menu item »
      // alors que des items venaient d'être attachés.
      // Additif uniquement : détacher d'un shop ne désassocie pas de l'espace.
      // (validMenuItemIds = déjà vérifiés tenant ; spaceId = vérifié via la config plus haut.)
      // BUG-059 : déplacé DANS la même transaction que les upserts menuAssignment ci-dessus —
      // avant, cette écriture tournait sur `this.prisma` après le commit de la transaction,
      // pouvant laisser des MenuAssignment(enabled:true) sans SpaceMenuItem correspondant si
      // cette 2e écriture échouait (l'item devient alors invisible partout malgré `enabled=true`,
      // exactement le bug que ce bloc a pour but de prévenir).
      if (enabledMenuItemIds.length) {
        await (tx as any).spaceMenuItem.createMany({
          data: enabledMenuItemIds.map((menuItemId) => ({ menuItemId, spaceId })),
          skipDuplicates: true,
        });
      }
    });

    // Compteurs shops (Redis 30s) + listes menu-items (Redis 60s) : sans invalidation,
    // même un refetch forceRefresh du front resservait l'état d'avant l'écriture.
    await this.invalidateAfterAssignmentWrite(tenantId, spaceId);

    return this.getMenuConfiguration(spaceId, configId, tenantId);
  }
}
