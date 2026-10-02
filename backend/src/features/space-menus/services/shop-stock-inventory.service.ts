import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { SpaceMenuScopeService } from './space-menu-scope.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

const ASSERT_SPACE_ACCESS_DENIED = "Vous n'avez pas accès à l'espace de ce shop.";

/**
 * Inventaire théorique d'un shop et d'un stockage à partir des menus assignés.
 */
@Injectable()
export class ShopStockInventoryService {
  constructor(
    private prisma: PrismaService,
    private spaceAccess: SpaceAccessService,
    private readonly spaceMenuScopeService: SpaceMenuScopeService,
  ) {}

  private readonly logger = new Logger(ShopStockInventoryService.name);

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
        ...this.spaceMenuScopeService.tenantShopOwnershipWhere(tenantId),
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
    const spaceId = this.spaceMenuScopeService.resolveShopSpaceId(shopAny);
    await this.spaceAccess.assertCanAccessSpace(user, spaceId, ASSERT_SPACE_ACCESS_DENIED);
    const effectiveConfigId = this.spaceMenuScopeService.resolveShopConfigId(shopAny, configId);
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
      where: { tenantId, deletedAt: null, id: { in: enabledIds }, ...this.spaceMenuScopeService.spaceAssociationWhere(spaceId) },
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
        ...this.spaceMenuScopeService.tenantShopOwnershipWhere(tenantId),
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
      const spaceId = this.spaceMenuScopeService.resolveShopSpaceId(shop);
      return !spaceId || accessibleSpaces.includes(spaceId);
    });
    if (authorizedShops.length === 0) return empty;

    const shopInfos = authorizedShops.map((shop) => {
      const spaceId = this.spaceMenuScopeService.resolveShopSpaceId(shop);
      const effectiveConfigId = this.spaceMenuScopeService.resolveShopConfigId(shop, configId);
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

    // marketPriceId/packedUnits/inventoryPackaging sélectionnés ici pour résoudre le
    // conditionnement (BUG packaging "Pack" générique affiché au lieu de la vraie valeur
    // "is stored in") par ID plutôt que par nom sur tout le catalogue tenant — cf. résolution
    // groupée après la boucle shopInfos ci-dessous.
    const refWithStorage = {
      id: true,
      name: true,
      recipeUnit: true,
      storageType: true,
      deletedAt: true,
      marketPriceId: true,
    };
    const menuItemsBySpace = new Map<string, Map<string, any>>();
    await Promise.all(
      [...idsBySpace].map(async ([spaceId, idSet]) => {
        const rows = await this.prisma.menuItem.findMany({
          where: { tenantId, deletedAt: null, id: { in: [...idSet] }, ...this.spaceMenuScopeService.spaceAssociationWhere(spaceId) },
          select: {
            id: true,
            name: true,
            picture: true,
            inventoryPackagingType: true,
            inventoryNumberOfUnits: true,
            ingredients: { select: { ingredient: { select: refWithStorage } } },
            packagings: { select: { packaging: { select: refWithStorage } } },
            components: {
              select: {
                component: {
                  select: {
                    id: true,
                    name: true,
                    unit: true,
                    storageType: true,
                    deletedAt: true,
                    packedUnits: true,
                    inventoryPackaging: true,
                  },
                },
              },
            },
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
      unitsPerPack: number | null; // conditionnement résolu par ID (MarketPrice/MenuComponent/MenuItem)
      packagingType: string | null; // libellé "is stored in" résolu par ID (ex: Carton, Pipette)
      usedIn: Array<{
        shopId: string;
        shopName: string;
        menuItems: Array<{ id: string; name: string; picture: string | null }>;
      }>;
    };
    const lines = new Map<string, StorageLine>();
    // ingredient/packaging résolvent leur conditionnement via MarketPrice (FK marketPriceId,
    // résolue en un seul findMany borné après la boucle) ; component/article le portent déjà
    // directement sur leur propre modèle (pas de hop nécessaire).
    const marketPriceIdByKey = new Map<string, string>();
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
          unitsPerPack: kind === 'component' ? (ref.packedUnits ?? null) : null,
          packagingType: kind === 'component' ? (ref.inventoryPackaging ?? null) : null,
          usedIn: [],
        };
        lines.set(key, line);
        if (kind !== 'component' && ref.marketPriceId) marketPriceIdByKey.set(key, ref.marketPriceId);
      }
      const usage = usageOf(line, shop);
      if (!usage.menuItems.some((m) => m.id === mi.id)) {
        usage.menuItems.push({ id: mi.id, name: mi.name, picture: mi.picture ?? null });
      }
    };
    // Article merch : le menu item EST la ligne — « Used in » ne liste que les shops
    // porteurs (menuItems vide, l'item ne s'utilise pas lui-même).
    const pushArticle = (
      mi: {
        id: string;
        name: string;
        picture: string | null;
        inventoryNumberOfUnits?: number | null;
        inventoryPackagingType?: string | null;
      },
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
          unitsPerPack: mi.inventoryNumberOfUnits ?? null,
          packagingType: mi.inventoryPackagingType ?? null,
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

    // Résolution groupée, bornée aux marketPriceId réellement référencés par CET élément de
    // stockage (dizaines d'ids, jamais le catalogue tenant entier) — corrige le repli sur le
    // libellé générique "Pack" causé par l'ancienne résolution client-side par NOM sur une
    // page 1 tronquée du catalogue (BUG-345-01, StorageInventorySection.vue).
    if (marketPriceIdByKey.size) {
      const marketPriceIds = [...new Set(marketPriceIdByKey.values())];
      const marketPrices = await this.prisma.marketPrice.findMany({
        where: { tenantId, id: { in: marketPriceIds }, deletedAt: null },
        select: { id: true, packedUnits: true, inventoryPackaging: true },
      });
      const marketPriceById = new Map(marketPrices.map((mp) => [mp.id, mp]));
      for (const [key, marketPriceId] of marketPriceIdByKey) {
        const line = lines.get(key);
        const mp = marketPriceById.get(marketPriceId);
        if (line && mp) {
          line.unitsPerPack = mp.packedUnits ?? null;
          line.packagingType = mp.inventoryPackaging ?? null;
        }
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
}
