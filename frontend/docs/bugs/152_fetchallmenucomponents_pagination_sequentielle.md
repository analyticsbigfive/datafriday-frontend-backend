# BUG-152 — `fetchAllMenuComponents` : pagination page-à-page séquentielle

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟡 Mineur/perf (phase 2 du chargement /analyse)
- **Domaine** : Analyse & agrégation / Menu
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/composables/useSpaceData.js` (`fetchAllMenuComponents`, ex-`:30-49`)

## Symptôme

Le chargement de tous les MenuComponents (boucle anti-troncature de BUG-054/105) attendait chaque page avant de demander la suivante : un tenant à 800 composants = 8 allers-retours **en série**.

## Cause racine

Boucle `while` séquentielle ; `meta.total` est pourtant connu dès la page 1.

## Correction

2026-07-18 : page 1 séquentielle (obtenir `total`), pages restantes en parallèle borné (`runWithConcurrency`, concurrence 4, `src/utils/asyncPool.js`). Ordre des rows préservé (concaténation par index de page). Sans `meta.total` exploitable → comportement identique à avant (une page).

## Risque de régression / à surveiller

Un échec de page se propage comme avant (catch par l'appelant de phase 2). Même boucle dans `src/store/modules/menuComponents.js` — NON modifiée cette session (chemin `/components`, hors périmètre) : candidate à la même optimisation.

## Références

- BUG-054 / BUG-105 (la boucle anti-troncature d'origine)
