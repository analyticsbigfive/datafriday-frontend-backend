/**
 * Détection des catégories FNB à partir des sous-types Builder v2 (SpaceElement.subtypes,
 * vocabulaire minuscule, cf. elementTaxonomy.js).
 *
 * CFG-2 Étape 4.5 (2026-07-31) : la « catégorie FNB » d'un rôle/règle Sinking RH (HrRole.
 * fnbCategories, HrSinkingRule.fnbCategory) EST désormais le `Subtype.code` du référentiel
 * global Department/Subtype (département `shop`) — plus de vocabulaire UPPERCASE_SNAKE séparé
 * (HR_FNB_CATEGORIES) ni de table de correspondance à maintenir à la main : un sous-type F&B
 * créé par le super-admin est utilisable immédiatement, sans changement de code. La validation
 * d'existence vit dans HrService (contre Subtype, department.code='shop'), même idiome que
 * Department pour HrRole.department.
 *
 * Extrait de staffing.service.ts (2026-07-30) pour être partagé avec builder-v2.service.ts
 * (auto-remplissage du Staff par stand, règles Sinking RH) — une seule fonction, jamais deux
 * copies qui pourraient diverger (BUG-122 est né d'une comparaison dupliquée/incohérente).
 */
/** Sous-types (String[], casse quelconque) → Set normalisé (minuscules) des catégories FNB. */
export function detectFnbTags(subtypes: string[] | null | undefined): Set<string> {
  return new Set<string>((subtypes ?? []).map((s) => String(s).toLowerCase()));
}
