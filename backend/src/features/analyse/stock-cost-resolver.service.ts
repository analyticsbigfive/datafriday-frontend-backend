import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Résolveur de coût unitaire PARTAGÉ par la valorisation du stock actuel et la valorisation
 * des feuilles post-event. Même logique que frontend/src/utils/reconciliationCosts.js, par kind :
 *   - marketPrice   : MarketPrice.pricePerUnit
 *   - ingredient    : pricePerUnit de la Market Price liée à l'ingrédient
 *   - packaging     : pricePerUnit de la Market Price liée à l'emballage
 *   - menuComponent : MenuComponent.unitCost
 *   - menuItem      : MenuItem.totalCost / numberOfPiecesRecipe (coût par pièce, repli 1)
 * Règle maison : jamais un 0 € fabriqué. Un coût absent ou nul donne `unitCost: null`.
 */

export interface CostRef {
  /** Clé de l'appelant, reprise telle quelle dans la Map de résultat. */
  key: string;
  /** Absent : identité inconnue (ligne de feuille), on teste Market Price, composant, article. */
  itemKind?: string | null;
  itemRefId?: string | null;
  /** Repli : dernier Market Price connu de la ligne. */
  marketPriceId?: string | null;
}

export interface ResolvedMarketPrice {
  id: string;
  supplierId: string | null;
  industrialId: string | null;
}

export interface ResolvedCost {
  unitCost: number | null;
  /** Market Price qui porte le coût (null pour composant / article, ou sans Market Price). */
  marketPrice: ResolvedMarketPrice | null;
}

const positive = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

@Injectable()
export class StockCostResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /** Résout tous les refs en un nombre fixe de requêtes (aucun N+1). */
  async resolve(tenantId: string, refs: CostRef[]): Promise<Map<string, ResolvedCost>> {
    const out = new Map<string, ResolvedCost>();
    if (!refs.length) return out;

    // Ids à charger par table. Une identité inconnue est cherchée dans les trois tables d'ids
    // « compteurs » (Market Price, composant, article), comme le front.
    const ingredientIds = new Set<string>();
    const packagingIds = new Set<string>();
    const componentIds = new Set<string>();
    const menuItemIds = new Set<string>();
    const mpIds = new Set<string>();
    for (const r of refs) {
      if (r.marketPriceId) mpIds.add(r.marketPriceId);
      const id = r.itemRefId;
      if (!id) continue;
      switch (r.itemKind) {
        case 'marketPrice': mpIds.add(id); break;
        case 'ingredient': ingredientIds.add(id); break;
        case 'packaging': packagingIds.add(id); break;
        case 'menuComponent': componentIds.add(id); break;
        case 'menuItem': menuItemIds.add(id); break;
        default:
          mpIds.add(id);
          componentIds.add(id);
          menuItemIds.add(id);
      }
    }

    const [ingredients, packagings, components, menuItems] = await Promise.all([
      ingredientIds.size
        ? this.prisma.ingredient.findMany({ where: { tenantId, id: { in: [...ingredientIds] } }, select: { id: true, marketPriceId: true } })
        : ([] as Array<{ id: string; marketPriceId: string | null }>),
      packagingIds.size
        ? this.prisma.packaging.findMany({ where: { tenantId, id: { in: [...packagingIds] } }, select: { id: true, marketPriceId: true } })
        : ([] as Array<{ id: string; marketPriceId: string | null }>),
      componentIds.size
        ? this.prisma.menuComponent.findMany({ where: { tenantId, id: { in: [...componentIds] } }, select: { id: true, unitCost: true } })
        : ([] as Array<{ id: string; unitCost: unknown }>),
      menuItemIds.size
        ? this.prisma.menuItem.findMany({ where: { tenantId, id: { in: [...menuItemIds] } }, select: { id: true, totalCost: true, numberOfPiecesRecipe: true } })
        : ([] as Array<{ id: string; totalCost: unknown; numberOfPiecesRecipe: number | null }>),
    ]);
    const mpByIngredient = new Map(ingredients.map((i) => [i.id, i.marketPriceId]));
    const mpByPackaging = new Map(packagings.map((p) => [p.id, p.marketPriceId]));
    for (const id of [...mpByIngredient.values(), ...mpByPackaging.values()]) if (id) mpIds.add(id);

    const marketPrices = mpIds.size
      ? await this.prisma.marketPrice.findMany({
          where: { tenantId, id: { in: [...mpIds] } },
          select: { id: true, pricePerUnit: true, supplierId: true, industrialId: true },
        })
      : [];
    const mpById = new Map(marketPrices.map((m) => [m.id, m]));
    const componentCost = new Map<string, number | null>(components.map((c) => [c.id, positive(c.unitCost)] as [string, number | null]));
    const menuItemCost = new Map<string, number | null>(menuItems.map((m) => {
      // totalCost est le coût de la fournée : on le ramène à la pièce (repli 1 si lot inconnu ou nul).
      const total = positive(m.totalCost);
      const pieces = m.numberOfPiecesRecipe && m.numberOfPiecesRecipe > 0 ? m.numberOfPiecesRecipe : 1;
      return [m.id, total != null ? total / pieces : null] as [string, number | null];
    }));

    const fromMp = (mpId: string | null | undefined): ResolvedCost | null => {
      const mp = mpId ? mpById.get(mpId) : undefined;
      if (!mp) return null;
      return {
        unitCost: positive(mp.pricePerUnit),
        marketPrice: { id: mp.id, supplierId: mp.supplierId, industrialId: mp.industrialId },
      };
    };

    for (const r of refs) {
      const id = r.itemRefId ?? null;
      let resolved: ResolvedCost | null = null;
      switch (r.itemKind) {
        case 'marketPrice': resolved = fromMp(id); break;
        case 'ingredient': resolved = fromMp(id ? mpByIngredient.get(id) : null); break;
        case 'packaging': resolved = fromMp(id ? mpByPackaging.get(id) : null); break;
        case 'menuComponent':
          resolved = { unitCost: id ? componentCost.get(id) ?? null : null, marketPrice: null };
          break;
        case 'menuItem':
          resolved = { unitCost: id ? menuItemCost.get(id) ?? null : null, marketPrice: null };
          break;
        default: {
          // Identité inconnue : même précédence que le front (Market Price, composant, article).
          const viaMp = fromMp(id);
          if (viaMp?.unitCost != null) resolved = viaMp;
          else if (id && componentCost.get(id) != null) resolved = { unitCost: componentCost.get(id)!, marketPrice: null };
          else if (id && menuItemCost.get(id) != null) resolved = { unitCost: menuItemCost.get(id)!, marketPrice: null };
          else resolved = viaMp;
        }
      }
      // Repli sur le dernier Market Price de la ligne quand l'identité ne donne pas de coût.
      if (!resolved || resolved.unitCost == null) {
        const fallback = fromMp(r.marketPriceId);
        if (fallback?.unitCost != null || (!resolved?.marketPrice && fallback)) resolved = fallback ?? resolved;
      }
      out.set(r.key, resolved ?? { unitCost: null, marketPrice: null });
    }
    return out;
  }
}
