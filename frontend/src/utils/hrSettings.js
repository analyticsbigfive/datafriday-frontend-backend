// Résolution « ensemble d'espaces → valeur affichée par carte » pour Settings HR.
//
// Une ligne (Goal ou StaffRatio) rattache une valeur à un ensemble de spaces (ou à tous via
// allSpaces). Une carte affiche UNE valeur par espace — question #41 tranchée (2026-08-01,
// utilisateur : "on a toujours 1 valeur — faire en groupe ou individuellement garde 1 valeur") :
//   - une ligne SPÉCIFIQUE (espace listé) prime sur une ligne « TOUS » (override délibéré) ;
//   - deux lignes ne peuvent normalement JAMAIS se chevaucher sur le même espace — garanti par
//     construction côté backend (HrSettingsService::assertNoGoalOverlap/assertNoRatioOverlap,
//     rejet à la création/modification), pas résolu après coup ici.
// Le tie-break "plus récente gagne" ci-dessous reste en filet de sécurité défensif (ne devrait
// plus jamais s'activer en pratique) plutôt que d'être supprimé — coûte rien, protège contre un
// éventuel état incohérent (import direct en base, etc.).

function latestBy(lines) {
  return lines.reduce((a, b) =>
    new Date(b.createdAt || 0).getTime() >= new Date(a.createdAt || 0).getTime() ? b : a,
  )
}

/** Renvoie la valeur (valueKey) applicable à un espace, ou null si aucune ligne. */
export function resolveValueForSpace(lines, spaceId, valueKey) {
  if (!Array.isArray(lines) || !spaceId) return null
  const specific = lines.filter(
    (l) => !l.allSpaces && Array.isArray(l.spaceIds) && l.spaceIds.includes(spaceId),
  )
  const pool = specific.length ? specific : lines.filter((l) => l.allSpaces)
  if (!pool.length) return null
  const value = latestBy(pool)[valueKey]
  return value === undefined ? null : value
}

export function resolveGoalForSpace(goals, spaceId) {
  return resolveValueForSpace(goals, spaceId, 'goalPerTpe')
}

export function resolveRatioForSpace(ratios, spaceId) {
  return resolveValueForSpace(ratios, spaceId, 'staffPerZoneManager')
}

/**
 * Ligne « mono-espace » dédiée à un espace (celle que crée/édite le bouton Edit
 * d'une carte) : non-TOUS, ciblant exactement cet espace et lui seul.
 */
export function findMonoSpaceLine(lines, spaceId) {
  return (
    (lines || []).find(
      (l) =>
        !l.allSpaces &&
        Array.isArray(l.spaceIds) &&
        l.spaceIds.length === 1 &&
        l.spaceIds[0] === spaceId,
    ) || null
  )
}
