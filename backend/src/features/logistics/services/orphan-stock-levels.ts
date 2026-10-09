/**
 * Niveaux de stock « orphelins » d'un élément : présents en base mais absents du
 * référentiel (recette dépliée) de cet élément. Un mouvement (ex. transfert) peut
 * viser un élément qui ne vend pas la denrée : sans ce filet, ce stock deviendrait
 * invisible (« le produit a disparu ») alors qu'il est bien là.
 *
 * Un orphelin VIDE n'est pas affiché (retour Bertrand 2026-10-09) : passer un menu
 * item de readyForSale=Yes à No laisse son ancien niveau (au nom du menu item) à
 * côté du nouvel ingrédient ; à 0 il n'y a aucun stock à montrer, seulement un
 * doublon. Un orphelin avec du stock reste visible pour ne rien faire disparaître.
 */
export interface OrphanLevelLike {
  elementId: string;
  itemKey: string;
  packedUnits: number;
  looseUnits: number;
}

export function collectOrphanLevels<E extends { id: string; items: Array<{ name: string }> }, L extends OrphanLevelLike>(
  elements: E[],
  levels: L[],
): Array<{ el: E; level: L }> {
  const out: Array<{ el: E; level: L }> = [];
  for (const el of elements) {
    const known = new Set(el.items.map((it) => it.name));
    for (const level of levels) {
      if (level.elementId !== el.id || known.has(level.itemKey)) continue;
      if (!(level.packedUnits > 0 || level.looseUnits > 0)) continue;
      out.push({ el, level });
      known.add(level.itemKey);
    }
  }
  return out;
}
