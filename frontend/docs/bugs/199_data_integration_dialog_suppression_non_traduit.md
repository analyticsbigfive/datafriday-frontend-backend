# BUG-199 — Le dialog de confirmation de suppression est 100% en français, ne passe jamais par `t()`

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/views/DataIntegrationView.vue:613-621,630-632,644,652`

## Symptôme

"Supprimer l'intégration", "Vous êtes sur le point de supprimer l'intégration… Cette action est
irréversible.", "Supprimer également toutes les données synchronisées…", "Annuler", "Supprimer" —
aucune de ces chaînes ne passe par `t()`. Tous les autres dialogs de l'écran (import CSV, drawers
de config) sont traduits ; celui-ci est la seule exception totale. En locale anglaise, ce dialog
reste l'unique élément d'UI encore en français.

## Cause racine

Le dialog a apparemment été ajouté/réécrit après coup sans câbler de clés de traduction
(contraste avec le dialog d'import CSV juste en dessous, entièrement piloté par `t()`).

## Correction

Rien à ce jour. Ajouter les clés `di*` correspondantes dans `src/i18n/translations.js` (`en`/`fr`)
et les câbler dans le template.

## Risque de régression / à surveiller

Vérifier la cohérence terminologique avec les clés `di*` existantes (éviter une clé dupliquée sous
un nom légèrement différent).

## Références

- BUG-198 (dates/nombres fr-FR hardcodés — même écran).
