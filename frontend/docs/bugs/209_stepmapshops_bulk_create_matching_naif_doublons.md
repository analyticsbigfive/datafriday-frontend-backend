# BUG-209 — Le plan de création en masse utilise un matching naïf, risque de créer des shops en doublon

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 2)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepMapShops.vue:1581-1589` (`openBulkConfirm`)

## Symptôme

`openBulkConfirm()` — qui décide quelles locations sont auto-matchées à un shop existant vs.
donnent lieu à la création d'un **nouveau** `SpaceElement` — utilise un matcher complètement
différent et beaucoup plus strict que celui du reste du fichier : `e.name.toLowerCase() ===
location.name.toLowerCase()` (égalité exacte insensible à la casse seulement, aucune normalisation
de ponctuation/espaces/accents, aucun token-overlap, aucun Levenshtein). Une location
`"Bar - Central"` ne matchera pas un shop existant `"Bar Central"`, alors que l'algorithme de
suggestion par ligne (`findBestElementMatch`) le scorerait comme quasi-parfait. Comme
`bulkCreateMissing` vaut `true` par défaut dès qu'un élément non matché existe (ligne 1589), cela
mène directement à la création d'un `SpaceElement` en double pour ce qui est très probablement le
même shop physique déjà mappé/connu.

## Cause racine

`openBulkConfirm` ne réutilise jamais `findBestElementMatch`/`similarity` ; il a été implémenté
indépendamment avec une règle de matching beaucoup plus faible.

## Correction

`openBulkConfirm` appelle désormais `this.findBestElementMatch(location.name)` (token-overlap +
Levenshtein, seuil > 0.5, déjà utilisé ailleurs dans le fichier) au lieu de l'égalité de chaîne
exacte insensible à la casse. Le résultat (`{ ...el, matchScore }`) reste compatible avec
`executeBulk`, qui ne consomme que `element.id`/`element.name`.

## Risque de régression / à surveiller

Vérifier l'impact sur les tenants ayant déjà exécuté un bulk-create avec ce bug — possibles shops
en double déjà créés à nettoyer manuellement.

## Références

- BUG-210, BUG-211 (autres bugs de fiabilité du mapping dans le même fichier).
