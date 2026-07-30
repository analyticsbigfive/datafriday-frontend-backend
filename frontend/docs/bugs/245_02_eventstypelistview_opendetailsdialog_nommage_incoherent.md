# BUG-245-02 — `EventsTypeListView.vue` : `openDetailsDialog()` nommé différemment des 2 autres vues taxonomie

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28 (audit ciblé du domaine Événements)
- **Fichiers** : `src/components/events/views/EventsTypeListView.vue:77,279`

## Symptôme

Les 3 vues taxonomie (`EventsCategorieListView.vue`, `EventsSubcategorieListView.vue`,
`EventsTypeListView.vue`) ouvrent toutes les trois le même composant `TaxonomyDetailDrawer.vue`
pour afficher le détail d'un élément. Les deux premières nomment leur méthode déclenchante
`openDetailsDrawer()` ; `EventsTypeListView.vue` la nomme `openDetailsDialog()` — nom trompeur
puisque le composant ouvert est bien un tiroir (`v-navigation-drawer`), pas un dialog.

## Cause racine

Incohérence de nommage locale, sans impact fonctionnel (le composant réellement monté est
identique dans les 3 vues) — probablement un copier-coller d'un nom antérieur au passage des popups
`v-dialog` vers des tiroirs (BUG-155).

## Correction

Renommé `openDetailsDialog()` → `openDetailsDrawer()` dans `EventsTypeListView.vue` (déclaration et
seul point d'appel, `@click.stop`), pour cohérence avec les 2 autres vues.

## Risque de régression / à surveiller

- Renommage local à un seul fichier, aucun autre composant n'appelle cette méthode par son nom (pas
  de prop/emit concernée).
- Non exécuté en navigateur. À tester manuellement : cliquer sur l'icône "détails" d'un type
  d'événement sur `/events/event-types`, vérifier que `TaxonomyDetailDrawer` s'ouvre normalement.

## Références

- [[155_events_domaine_popups_v_dialog_remplaces_par_tiroirs]]
