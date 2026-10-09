import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { MenuItemPricingService } from '../../../shared/pricing/menu-item-pricing.service';
import { linksToSpaceIds, linksToSpacePrices, spaceLinksSelect } from '../../../shared/pricing/space-links.util';
import { TenantListCache } from '../../../shared/cache/tenant-list-cache';

/**
 * Socle commun des articles de menu : sélection Prisma, sérialisation, liens d'espaces et cache.
 */
@Injectable()
export class MenuItemSupportService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private pricing: MenuItemPricingService,
  ) {}

  readonly listCache = new TenantListCache(this.redis, 'menu-items');

  // `MarketPrice.image` peut contenir du base64 (cf. DTOs) — jamais lu par
  // serializeItem/buildRecipeComponents, on l'omet des vues liste/recette.
  readonly marketPriceSelectNoImage = {
    id: true, unit: true, price: true, goodType: true, itemName: true, category: true,
    supplierItem: true, recipeUnit: true, supplier: true, supplierId: true, pricePerUnit: true,
    packedUnits: true, numberOfUnits: true, unitsPerPurchase: true, purchasePackaging: true,
    inventoryPackaging: true, marketPriceTypeId: true, marketPriceCategoryId: true,
  };

  readonly includeRelations = {
    // Nom de la cuisine : affiché même si elle est hors des espaces de l'utilisateur.
    kitchen: { select: { id: true, name: true } },
    productType: true,
    productCategory: true,
    brand: true,
    displayName: true,
    season: true,
    components: {
      include: { component: true },
      orderBy: { id: 'asc' as const },
    },
    ingredients: {
      include: { ingredient: { include: { marketPrice: { select: this.marketPriceSelectNoImage } } } },
      orderBy: { id: 'asc' as const },
    },
    packagings: {
      include: { packaging: { include: { marketPrice: { select: this.marketPriceSelectNoImage } } } },
      orderBy: { id: 'asc' as const },
    },
    comboChildren: {
      include: { child: true },
      orderBy: { id: 'asc' as const },
    },
    promotion: {
      include: {
        promotionType: { select: { id: true, name: true } },
        discountedProduct: { select: { id: true, name: true } },
      },
    },
    menuAssignments: {
      include: {
        // select scalaire : serializeItem ne lit que station.config.spaceId — un
        // `include: { config: true }` remontait toute la ligne Config, y compris
        // le JSON complet du builder 3D (`Config.data`), dupliqué par assignation.
        station: {
          select: { config: { select: { spaceId: true } } },
        },
      },
    },
    spaceLinks: spaceLinksSelect,
  };

  serializeItem(item: any, tenantVatRate: number | null = null) {
    // Contrat API inchangé (spaceIds/spacePrices) — sérialisés depuis les lignes SpaceMenuItem.
    // Collect spaceIds from links first, then enrich with menuAssignments-derived ones
    const directSpaceIds: string[] = linksToSpaceIds(item.spaceLinks);
    const assignmentSpaceIds: string[] = [];
    if (item.menuAssignments?.length) {
      for (const assignment of item.menuAssignments) {
        const spaceId = assignment.station?.config?.spaceId;
        if (spaceId && !assignmentSpaceIds.includes(spaceId)) {
          assignmentSpaceIds.push(spaceId);
        }
      }
    }
    // Merge: links are source of truth, assignment-derived ones are added if missing
    const mergedSpaceIds = [...directSpaceIds];
    for (const sid of assignmentSpaceIds) {
      if (!mergedSpaceIds.includes(sid)) mergedSpaceIds.push(sid);
    }
    const { menuAssignments: _menuAssignments, spaceLinks, promotion, ...rest } = item;
    const spacePrices = linksToSpacePrices(spaceLinks);
    // Coût PAR PIÈCE dérivé du coût total recette (colonne `totalCost` = fournée entière) ÷ nombre
    // de pièces. C'est la valeur à afficher/comparer au prix de vente d'une portion (cf. pricing).
    const pieces = Math.max(this.toNumber(rest?.numberOfPiecesRecipe, 1), 1);
    const costPerPiece = rest?.totalCost != null ? this.toNumber(rest.totalCost, 0) / pieces : null;
    return {
      ...rest,
      costPerPiece,
      spaceIds: mergedSpaceIds,
      spacePrices,
      // Promotion « est en promotion » : contrat plat pour le front (le form lit ces champs).
      isOnPromotion: !!promotion,
      discountedProductId: promotion?.discountedProductId ?? null,
      promotionTypeId: promotion?.promotionTypeId ?? null,
      discountedProductName: promotion?.discountedProduct?.name ?? null,
      promotionTypeName: promotion?.promotionType?.name ?? null,
      pricing: this.pricing.computePricing(item, tenantVatRate, null),
      spacePricing: this.pricing.computeSpacePricing({ ...item, spacePrices }, tenantVatRate, null),
    };
  }

  toNumber(value: unknown, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * Message P2002 lisible : `target` liste les colonnes de la contrainte unique violée
   * (ex. ["menuItemId", "ingredientId"] pour un ingrédient sélectionné deux fois dans la recette).
   */
  describeMenuItemUniqueConstraintError(error: any): string {
    const rawTarget = error?.meta?.target;
    const target: string[] = Array.isArray(rawTarget)
      ? rawTarget
      : typeof rawTarget === 'string'
        ? rawTarget.split(/[,_]/).map((s: string) => s.trim())
        : [];

    if (target.includes('ingredientId')) {
      return `Cet ingrédient est déjà présent dans la recette, il ne peut pas être ajouté deux fois.`;
    }
    if (target.includes('componentId')) {
      return `Ce composant est déjà présent dans la recette, il ne peut pas être ajouté deux fois.`;
    }
    if (target.includes('packagingId')) {
      return `Ce packaging est déjà présent dans la recette, il ne peut pas être ajouté deux fois.`;
    }
    if (target.includes('childId')) {
      return `Cet article est déjà présent dans le combo, il ne peut pas être ajouté deux fois.`;
    }
    return `A menu item with this name already exists`;
  }

  /**
   * Synchronise les lignes SpaceMenuItem d'un article depuis le contrat API historique.
   * Sémantique de REMPLACEMENT, comme les anciens champs :
   *  - `spaceIds` fourni → la liste est l'état complet désiré : les associations absentes
   *    sont supprimées (leur prix espace avec — dissocier = perdre le prix, l'historique
   *    MenuItemPriceHistory garde la trace) ;
   *  - `spacePrices` fourni → remplace TOUS les prix : les liens hors map repassent à null.
   *    Une clé de prix ne CRÉE pas d'association (parité legacy : seul spaceIds associe) ;
   *  - ids d'espaces inconnus du tenant ignorés silencieusement — avant, l'array stockait
   *    n'importe quoi sans contrôle (2815 ids morts purgés au backfill), et un id d'un
   *    autre tenant passait.
   */
  async syncSpaceLinks(
    menuItemId: string,
    tenantId: string,
    opts: { spaceIds?: unknown; spacePrices?: unknown },
  ) {
    const hasSpaceIds = opts.spaceIds !== undefined;
    const hasPrices = opts.spacePrices !== undefined;
    if (!hasSpaceIds && !hasPrices) return;

    const wantedIds =
      hasSpaceIds && Array.isArray(opts.spaceIds)
        ? [...new Set((opts.spaceIds as unknown[]).filter((v): v is string => typeof v === 'string'))]
        : [];
    const prices = hasPrices ? this.normalizeSpacePricesMap(opts.spacePrices) : {};
    const candidateIds = [...new Set([...wantedIds, ...Object.keys(prices)])];
    const validIds = new Set(
      candidateIds.length
        ? (
            await this.prisma.space.findMany({
              where: { tenantId, id: { in: candidateIds } },
              select: { id: true },
            })
          ).map((s) => s.id)
        : [],
    );

    const ops: any[] = [];
    if (hasSpaceIds) {
      const keep = wantedIds.filter((id) => validIds.has(id));
      ops.push(this.prisma.spaceMenuItem.deleteMany({ where: { menuItemId, spaceId: { notIn: keep } } }));
      if (keep.length) {
        ops.push(
          this.prisma.spaceMenuItem.createMany({
            data: keep.map((spaceId) => ({ menuItemId, spaceId })),
            skipDuplicates: true,
          }),
        );
      }
    }
    if (hasPrices) {
      const priced = Object.entries(prices).filter(([sid]) => validIds.has(sid));
      // Les liens hors map perdent leur prix (remplacement complet, parité ancien Json).
      ops.push(
        this.prisma.spaceMenuItem.updateMany({
          where: {
            menuItemId,
            ...(priced.length ? { spaceId: { notIn: priced.map(([sid]) => sid) } } : {}),
          },
          data: { priceTtc: null, vatRate: null, discountType: null, discountValue: null },
        }),
      );
      for (const [sid, p] of priced) {
        // updateMany = no-op si l'espace n'est pas associé (une clé de prix seule n'associe pas).
        ops.push(
          this.prisma.spaceMenuItem.updateMany({
            where: { menuItemId, spaceId: sid },
            data: { priceTtc: p.ttc, vatRate: p.vatRate, discountType: p.discountType, discountValue: p.discountValue },
          }),
        );
      }
    }
    await this.prisma.$transaction(ops);
  }

  /**
   * Associe un MenuItem existant à des espaces sans toucher à ses autres associations
   * (contrairement à syncSpaceLinks qui remplace tout l'état). Utilisé quand on RÉUTILISE un
   * item déjà existant (dedupeByName, BUG-052) : on ne veut ajouter que l'espace demandé, pas
   * désassocier les espaces auxquels l'item était déjà rattaché.
   */
  async linkSpacesAdditive(menuItemId: string, tenantId: string, spaceIds?: unknown, spacePrices?: unknown) {
    const ids = Array.isArray(spaceIds) ? [...new Set(spaceIds.filter((v): v is string => typeof v === 'string'))] : [];
    if (!ids.length) return;
    const validIds = new Set(
      (await this.prisma.space.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true } })).map((s) => s.id),
    );
    const prices = spacePrices ? this.normalizeSpacePricesMap(spacePrices) : {};
    const ops = ids
      .filter((id) => validIds.has(id))
      .map((spaceId) => {
        const p = prices[spaceId];
        return this.prisma.spaceMenuItem.upsert({
          where: { menuItemId_spaceId: { menuItemId, spaceId } },
          create: {
            menuItemId,
            spaceId,
            priceTtc: p?.ttc ?? null,
            vatRate: p?.vatRate ?? null,
            discountType: p?.discountType ?? null,
            discountValue: p?.discountValue ?? null,
          },
          // Ne touche pas un lien déjà existant : ne pas écraser un prix espace déjà réglé.
          update: {},
        });
      });
    if (ops.length) await this.prisma.$transaction(ops);
  }

  /** Délègue au service partagé (réutilisé par la Data Integration). */
  getTenantDefaultVatRate(tenantId: string): Promise<number> {
    return this.pricing.getTenantDefaultVatRate(tenantId);
  }

  /**
   * Applique au menu item le prix Weezevent du produit mappé (prix catalogue Weezevent sinon
   * prix modal des ventes, cf. `resolveWeezeventApplyPrice`) et ARCHIVE le prix appliqué dans
   * `MenuItemPriceHistory`. `MenuItem.basePrice` reste le prix COURANT (visible côté menu-items).
   * Idempotent : si le prix courant est déjà celui résolu, ne réécrit ni n'historise rien.
   */
  /** Normalise le JSON `spacePrices` stocké en `{ [spaceId]: { ttc, vatRate } }` (migre le legacy `number`). */
  private normalizeSpacePricesMap(
    raw: any,
  ): Record<string, { ttc: number; vatRate: number | null; discountType: string | null; discountValue: number | null }> {
    const out: Record<
      string,
      { ttc: number; vatRate: number | null; discountType: string | null; discountValue: number | null }
    > = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [spaceId, v] of Object.entries(raw)) {
        const n = this.pricing.normalizeSpacePrice(v);
        if (n) out[spaceId] = n;
      }
    }
    return out;
  }
}
