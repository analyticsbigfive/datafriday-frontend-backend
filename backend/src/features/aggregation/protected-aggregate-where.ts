/**
 * Règle unique de suppression d'agrégats (ADR_MULTI_SOURCE 4.3) : un job ne supprime jamais les
 * lignes dont `integrationId` appartient à une AUTRE source déclarée du même évènement.
 *
 * Sans autre source déclarée, le `where` est rendu tel quel (même objet) : le comportement et le
 * SQL des espaces 100 % Weezevent / Digifood sont identiques à l'existant.
 * Les lignes `integrationId NULL` (antérieures à la colonne) restent supprimables : `notIn` seul
 * les écarterait (sémantique SQL), alors qu'un delete non scopé les supprime aujourd'hui.
 * La contrainte passe par `AND` pour ne jamais écraser un `OR` déjà présent dans le `where`.
 */
export function protectedAggregateWhere<T extends object>(where: T, otherSourceIntegrationIds: ReadonlyArray<string>): T {
  if (!otherSourceIntegrationIds.length) return where;
  const guard = { OR: [{ integrationId: null }, { integrationId: { notIn: [...otherSourceIntegrationIds] } }] };
  const existing = (where as { AND?: unknown }).AND;
  const and = existing === undefined ? [guard] : Array.isArray(existing) ? [...existing, guard] : [existing, guard];
  return { ...where, AND: and };
}
