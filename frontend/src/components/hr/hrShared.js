// Constantes et utilitaires partagés du domaine RH.

// CFG-2 Étape 4 (2026-07-31) : HR_SUPPLIER_DEPARTMENTS (liste figée, RH-5 2026-07-30) retiré —
// remplacé par le référentiel global `Department` (store `departments`, filtré
// `allowsSuppliers`), lu directement par HrSupplierFormDrawer.vue. `HrRole.department` (rôles)
// lit le même référentiel filtré `needsRh` — les deux champs RH restent des listes
// INDÉPENDANTES l'une de l'autre (décision RH-5 non révisée : un fournisseur peut couvrir
// plusieurs départements métier sans lien avec les départements RH des rôles), mais partagent
// désormais la même SOURCE de valeurs au lieu de deux listes dupliquées à la main.

/**
 * Génère un id unique. `crypto.randomUUID()` n'existe qu'en contexte SÉCURISÉ
 * (HTTPS ou localhost) ; sur une IP LAN en HTTP (ex. 192.168.x:8080) elle jette
 * « crypto.randomUUID is not a function ». Repli sur `getRandomValues`, puis en
 * tout dernier recours sur un id horodaté aléatoire.
 */
export function newId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch (_) { /* contexte non sécurisé */ }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const b = crypto.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = [...b].map((x) => x.toString(16).padStart(2, '0'))
    return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
