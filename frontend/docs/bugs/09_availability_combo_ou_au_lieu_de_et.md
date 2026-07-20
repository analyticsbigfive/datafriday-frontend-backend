# BUG-009 — Availability Combo utilise ∨ (OU) au lieu de ∧ (ET)

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟠 Majeur (visibilité produit incorrecte)
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `EventPredictMenusSection.vue`, `menuItemsPerElement`, branche `Combo` (ligne ~1227)

## Symptôme

Un shop taggé `shopType: ['food']` seul (sans `beverages`) admet déjà les items catégorie Combo.

## Cause racine

La branche `Combo` de `menuItemsPerElement` teste `food ∨ beverages` (OU) au lieu de
`food ∧ beverages` (ET) — divergence vérifiée avec la spec archéologique `EVENT_PREDICT_SECTIONS.md`
§5.3, qui documentait un `∧` d'après le prototype React d'origine.

## Correction

2026-07-18 : branche `Combo` de `menuItemsPerElement` passée de
`fbTypes.includes('food') || fbTypes.includes('beverages')` à `&&` (ET), conformément à la spec
§5.3. Les shops à `shopType` vide / `gppremium` / `temporary` restent non filtrés (acceptent
tout), comme avant.

## Risque de régression / à surveiller

Corriger la condition changera la visibilité de items Combo sur des shops mono-type déjà en
production — vérifier l'impact avant de déployer le fix.

## Références

- `docs/modules/01_EVENT_PREDICT_ALGORITHME.md` §"Bugs actifs confirmés" #3
