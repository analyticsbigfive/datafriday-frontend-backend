/**
 * Détection des catégories FNB (HR_FNB_CATEGORIES) à partir des sous-types Builder v2
 * (SpaceElement.subtypes, vocabulaire minuscule sans underscore, cf. elementTaxonomy.js).
 *
 * Extrait de staffing.service.ts (2026-07-30) pour être partagé avec builder-v2.service.ts
 * (auto-remplissage du Staff par stand, règles Sinking RH) — une seule table de
 * correspondance, jamais deux copies qui pourraient diverger. BUG-122 est précisément né
 * d'une comparaison dupliquée/incohérente (UPPERCASE_SNAKE vs vocabulaire réel) ; ce fichier
 * existe pour ne pas reproduire ce risque.
 */
export const SUBTYPE_TO_FNB_CATEGORY: Record<string, string> = {
  beverages: 'BEVERAGE',
  beer: 'BEVERAGE',
  drinkee: 'BEVERAGE',
  front_food: 'FRONT_FOOD',
  mixology: 'MIXOLOGY',
  kitchen_food: 'KITCHEN_FOOD',
};

/** Sous-types (String[], casse quelconque) → Set des catégories FNB détectées. */
export function detectFnbTags(subtypes: string[] | null | undefined): Set<string> {
  const subs = (subtypes ?? []).map((s) => String(s).toLowerCase());
  return new Set<string>(
    subs.map((s) => SUBTYPE_TO_FNB_CATEGORY[s]).filter((v): v is string => Boolean(v)),
  );
}
