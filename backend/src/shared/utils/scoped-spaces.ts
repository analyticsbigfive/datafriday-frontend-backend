/**
 * Espaces d'une fiche (composant, cuisine) modifiés par un compte à accès restreint.
 * Il ne peut AJOUTER que ses propres espaces, et les espaces qu'il ne voit pas sont
 * conservés d'office : il ne peut ni les retirer ni les ajouter (revue 2026-10-08,
 * un composant partagé A + B restait sinon impossible à enregistrer pour un compte A).
 *
 * @param visible 'ALL' (accès complet) ou ids des espaces accessibles
 * @returns spaces : liste à enregistrer ; foreign : ids ajoutés hors de ses espaces (à refuser)
 */
export function mergeScopedSpaces(
  requested: string[],
  existing: string[],
  visible: 'ALL' | string[],
): { spaces: string[]; foreign: string[] } {
  const req = [...new Set((requested ?? []).map(String))];
  if (visible === 'ALL') return { spaces: req, foreign: [] };
  const had = new Set((existing ?? []).map(String));
  const foreign = req.filter((id) => !visible.includes(id) && !had.has(id));
  const hiddenKept = [...had].filter((id) => !visible.includes(id));
  return { spaces: [...new Set([...req, ...hiddenKept])], foreign };
}
