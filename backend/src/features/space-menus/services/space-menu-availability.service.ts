import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { MenuItemPricingService } from '../../../shared/pricing/menu-item-pricing.service';
import { linksToSpacePrices, spaceLinksSelect } from '../../../shared/pricing/space-links.util';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { SpaceMenuScopeService } from './space-menu-scope.service';

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

const ASSERT_SPACE_ACCESS_DENIED = "Vous n'avez pas accès à l'espace de ce shop.";

/**
 * Articles disponibles pour un espace ou un shop, avec leurs compteurs de disponibilité.
 */
@Injectable()
export class SpaceMenuAvailabilityService {
  constructor(
    private prisma: PrismaService,
    private pricing: MenuItemPricingService,
    private spaceAccess: SpaceAccessService,
    private readonly spaceMenuScopeService: SpaceMenuScopeService,
  ) {}

  private readonly logger = new Logger(SpaceMenuAvailabilityService.name);

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
            ...this.spaceMenuScopeService.spaceAssociationWhere(spaceId),
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
        ...this.spaceMenuScopeService.tenantShopOwnershipWhere(tenantId),
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
    const spaceId = this.spaceMenuScopeService.resolveShopSpaceId(shopAny);
    await this.spaceAccess.assertCanAccessSpace(user, spaceId, ASSERT_SPACE_ACCESS_DENIED);

    // Scoping par configuration : ne considérer que les assignations de la config effective
    // (élément v2 partagé = une ligne par config ; sans filtre, l'état coché de la config A
    // fuirait vers la config B dans le drawer).
    const effectiveConfigId = this.spaceMenuScopeService.resolveShopConfigId(shopAny, configId);
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
}
