# BUG-133 — `/events` : bouton "Calculer le revenu" sans aucun handler

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/events/views/EventsListView.vue:25-27` (avant correction)

## Symptôme

Le bouton visible en haut de `/events` ("Calculer le revenu"/`CircleDollarSign`) n'a aucun `@click`
— cliquer dessus ne fait rigoureusement rien, sans erreur ni log. Distinct du code mort déjà
documenté (`event.api.js` section "EVENT REVENUE/SPONSORS", zéro appelant, zéro route backend) :
ici c'est un élément UI vivant et cliquable qui ne fait rien, contrairement à ce code déjà mort des
deux côtés.

## Cause racine

Bouton posé dans le template sans être jamais raccordé à une action — même famille que BUG-068
(bouton "Synchroniser les catégories" factice sur `/menu-items`, déjà corrigé par retrait).

## Correction

Bouton retiré (avec l'import `CircleDollarSign` devenu inutile). Aucune fonctionnalité de calcul de
revenu n'existe réellement à déclencher — les champs `revenue`/`transactionCount` d'`Event` sont de
toute façon jamais écrits côté backend (BUG-33 backend, pipeline mort). Si un vrai besoin de calcul
de revenu apparaît, il faudra d'abord définir la route backend correspondante.

## Risque de régression / à surveiller

Aucun — le bouton ne faisait rien de réel.

## Références

- `docs/bugs/68_menu_items_sync_categories_factice.md` (même pattern, même précédent de correction)
- `../../../api-datafriday-staging/docs/bugs/33_event_kpis_champs_jamais_ecrits.md`
