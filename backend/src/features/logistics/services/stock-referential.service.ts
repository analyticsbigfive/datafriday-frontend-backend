import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { LogisticsElementScopeService } from './logistics-element-scope.service';
import { RecipeExplosionService } from './recipe-explosion.service';
import { SHOP_TYPES, ElementItem } from '../logistics.types';

/**
 * Référentiel d'articles de stock par élément d'un espace.
 */
@Injectable()
export class StockReferentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly logisticsElementScopeService: LogisticsElementScopeService,
    private readonly recipeExplosionService: RecipeExplosionService,
  ) {}

  async getSpaceElementsWithItems(
    spaceId: string,
    tenantId: string,
    configId?: string,
    opts?: { aggregateAllConfigs?: boolean; stockElementIds?: Set<string> },
  ) {
    const aggregateAllConfigs = !!opts?.aggregateAllConfigs;
    const stockElementIds = opts?.stockElementIds;
    const rows = await this.prisma.spaceElement.findMany({
      where: this.logisticsElementScopeService.spaceElementScopeWhere(spaceId, tenantId),
      select: {
        id: true,
        name: true,
        type: true,
        attributes: true,
        floor: { select: { id: true, config: { select: { id: true } } } },
        forecourt: { select: { id: true, config: { select: { id: true } } } },
        externalMerch: { select: { id: true, config: { select: { id: true } } } },
        configurationElements: { select: { configId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        menuAssignments: { select: { menuItemId: true, enabled: true, configId: true } },
      },
    } as any);

    const shops = (rows as any[]).filter((r) => SHOP_TYPES.includes(r.type));
    const storages = (rows as any[]).filter((r) => r.type === 'storage');

    // Enabled menuItemIds par shop, scopés à la config effective de CE shop —
    // sauf en mode agrégé (chantier 341), où on unionne TOUTES les configs actives
    // du shop au lieu d'en résoudre une seule via resolveElementConfigId.
    const enabledByShop = new Map<string, string[]>();
    const configIdsByShop = new Map<string, string[]>();
    const allMenuItemIds = new Set<string>();
    for (const shop of shops) {
      let ids: string[];
      if (aggregateAllConfigs) {
        ids = [
          ...new Set<string>(
            (shop.menuAssignments ?? [])
              .filter((a: any) => a.enabled)
              .map((a: any) => String(a.menuItemId)),
          ),
        ];
        const shopConfigIds = [
          ...new Set<string>(
            (shop.menuAssignments ?? [])
              .filter((a: any) => a.enabled && a.configId)
              .map((a: any) => String(a.configId)),
          ),
        ];
        if (shopConfigIds.length) configIdsByShop.set(shop.id, shopConfigIds);
      } else {
        const effectiveConfigId = this.logisticsElementScopeService.resolveElementConfigId(shop, configId);
        ids = [
          ...new Set<string>(
            (shop.menuAssignments ?? [])
              .filter((a: any) => (a.configId ?? null) === effectiveConfigId && a.enabled)
              .map((a: any) => String(a.menuItemId)),
          ),
        ];
      }
      enabledByShop.set(shop.id, ids);
      for (const id of ids) allMenuItemIds.add(id);
    }

    const byId = new Map<string, any>();
    if (allMenuItemIds.size) {
      const select = this.recipeExplosionService.recipeSelect();
      const items = await this.prisma.menuItem.findMany({
        where: { id: { in: [...allMenuItemIds] }, tenantId, deletedAt: null },
        select,
      });
      for (const it of items) byId.set(it.id, it);
    }
    // Réutilise la requête menu items déjà faite ci-dessus (seedItems) — pas de 2e
    // findMany identique pour résoudre les combos/market-prices.
    const ctx = await this.recipeExplosionService.loadRecipeContext([...byId.values()], tenantId);

    // Un PDV sans aucun menu item activé (config effective) n'est pas « configuré »
    // dans Space Menu — miroir de l'ancien gate front (isOpen || menuItemsCount > 0) :
    // ne pas l'afficher du tout (pas juste à 0 denrée). Exception : un PDV avec du
    // stock réel (StockLevel > 0) reste affiché même sans menu actif dans la config
    // résolue — sinon du stock existant (ex. transfert vers un PDV dont la config
    // effective a basculé sur une config sans menu assigné) devient invisible.
    const configuredShops = shops.filter(
      (shop) => (enabledByShop.get(shop.id) ?? []).length > 0 || stockElementIds?.has(shop.id),
    );

    // Provider (Weezevent/Digifood) par PDV — dérivé de la même jointure que
    // simulateSale (LocationShopMapping → SalesLocation.provider). Purement
    // informatif (ex. badge dans le picker « simuler une vente ») : absent si le
    // PDV n'est pas encore mappé, sans impact sur le reste de la réponse.
    const providerByElementId = await this.logisticsElementScopeService.getProviderByShopElementId(
      configuredShops.map((s) => s.id),
      tenantId,
    );

    const itemMapByShop = new Map<string, Map<string, ElementItem>>();
    const elements: Array<{
      id: string;
      name: string;
      type: string;
      items: ElementItem[];
      provider?: string | null;
      configIds?: string[];
      floorGroupId: string | null;
    }> = [];
    for (const shop of configuredShops) {
      const ids = enabledByShop.get(shop.id) ?? [];
      const menuItems = ids.map((id) => byId.get(id)).filter(Boolean).map((mi: any) => ({ id: mi.id, name: mi.name }));
      const map = this.recipeExplosionService.aggregateItems(menuItems, byId, ctx);
      itemMapByShop.set(shop.id, map);
      elements.push({
        id: shop.id,
        name: shop.name,
        type: shop.type,
        items: [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
        provider: providerByElementId.get(shop.id) ?? null,
        ...(aggregateAllConfigs ? { configIds: configIdsByShop.get(shop.id) ?? [] } : {}),
        floorGroupId: this.logisticsElementScopeService.floorGroupIdOf(shop),
      });
    }

    for (const storage of storages) {
      const attrs = storage.attributes as any;
      const rawSelectedShopIds = Array.isArray(attrs?.storageShopIds)
        ? attrs.storageShopIds
        : Array.isArray(attrs?.selectedShops)
          ? attrs.selectedShops
          : [];
      const selectedShopIds: string[] = rawSelectedShopIds.map(String);
      const merged = new Map<string, ElementItem>();
      const storageConfigIds = new Set<string>();
      for (const shopId of selectedShopIds) {
        const shopMap = itemMapByShop.get(shopId);
        if (!shopMap) continue;
        if (aggregateAllConfigs) {
          for (const c of configIdsByShop.get(shopId) ?? []) storageConfigIds.add(c);
        }
        for (const [key, item] of shopMap) {
          let entry = merged.get(key);
          if (!entry) {
            entry = { ...item, usedIn: [...item.usedIn] };
            merged.set(key, entry);
          } else {
            for (const u of item.usedIn) {
              if (!entry.usedIn.some((x) => x.id === u.id)) entry.usedIn.push(u);
            }
          }
        }
      }
      elements.push({
        id: storage.id,
        name: storage.name,
        type: storage.type,
        items: [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
        ...(aggregateAllConfigs ? { configIds: [...storageConfigIds] } : {}),
        floorGroupId: this.logisticsElementScopeService.floorGroupIdOf(storage),
      });
    }

    return elements;
  }

  /** Articles du référentiel Logistic d'un élément (toutes configs) : nom et taille de pack. */
  async getElementItems(spaceId: string, tenantId: string, elementIds: string[]) {
    const wanted = new Set(elementIds);
    const elements = await this.getSpaceElementsWithItems(spaceId, tenantId, undefined, { aggregateAllConfigs: true });
    return elements
      .filter((e) => wanted.has(e.id))
      .map((e) => ({ elementId: e.id, items: e.items.map((it) => ({ name: it.name, unitsPerPack: it.unitsPerPack ?? null })) }));
  }

  /**
   * PDV simulables (≥1 menu item vendable, à prix réel, ET mappé à une intégration réelle)
   * — miroir server-side de `LiveSaleSimulatorWidget.vue::menuItemsForShop`/`pickRandom`,
   * pour le tick d'auto-simulation (`SimulationRunProcessor`). Filtre par `provider != null`
   * en plus (contrairement au picker manuel front, qui laisse l'utilisateur choisir puis
   * échouer proprement côté `simulateSale`) : un tick automatique ne doit pas accumuler
   * des erreurs évitables sur des PDV jamais mappés.
   *
   * Écarte aussi les menu items dont le `SalesProduct` mappé n'a pas de `basePrice` réel
   * (retour utilisateur 2026-08-03) : sur ce tenant, la majorité des produits synchronisés
   * n'ont jamais eu de prix saisi côté Weezevent — un tirage purement aléatoire produisait
   * presque toujours des ventes à 0€, noyant les rares tirages à prix réel. Uniquement pour
   * l'auto-run ; le picker manuel du widget QA n'est pas concerné (utile pour tester la
   * déduction de stock indépendamment du prix).
   */
  async getSimulableShops(spaceId: string, tenantId: string, configId?: string) {
    const elements = await this.getSpaceElementsWithItems(spaceId, tenantId, configId);
    const shops = elements
      .filter((e) => e.type !== 'storage' && e.provider)
      .map((e) => {
        const ids = new Set<string>();
        for (const item of e.items) for (const u of item.usedIn) ids.add(u.id);
        return { id: e.id, name: e.name, menuItemIds: [...ids] };
      });

    const allMenuItemIds = [...new Set(shops.flatMap((s) => s.menuItemIds))];
    if (!allMenuItemIds.length) return shops;

    // Éligibilité "simulable" alignée sur simulateSale (même raison ci-dessous) : il
    // faut un mapping Weezevent (simulateSale a besoin d'un salesProductId pour la
    // ligne de vente), mais le PRIX qui détermine si l'item est simulable est
    // désormais le prix catalogue DataFriday de l'ESPACE courant (SpaceMenuItem.priceTtc
    // → MenuItem.basePrice), pas SalesProduct.basePrice — un menu item peut être mappé
    // à un produit Weezevent au prix incomplet alors que son prix catalogue est sain.
    const [mappings, menuItems, spaceMenuItems] = await Promise.all([
      this.prisma.productMapping.findMany({
        where: { tenantId, menuItemId: { in: allMenuItemIds } },
        select: { menuItemId: true },
      }),
      this.prisma.menuItem.findMany({
        where: { id: { in: allMenuItemIds }, tenantId, deletedAt: null },
        select: { id: true, basePrice: true },
      }),
      this.prisma.spaceMenuItem.findMany({ where: { spaceId, menuItemId: { in: allMenuItemIds } } }),
    ]);
    const mappedMenuItemIds = new Set(mappings.map((m) => m.menuItemId));
    const spaceOverrideById = new Map(spaceMenuItems.map((s) => [s.menuItemId, s]));
    const pricedMenuItemIds = new Set(
      menuItems
        .filter((mi) => mappedMenuItemIds.has(mi.id) && Number(spaceOverrideById.get(mi.id)?.priceTtc ?? mi.basePrice) > 0)
        .map((mi) => mi.id),
    );

    return shops.map((s) => ({ ...s, menuItemIds: s.menuItemIds.filter((id) => pricedMenuItemIds.has(id)) }));
  }

  /** Market prices candidats pour le dropdown du popup +/− (itemKey donné, sans le catalogue complet). */
  async getMarketPricesForItem(spaceId: string, tenantId: string, itemKey: string, currentMarketPriceId?: string) {
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId);
    const name = String(itemKey ?? '').trim();
    if (!name) return [];
    const select = {
      id: true,
      itemName: true,
      supplier: true,
      supplierItem: true,
      supplierRel: { select: { name: true } },
    };
    const rows = await this.prisma.marketPrice.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ itemName: { equals: name, mode: 'insensitive' } }, { itemName: { contains: name, mode: 'insensitive' } }],
      },
      select,
      take: 20,
    });
    // Le market price déjà lié à cette ligne de stock est toujours renvoyé, même si
    // MarketPrice.itemName a divergé du référentiel (Ingredient.name) depuis — sinon
    // la sélection en cours "disparaît" côté front dès que quelqu'un renomme le
    // market price (id encore valide, mais plus aucun match par nom).
    if (currentMarketPriceId && !rows.some((r) => r.id === currentMarketPriceId)) {
      const current = await this.prisma.marketPrice.findFirst({
        where: { id: currentMarketPriceId, tenantId, deletedAt: null },
        select,
      });
      if (current) rows.push(current);
    }
    // Correspondance exacte d'abord (dropdown pré-trié comme avant, cf. LogisticMovementDialog).
    rows.sort((a, b) => {
      const aExact = a.itemName.trim().toLowerCase() === name.toLowerCase() ? 0 : 1;
      const bExact = b.itemName.trim().toLowerCase() === name.toLowerCase() ? 0 : 1;
      return aExact - bExact;
    });
    // Nom fournisseur : la relation supplierRel prime (source de vérité du module
    // Market Prices — cf. market-prices.service.ts), le champ texte `supplier` en repli.
    return rows.map((r) => ({
      id: r.id,
      itemName: r.itemName,
      supplierItem: r.supplierItem,
      supplier: r.supplierRel?.name ?? r.supplier ?? null,
    }));
  }
}
