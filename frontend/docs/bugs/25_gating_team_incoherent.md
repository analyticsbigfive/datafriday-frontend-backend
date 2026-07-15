# BUG-025 — Gating "Team" incohérent, deux écrans, deux comportements différents

- **Statut** : 🔴 Ouvert (documenté, non corrigé par choix — décision du 2026-07-15)
- **Sévérité** : 🟠 Majeur/UX
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `EventFormDrawer.vue:207,237,272`, `EventDetailsEditor.vue:145-190,617`

## Symptôme

`EventFormDrawer.vue` (écran `/events`) affiche la section Home/Visiting Team dès qu'"une
catégorie est choisie" (n'importe laquelle). `EventDetailsEditor.vue` (via Event Predict) n'a
**aucun gate du tout** — `isSportType` est calculé mais jamais utilisé dans le template. Aucun des
deux écrans ne respecte la règle cible `isSportType OU hasHomeTeam`.

## Cause racine

Le code vivant actuel a réintroduit sa propre incohérence, différente de celle du prototype React
et plus permissive que lui — ce n'est pas une incohérence héritée telle quelle, mais recréée.

## Correction

Aucune à ce jour. Décision du 2026-07-15 : documenté, non corrigé dans l'immédiat.

## Risque de régression / à surveiller

Implémenter la règle de gating cible (`isSportType OU hasHomeTeam`) dans les deux écrans en même
temps — corriger un seul des deux réintroduirait une divergence différente.

## Références

- `docs/modules/07_EVENEMENTS.md` §"Tableau récapitulatif — bugs et risques actifs" #1
- `docs/modules/00_INDEX.md`
