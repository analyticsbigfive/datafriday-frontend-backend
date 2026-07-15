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
