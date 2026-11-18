/**
 * Fonctions pures de la vue stock (GET /logistics/:spaceId/stock), extraites de
 * `StockLevelService.getStock` pour que l'orchestration (lectures lancées en parallèle)
 * reste lisible et testable sans base.
 */

/**
 * Configuration affichée par la vue stock.
 *
 * Priorité : configId explicite (deep-link ?configuration=) > config de l'event
 * (deep-link ?event=, comme Space Inventory) > 1re configuration de l'espace.
 * Sentinel 'all' explicite (chantier 341, vue agrégée par défaut) : ne rentre PAS
 * dans cette résolution single-config, court-circuite directement.
 */
export function resolveStockConfigId(
  configurations: ReadonlyArray<{ id: string }>,
  configId: string | undefined,
  eventConfigurationId: string | null | undefined,
): string | null {
  if (configId === 'all') return 'all';
  const inConfigs = (id: string | null | undefined) => !!id && configurations.some((c) => c.id === id);
  return (
    (inConfigs(configId) ? configId! : null) ??
    (inConfigs(eventConfigurationId) ? eventConfigurationId! : null) ??
    configurations[0]?.id ??
    null
  );
}

/** Éléments ayant du stock réel (> 0) : un PDV de cette liste reste affiché même sans menu actif. */
export function stockElementIdsOf(levels: ReadonlyArray<{ elementId: string; packedUnits: number; looseUnits: number }>): Set<string> {
  return new Set(levels.filter((l) => l.packedUnits > 0 || l.looseUnits > 0).map((l) => l.elementId));
}
