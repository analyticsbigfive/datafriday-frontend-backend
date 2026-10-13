import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { StockLevelService } from '../logistics/services/stock-level.service';
import { StockCostResolverService } from './stock-cost-resolver.service';
import { StockValuationQueryDto } from './dto/analyse-rendement.query.dto';
import { resolveShopNames } from './shop-name-scope';

type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

export interface StockValuationByElement {
  elementId: string;
  value: number;
  isStorage: boolean;
  linesWithoutCost: number;
}

export interface StockValuationResult {
  spaceId: string;
  total: number;
  storagesValue: number;
  linesWithoutCost: number;
  /** Vrai quand un filtre PdV / type / zone est actif : les stockages sont alors exclus. */
  storagesExcluded: boolean;
  byElement: StockValuationByElement[];
  /** Noms de PdV demandés (shopNames) sans élément correspondant. Si aucun ne correspond, le total est vide. */
  unresolvedShopNames?: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Valorisation du stock Logistique ACTUEL d'un espace (règle 3) :
 * (packedUnits × unitsPerPack + looseUnits) × coût unitaire résolu par kind.
 * Une ligne sans coût n'est jamais valorisée à 0 : elle est comptée à part.
 */
@Injectable()
export class StockValuationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly costResolver: StockCostResolverService,
    private readonly stockLevelService: StockLevelService,
  ) {}

  async getValuation(tenantId: string, query: StockValuationQueryDto, user?: SpaceScopedUser): Promise<StockValuationResult> {
    const { spaceId } = query;
    await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId, user);

    const shopNames = query.shopNames ?? [];
    let shopIds = query.shopIds ?? [];
    let unresolvedShopNames: string[] | undefined;
    if (shopNames.length) {
      const resolved = await resolveShopNames(this.prisma, spaceId, tenantId, shopNames);
      unresolvedShopNames = resolved.unresolvedShopNames;
      shopIds = [...new Set([...shopIds, ...resolved.ids])];
      // Des noms sont demandés mais rien ne correspond : jamais le stock de tous les PdV.
      if (!shopIds.length) {
        return { spaceId, total: 0, storagesValue: 0, linesWithoutCost: 0, storagesExcluded: true, byElement: [], unresolvedShopNames };
      }
    }
    const shopTypes = query.shopTypes ?? [];
    const shopAreas = query.shopAreas ?? [];
    const industrialIds = query.industrialIds ?? [];
    const supplierIds = query.supplierIds ?? [];
    const pdvFilterActive = shopIds.length > 0 || shopTypes.length > 0 || shopAreas.length > 0;

    // Même chiffre que l'écran Logistique : StockLevel moins la consommation dérivée des ventes
    // depuis l'ancre, casse de pack appliquée (index elementId::itemKey).
    const [{ index: expectedIndex }, identityLevels] = await Promise.all([
      this.stockLevelService.getExpectedStockIndex(spaceId, tenantId),
      this.prisma.stockLevel.findMany({
        where: { tenantId, spaceId, ...(shopIds.length ? { elementId: { in: shopIds } } : {}) },
        select: { elementId: true, itemKey: true, itemKind: true, itemRefId: true, marketPriceId: true },
      }),
    ]);
    // L'identité de coût se récupère en joignant les StockLevel sur elementId::itemKey. Une clé
    // issue seulement de la consommation (jamais approvisionnée) reste à 0 unité, sans identité.
    const identityByKey = new Map(identityLevels.map((l) => [`${l.elementId}::${l.itemKey}`, l]));
    const levels = [...expectedIndex.values()]
      .filter((e) => !shopIds.length || shopIds.includes(e.elementId))
      .map((e) => {
        const identity = identityByKey.get(`${e.elementId}::${e.itemKey}`);
        return {
          elementId: e.elementId,
          packed: e.packed,
          loose: e.loose,
          unitsPerPack: e.unitsPerPack,
          itemKind: identity?.itemKind ?? null,
          itemRefId: identity?.itemRefId ?? null,
          marketPriceId: identity?.marketPriceId ?? null,
        };
      });

    // Éléments concernés : type de PdV, zone (area) et nature stockage se lisent sur SpaceElement.
    const elementIds = [...new Set(levels.map((l) => l.elementId))];
    const elements = elementIds.length
      ? await this.prisma.spaceElement.findMany({
          where: { id: { in: elementIds } },
          select: { id: true, type: true, subtypes: true, shopTypes: true, area: true },
        })
      : [];
    const elementById = new Map(elements.map((e) => [e.id, e]));

    const keptLevels = levels.filter((l) => {
      const el = elementById.get(l.elementId);
      const isStorage = el?.type === 'storage';
      // Les stockages comptent seulement quand aucun filtre PdV / type / zone n'est actif.
      if (isStorage && pdvFilterActive) return false;
      if (shopTypes.length) {
        const tags = [...(el?.subtypes ?? []), ...(el?.shopTypes ?? [])];
        if (!tags.some((t) => shopTypes.includes(t))) return false;
      }
      if (shopAreas.length && !(el?.area && shopAreas.includes(el.area))) return false;
      return true;
    });

    // Quantité en unités, jamais négative ; une ligne vide n'a rien à valoriser.
    const quantityOf = (l: (typeof levels)[number]) => {
      const perPack = l.unitsPerPack && l.unitsPerPack > 0 ? l.unitsPerPack : 1;
      return Math.max(0, l.packed * perPack + l.loose);
    };
    const nonEmpty = keptLevels.filter((l) => quantityOf(l) > 0);

    const costs = await this.costResolver.resolve(
      tenantId,
      nonEmpty.map((l, i) => ({
        key: String(i),
        itemKind: l.itemKind,
        itemRefId: l.itemRefId,
        marketPriceId: l.marketPriceId,
      })),
    );

    const mpFilterActive = industrialIds.length > 0 || supplierIds.length > 0;
    const byElement = new Map<string, StockValuationByElement>();
    let total = 0;
    let storagesValue = 0;
    let linesWithoutCost = 0;

    nonEmpty.forEach((l, i) => {
      const resolved = costs.get(String(i));
      // Industriel / fournisseur se portent par la Market Price : une ligne sans Market Price
      // (composant, article) ne peut pas être rattachée, elle sort du périmètre filtré.
      if (mpFilterActive) {
        const mp = resolved?.marketPrice;
        if (!mp) return;
        if (industrialIds.length && !(mp.industrialId && industrialIds.includes(mp.industrialId))) return;
        if (supplierIds.length && !(mp.supplierId && supplierIds.includes(mp.supplierId))) return;
      }
      const isStorage = elementById.get(l.elementId)?.type === 'storage';
      let entry = byElement.get(l.elementId);
      if (!entry) {
        entry = { elementId: l.elementId, value: 0, isStorage, linesWithoutCost: 0 };
        byElement.set(l.elementId, entry);
      }
      if (resolved?.unitCost == null) {
        entry.linesWithoutCost += 1;
        linesWithoutCost += 1;
        return;
      }
      const value = quantityOf(l) * resolved.unitCost;
      entry.value += value;
      total += value;
      if (isStorage) storagesValue += value;
    });

    return {
      spaceId,
      total: round2(total),
      storagesValue: round2(storagesValue),
      linesWithoutCost,
      storagesExcluded: pdvFilterActive,
      byElement: [...byElement.values()].map((e) => ({ ...e, value: round2(e.value) })),
      ...(unresolvedShopNames?.length ? { unresolvedShopNames } : {}),
    };
  }
}
