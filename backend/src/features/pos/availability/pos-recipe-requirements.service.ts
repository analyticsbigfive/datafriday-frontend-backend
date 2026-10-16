import { Injectable } from '@nestjs/common';
import { RecipeExplosionService } from '../../logistics/services/recipe-explosion.service';

/** Lot de ventes fictives par article : la quantité du résultat est arrondie à 0,01, 1000 garde 5 décimales par unité. */
const PROBE_QUANTITY = 1000;

/**
 * Besoin en stock d'UNE unité vendue, par clé de stock. Ne réécrit aucune règle de recette :
 * « vend » PROBE_QUANTITY unités fictives de chaque article à `explodeSalesToConsumption` (readyForSale=Yes :
 * clé = nom de l'article ; sinon ingrédients et composants, combos dépliés) puis divise. Une seule passe
 * pour tous les articles : les recettes, combos et composants sont chargés par lots, pas par article.
 */
@Injectable()
export class PosRecipeRequirementsService {
  constructor(private readonly recipes: RecipeExplosionService) {}

  async perUnitByMenuItem(tenantId: string, menuItemIds: string[]): Promise<Map<string, Map<string, number>>> {
    const ids = [...new Set(menuItemIds)];
    const out = new Map<string, Map<string, number>>();
    if (!ids.length) return out;
    const probe = ids.map((id) => ({ elementId: id, menuItemId: id, eventId: null, eventName: null, qty: PROBE_QUANTITY, lastAt: new Date(0) }));
    const lines = await this.recipes.explodeSalesToConsumption(probe, tenantId);
    for (const line of lines) {
      const need = Number(line.quantity) / PROBE_QUANTITY;
      if (!(need > 0)) continue;
      if (!out.has(line.elementId)) out.set(line.elementId, new Map());
      out.get(line.elementId)!.set(line.itemKey, need);
    }
    return out;
  }
}
