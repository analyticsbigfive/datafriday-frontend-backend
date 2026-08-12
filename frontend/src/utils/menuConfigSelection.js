// Fusion sélection menu items par shop (Event Predict) : sélection EXPLICITE
// (eventMenuConfig, pilotée par les cases) vs DÉRIVÉE (Space Menu enabled /
// ventes prédites, cf. derivedMenuConfigFromRecords dans EventPredictView.vue).
//
// Règle : une clé shop PRÉSENTE dans `explicit` gagne TELLE QUELLE, même `[]`
// (tout décoché = intention réelle, pas un défaut manquant). Fallback vers
// `derived` seulement si la clé est ABSENTE de `explicit`. Cf. bug shop 5A :
// docs/PLAN_EVENTPREDICT_SPACE_MENU_SELECTION.md.
export function mergeEffectiveMenuConfig(explicit, derived) {
  const out = {};
  const ex = explicit || {};
  const de = derived || {};
  const shopIds = new Set([...Object.keys(ex), ...Object.keys(de)]);
  shopIds.forEach((sid) => {
    if (Object.prototype.hasOwnProperty.call(ex, sid)) {
      const v = ex[sid];
      out[sid] = Array.isArray(v) ? [...v] : [];
    } else {
      out[sid] = [...(de[sid] || [])];
    }
  });
  return out;
}

// Répercute une assignation Space Menu (ajout/réactivation ou retrait d'un
// article) dans la sélection EXPLICITE. Nécessaire car la règle ci-dessus fait
// gagner la clé explicite : si l'utilisateur a déjà touché les cases d'un PDV,
// la sélection dérivée du refetch Space Menus ne peut plus y réinjecter un
// article réactivé — il resterait décoché (hors CA ajusté, hors stock-up).
// Ne fait RIEN si la clé shop est absente d'`explicit` : le fallback dérivé
// fait alors le travail, on ne fige pas une sélection que l'utilisateur n'a
// jamais exprimée. Retourne un nouvel objet (ou l'entrée inchangée).
export function applyAssignToExplicit(explicit, shopId, menuItemId, enabled) {
  const ex = explicit || {};
  if (!shopId || !menuItemId) return ex;
  if (!Object.prototype.hasOwnProperty.call(ex, shopId)) return ex;
  const arr = Array.isArray(ex[shopId]) ? ex[shopId] : [];
  const has = arr.includes(menuItemId);
  if (enabled === true && !has) {
    return { ...ex, [shopId]: [...arr, menuItemId] };
  }
  if (enabled !== true && has) {
    return { ...ex, [shopId]: arr.filter((id) => id !== menuItemId) };
  }
  return ex;
}
