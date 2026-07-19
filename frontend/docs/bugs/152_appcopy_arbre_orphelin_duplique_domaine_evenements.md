# BUG-152 — `appCopy.vue` : arbre de 8 fichiers (~5000 lignes) orphelin, dupliquant tout le domaine Événements

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (dette, aucun impact utilisateur — code jamais atteignable)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** :
  - `src/components/appCopy.vue` (1267 lignes)
  - `src/components/ConsolidatedEventsView.vue` (323 lignes)
  - `src/components/EventCategoriesPanel.vue` (12 lignes)
  - `src/components/EventsListPanel.vue` (11 lignes)
  - `src/components/EventSubcategoriesPanel.vue` (12 lignes)
  - `src/components/EventCategoriesView.vue` (706 lignes)
  - `src/components/EventsView.vue` (2079 lignes)
  - `src/components/EventSubCategoriesView.vue` (607 lignes)

## Symptôme

Aucun symptôme utilisateur — découvert en auditant `/event-categories` de bout en bout. Un grep sur
`createEventCategory`/`EventCategoryDialog` remonte `EventCategoriesView.vue`, un fichier de 706
lignes hors de `src/components/events/` (le domaine réellement routé), avec sa propre implémentation
indépendante de la création de catégorie.

## Cause racine

`appCopy.vue` (1267 lignes) n'est importé nulle part dans l'application — vérifié par grep global
sur `src/` et `tests/`, aucun résultat. C'est la racine d'un arbre entièrement mort :
`appCopy.vue` → `ConsolidatedEventsView.vue` → `EventCategoriesPanel.vue` / `EventsListPanel.vue` /
`EventSubcategoriesPanel.vue` (wrappers de 11-12 lignes) → `EventCategoriesView.vue` /
`EventsView.vue` / `EventSubCategoriesView.vue`. Ni `router/index.js` ni aucun composant réellement
monté ne référence `appCopy.vue` : c'est une copie/prototype antérieur du domaine Événements
(nom du fichier explicite), jamais nettoyé après le passage sur l'implémentation actuelle
(`src/components/events/views/*`). Même famille que BUG-083 (`MenuItemFormDrawer.vue`, 976 lignes)
et BUG-096 (`SpaceSelectionDrawer.vue`, 361 lignes) déjà supprimés ailleurs dans ce repo : un fichier
remplacé mais jamais retiré après la bascule.

Risque latent au-delà du poids mort : `EventCategoriesView.vue` appelle `eventApi.createEventCategory`/
`updateEventCategory` directement (lignes 488/491/674), sa propre implémentation divergente de la
création de catégorie — exactement la classe de bug que BUG-130/131/145 ont dû corriger sur
l'écran réel. Si ce fichier avait un jour été reconnecté par erreur (import ajouté sans vérifier
l'état du fichier), il aurait réintroduit cette divergence déjà réglée.

## Correction

Suppression des 8 fichiers (`git rm`). Aucun autre fichier ne les référence (vérifié avant
suppression par grep sur `src/` et `tests/`) — pas de refactor de call-sites nécessaire.

## Risque de régression / à surveiller

Aucun : arbre mort, zéro consommateur réel. Si `pnpm build` échoue après coup sur une référence
manquée, c'est le signal qu'un import a été raté par le grep — revérifier plutôt que restaurer les
fichiers.

## Références

- [BUG-083](083_menu_items_formdrawer_orphelin_code_mort.md), [BUG-096](096_menu_items_spaceselectiondrawer_orphelin_code_mort.md) — même motif (fichier orphelin après bascule), autre domaine.
- [BUG-130](130_eventcategorielist_hashometeam_jamais_envoye.md)/[BUG-145](145_eventcategorielist_duplication_creation_categorie.md) — la classe de bug (implémentations divergentes de création de catégorie) que la reconnexion accidentelle de ce fichier aurait réintroduite.
