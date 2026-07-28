# BUG-184 — Nettoyages mineurs stock + analyse (actions Vuex dupliquées, précédence non parenthésée)

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟡 Mineur (code mort / lisibilité fragile — pas d'impact utilisateur)
- **Domaine** : Stock (Inventory) + Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/store/modules/inventory.js` (ex-`:310-324`), `src/composables/useSpaceData.js` (normalisation revenue)

## Symptôme

1. `invalidateMarketPrices` et `invalidatePackagingTypes` définies **deux fois** chacune dans le même objet `actions` — la seconde écrasait silencieusement la première (identiques, donc inoffensif, mais piège au premier divergement).
2. Normalisation revenue : `r.revenue == null || r.revenue === 0 && r.revenueHt != null` reposait sur la précédence `&&` > `||` — comportement correct, lisibilité fragile (recoupé avec front BUG-14 : sujet différent, la triple formule CA moyen reste ouverte).

## Cause racine

Copier-coller (1) ; expression écrite sans parenthèses (2).

## Correction

2026-07-18 : doublons supprimés ; parenthèses explicites `(r.revenue === 0 && r.revenueHt != null)` + commentaire. Aucun changement de comportement dans les deux cas.

## Risque de régression / à surveiller

Néant (sémantique identique).

## Références

- BUG-14 (triple formule CA moyen — toujours 🔴, non traité ici)
