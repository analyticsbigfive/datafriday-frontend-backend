# BUG-212 — Un menu item sans prix peut faire passer un nom faiblement similaire au-dessus du seuil d'auto-suggestion

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 3)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/utils/menuItemMatching.js:44-105` (`findBestMatch`),
  `src/components/integration/wizard/StepMapMenuItems.vue:1139` (seuil d'auto-suggestion)

## Symptôme

`findBestMatch` ne filtre par compatibilité de prix (`isPriceCompatible`, ligne 65) que quand les
deux prix sont connus. Un menu item avec `basePrice == null` passe toujours ce filtre. Dans ce cas,
`priceExact` (ligne 92) vaut `false` (puisque `mi.basePrice != null` échoue), donnant `priceScore =
0.85`. Combiné au plancher de score de nom *assoupli* utilisé quand le prix est connu
(`nameScore <= 0.5` → ignoré, contre `0.7` quand le prix est inconnu, ligne 86), un produit dont le
nom n'est similaire qu'à ~51% à un menu item non tarifé donne `combined = 0.51*0.4 + 0.85*0.6 ≈
0.714` → `matchScore = 71`. Cela franchit le seuil d'auto-suggestion `>= 70`
(`StepMapMenuItems.vue:1139`), et l'item apparaît dans la bannière ambrée "auto-map" ; si
l'utilisateur clique "Auto-map all" (`applyAutoSuggestions`), il est appliqué en masse sans
confirmation individuelle.

## Cause racine

Le `priceScore` par défaut de 0.85 pour "menu item sans prix" était vraisemblablement pensé pour
signifier "le prix ne peut pas disqualifier ce candidat", mais il est scoré comme *presque aussi
bon qu'une correspondance de prix exacte* (1.0 vs 0.85) plutôt que comme "prix inconnu, ignorer
cette dimension" (ce qui nécessiterait de redistribuer le poids de `priceScore`, pas juste 0.85 sur
un poids de 0.6). Tout tenant avec plusieurs `MenuItem`s non tarifés/placeholder est exposé.

## Correction

Rien à ce jour. Revoir la pondération pour qu'un prix inconnu n'apporte ni bonus ni malus
significatif au score composite, plutôt que de se comporter comme un quasi-match de prix.

## Risque de régression / à surveiller

Vérifier l'impact sur les seuils existants (`>= 70` auto-suggestion, `> 0.5`/`<= 0.3` ailleurs dans
le domaine) après correction — un changement de pondération peut déplacer beaucoup de suggestions
existantes.

## Références

- `docs/modules/05_INTEGRATIONS_VENTES.md` (étape 3, module partagé `utils/menuItemMatching.js`).
