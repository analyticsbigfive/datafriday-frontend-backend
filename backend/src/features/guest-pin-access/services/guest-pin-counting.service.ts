import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { PreEventInventoryFlowService } from '../../inventory/pre-event-inventory-flow.service';
import { MenuComponentsService } from '../../menu-components/menu-components.service';
import { SpaceMenuConfigurationService } from '../../space-menus/services/space-menu-configuration.service';
import { StorageTypesService } from '../../storage-types/storage-types.service';
import { SaveGuestCountDto } from '../dto/save-guest-count.dto';
import { isInventoryPhase } from '../inventory-window-period';
import type { GuestPinUser } from '../../../core/auth/strategies/jwt-guest-pin.strategy';
import { MenuItemRecipeService } from '../../menu-items/services/menu-item-recipe.service';
import { InventoryCountService } from '../../inventory/services/inventory-count.service';
import { MarketPriceQueryService } from '../../market-prices/services/market-price-query.service';

/**
 * Comptage côté invité : catalogue des articles du PDV ou du stockage, feuille d'inventaire, enregistrement et soumission du comptage.
 */
@Injectable()
export class GuestPinCountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryCountService: InventoryCountService,
    private readonly preEventFlow: PreEventInventoryFlowService,
    private readonly menuItemRecipeService: MenuItemRecipeService,
    private readonly marketPriceQueryService: MarketPriceQueryService,
    private readonly menuComponents: MenuComponentsService,
    private readonly spaceMenus: SpaceMenuConfigurationService,
    private readonly storageTypes: StorageTypesService,
  ) {}

  /** Routes de comptage : refusées à un jeton qui n'est pas d'inventaire (ventilation). */
  private assertInventorySession(user: GuestPinUser): void {
    if (!isInventoryPhase(user.phase)) {
      throw new ForbiddenException("Cet accès ne permet pas de compter l'inventaire");
    }
  }

  /** Comptages déjà sauvegardés pour le PDV de l'invité, keyés par itemId — le
   *  catalogue (quels items existent) vient désormais de `getCatalog` (même
   *  algorithme que le staff), plus de ce endpoint. */
  async getInventory(user: GuestPinUser) {
    this.assertInventorySession(user);
    const merged = await this.inventoryCountService.getBySpaceAndEvent(
      user.spaceId,
      user.eventId,
      user.tenantId,
      user.phase as 'pre-event' | 'post-event',
    );
    const blob = (merged?.inventoryCounts ?? {}) as Record<string, Record<string, any>>;
    return { elementId: user.elementId, savedCounts: blob[user.elementId] ?? {} };
  }

  /**
   * Config effective d'un PDV — copie volontaire de
   * SpaceMenuScopeService.resolveShopConfigId : configId
   * explicite (l'événement de l'invité) > config du parent v1 > première
   * adhésion v2. Dupliquer ces ~5 lignes plutôt que toucher space-menus.service.ts
   * (fichier dense, chargé d'historique de bugs staff) pour un besoin invité.
   */
  private resolveShopConfigId(
    shop: { floor?: any; forecourt?: any; externalMerch?: any; configurationElements?: any[] },
    explicitConfigId?: string | null,
  ): string | null {
    if (explicitConfigId) return explicitConfigId;
    const v1Config = shop.floor?.config ?? shop.forecourt?.config ?? shop.externalMerch?.config;
    return v1Config?.id ?? shop.configurationElements?.[0]?.configId ?? null;
  }

  /** Items menu ACTIVÉS pour ce PDV. BUG-383-02 (règle Bertrand 2026-09-15) : même
   *  règle que l'écran staff (`getConfigShopMenuItemsLight` itemsScope 'space') : le PDV
   *  est ouvert pour l'event (sa configuration), mais les articles à compter sont
   *  l'union de toutes les configurations de l'ESPACE, le stock étant physique. Ne
   *  renvoie que les ids (le catalogue complet vient de getRecipes ensuite). */
  private async getEnabledMenuItemIds(elementId: string, explicitConfigId?: string | null) {
    const shop = await this.prisma.spaceElement.findFirst({
      where: { id: elementId },
      select: {
        name: true,
        floor: { select: { config: { select: { id: true, spaceId: true } } } },
        forecourt: { select: { config: { select: { id: true, spaceId: true } } } },
        externalMerch: { select: { config: { select: { id: true, spaceId: true } } } },
        configurationElements: { select: { configId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
        menuAssignments: {
          where: { enabled: true, menuItem: { deletedAt: null } },
          select: { menuItemId: true, configId: true, config: { select: { spaceId: true } } },
        },
      },
    });
    if (!shop) return { elementName: null, enabledIds: [] as string[] };
    const effectiveConfigId = this.resolveShopConfigId(shop as any, explicitConfigId);
    const spaceId = await this.resolveConfigSpaceId(shop as any, effectiveConfigId);
    const enabledIds = [
      ...new Set<string>(
        ((shop as any).menuAssignments ?? [])
          .filter((a: any) =>
            spaceId ? a.config?.spaceId === spaceId : (a.configId ?? null) === effectiveConfigId,
          )
          .map((a: any) => String(a.menuItemId)),
      ),
    ];
    return { elementName: shop.name, enabledIds };
  }

  /** Espace de la configuration effective (parent v1 déjà chargé, sinon lecture de la config v2). */
  private async resolveConfigSpaceId(
    shop: { floor?: any; forecourt?: any; externalMerch?: any },
    effectiveConfigId: string | null,
  ): Promise<string | null> {
    const v1Config = shop.floor?.config ?? shop.forecourt?.config ?? shop.externalMerch?.config;
    if (v1Config?.id && v1Config.id === effectiveConfigId && v1Config.spaceId) return v1Config.spaceId;
    if (!effectiveConfigId) return null;
    const config = await this.prisma.config.findUnique({ where: { id: effectiveConfigId }, select: { spaceId: true } });
    return config?.spaceId ?? null;
  }

  /**
   * Catalogue du PDV de l'invité — MÊMES données brutes que le staff, pour que
   * le front appelle la MÊME fonction `buildConsolidatedInventory` (pas de
   * resucée de l'explosion combo/BOM côté backend) :
   *  - `availableMenuItems` : items activés sur ce PDV dans la config de
   *    l'événement ouvert (mêmes champs que /menu-items/recipes = `menuItem.components`
   *    fusionné ingrédients+composants+packaging, format identique à ce que le
   *    staff obtient de /menu-items + normalizeMenuItem, cf. buildRecipeComponents).
   *  - `allMenuItemsData` : catalogue COMPLET du tenant (mêmes champs), nécessaire
   *    à la récursion combo (un constituant peut ne pas être lui-même assigné à ce PDV).
   *  - `marketPrices` / `components` : catalogues tenant bruts, mêmes endpoints que
   *    ceux que le staff charge (aucune transformation supplémentaire).
   */
  async getCatalog(user: GuestPinUser) {
    this.assertInventorySession(user);
    const event = await this.prisma.event.findUnique({
      where: { id: user.eventId },
      select: { configurationId: true },
    });
    const element = await this.prisma.spaceElement.findUnique({
      where: { id: user.elementId },
      select: { name: true, type: true, storageTypes: true, attributes: true },
    });
    if (element?.type === 'storage') return this.getStorageCatalog(user, element, event?.configurationId ?? null);
    const { elementName, enabledIds } = await this.getEnabledMenuItemIds(
      user.elementId,
      event?.configurationId,
    );

    // getRecipes([]) = catalogue ENTIER du tenant (pas de filtre `id`, cf.
    // menu-items.service.ts::getRecipes) — jamais l'appeler avec `enabledIds` vide
    // en pensant obtenir "aucun item", ça renverrait l'inverse.
    const [availableRecipes, allRecipes, marketPricesPage, componentsPage] = await Promise.all([
      enabledIds.length
        ? this.menuItemRecipeService.getRecipes(enabledIds, user.tenantId)
        : Promise.resolve({ items: [], suppliers: [] }),
      this.menuItemRecipeService.getRecipes([], user.tenantId),
      this.marketPriceQueryService.findAll(user.tenantId, 1, 5000),
      this.menuComponents.findAll(user.tenantId, 1, 5000),
    ]);

    return {
      elementName,
      availableMenuItems: availableRecipes.items,
      allMenuItemsData: allRecipes.items,
      marketPrices: marketPricesPage.data,
      components: componentsPage.data,
    };
  }

  /**
   * Catalogue d'un STOCKAGE (QR code des espaces de stockage, demande Bertrand
   * 2026-10-08). Un stockage n'a pas de menu : ses articles sont ceux des PdV qu'il
   * sert, filtrés par type de stockage. Comme pour un PdV, le serveur ne renvoie
   * que les données brutes et le front appelle la MÊME fonction que l'onglet
   * Stockages du staff (`buildStorageInventory`) :
   *  - `fbElements` : PdV de la configuration de l'event et leurs articles activés
   *    (union des configurations de l'espace, même batch que le staff) ;
   *  - `storage` : types du stockage et PdV qu'il sert (vide = tous) ;
   *  - `storageTypes` : référentiel tenant (nom → code), comme le store staff.
   */
  private async getStorageCatalog(
    user: GuestPinUser,
    element: { name: string; storageTypes: string[]; attributes: unknown },
    configId: string | null,
  ) {
    const byShop = configId
      ? await this.spaceMenus.getConfigShopMenuItemsLight(user.spaceId, configId, user.tenantId, { itemsScope: 'space' })
      : {};
    // Mêmes éléments que la liste des PdV du staff : ni stockage ni boutique merch.
    const candidates = Object.keys(byShop).filter((id) => id !== user.elementId);
    const kept = candidates.length
      ? await this.prisma.spaceElement.findMany({
          where: { id: { in: candidates }, type: { notIn: ['storage', 'merchshop'] } },
          select: { id: true },
        })
      : [];
    const fbElements = kept.map(({ id }) => ({
      id,
      name: byShop[id].shopName,
      menuItemIds: byShop[id].items.map((it) => it.id),
    }));

    // storageShopIds (builder v2) prime sur selectedShops (v1), même lecture que le staff.
    const attrs = (element.attributes ?? {}) as any;
    const selectedShopIds: string[] = (
      Array.isArray(attrs.storageShopIds) ? attrs.storageShopIds : Array.isArray(attrs.selectedShops) ? attrs.selectedShops : []
    ).map(String);

    const [allRecipes, marketPricesPage, componentsPage, storageTypesPage] = await Promise.all([
      this.menuItemRecipeService.getRecipes([], user.tenantId),
      this.marketPriceQueryService.findAll(user.tenantId, 1, 5000),
      this.menuComponents.findAll(user.tenantId, 1, 5000),
      this.storageTypes.findAll(user.tenantId, 1, 500),
    ]);

    return {
      elementName: element.name,
      elementType: 'storage' as const,
      storage: { storageTypes: element.storageTypes ?? [], selectedShopIds },
      fbElements,
      availableMenuItems: [],
      allMenuItemsData: allRecipes.items,
      marketPrices: marketPricesPage.data,
      components: componentsPage.data,
      storageTypes: storageTypesPage.data,
    };
  }

  // Pas d'attendu côté invité : critère d'acceptation 2026-09-14 ("Tous les
  // éléments affichent 0 et aucune indication n'est donnée pour la valeur
  // attendue"), qui revient sur la décision du 2026-09-08 (toujours montré).
  // Aucun endpoint n'expose donc la baseline à un JWT invité.

  async saveCount(user: GuestPinUser, dto: SaveGuestCountDto) {
    this.assertInventorySession(user);
    // Seul le DIRECTEUR verrouille (validateAccess) — `submittedAt` n'est qu'un
    // signal ("prêt à vérifier"), pas un verrou (décision produit 2026-09-08,
    // revenue sur le gel immédiat initial).
    if (user.validatedAt) {
      throw new ForbiddenException(
        'Comptage validé par le directeur de site — lecture seule. Contacte-le pour une correction.',
      );
    }
    // Même point d'entrée que le staff (verrou 30 min + marquage "à régénérer"
    // en phase pre-event, cf. PreEventInventoryFlowService.saveCount).
    const result = await this.preEventFlow.saveCount(
      {
        spaceId: user.spaceId,
        eventId: user.eventId,
        shopId: user.elementId,
        itemId: dto.itemId,
        packedUnits: dto.packedUnits,
        looseUnits: dto.looseUnits,
        isCounted: dto.isCounted,
        storageLocation: dto.storageLocation,
        countingStatus: dto.countingStatus,
        phase: user.phase as 'pre-event' | 'post-event',
      },
      user.tenantId,
      undefined,
    );
    // Modifier après avoir dit "J'ai terminé" mais AVANT validation directeur =
    // ce n'était pas fini : on réarme le signal pour ne pas laisser le directeur
    // valider des chiffres que le manager est justement en train de changer.
    if (user.submittedAt) {
      await this.prisma.guestPinAccess.update({
        where: { id: user.id },
        data: { submittedAt: null },
      });
    }
    return result;
  }

  /**
   * Tous les articles du PDV sont marqués comptés (détecté par le front, seul à
   * connaître la liste explosée) : la feuille pre-event du match est régénérée et
   * la Logistique recalée avec tout ce qui a été saisi, PDV en cours compris
   * (critère d'acceptation 2026-09-14). Sans effet hors phase pre-event.
   */
  async notifyElementComplete(user: GuestPinUser) {
    this.assertInventorySession(user);
    if (user.phase !== 'pre-event') return { ok: false, reason: 'not-pre-event' };
    return this.preEventFlow.regenerateOnPdvComplete(
      user.spaceId,
      user.eventId,
      user.tenantId,
      `guest-pin:${user.elementId}`,
      user.elementId,
    );
  }

  /**
   * "J'ai terminé" : signale au directeur que ce PDV est prêt à être vérifié —
   * NE verrouille PAS (le manager reste modifiable, cf. saveCount qui réarme ce
   * flag sur toute nouvelle écriture). Le vrai verrou est `validateAccess`
   * (directeur). Idempotent (submittedAt déjà posé → no-op) ; no-op aussi si déjà
   * validé (rien à re-signaler, `saveCount` refuse déjà l'écriture dans ce cas).
   */
  async submitCount(user: GuestPinUser) {
    this.assertInventorySession(user);
    if (user.validatedAt) return { submittedAt: user.submittedAt, validatedAt: user.validatedAt };
    if (user.submittedAt) return { submittedAt: user.submittedAt, validatedAt: null };
    const access = await this.prisma.guestPinAccess.update({
      where: { id: user.id },
      data: { submittedAt: new Date() },
      select: { submittedAt: true, validatedAt: true },
    });
    return access;
  }
}
