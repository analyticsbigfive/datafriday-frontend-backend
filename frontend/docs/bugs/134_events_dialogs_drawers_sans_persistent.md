# BUG-134 — Dialogs/drawers Événements sans `persistent` : fermables pendant une requête en cours

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `EventDeleteDialog.vue`, `EventCategoryDialog.vue`, `EventSubcategoryDialog.vue`,
  `EventTypeDialog.vue`, `EventFormDrawer.vue` (+ mini-dialog "Créer une équipe" inline),
  `CsvImportDrawer.vue`, `TaxonomyImportDrawer.vue`, et les drawers/dialogs inline de
  `EventsCategorieListView.vue`/`EventsTypeListView.vue`/`EventsSubcategorieListView.vue`

## Symptôme

Aucun `v-dialog`/`v-navigation-drawer` du domaine n'utilisait `persistent` — un clic en dehors (ou
Échap) ferme le composant même pendant une requête en cours. Cas le plus grave :
`CsvImportDrawer.doImport()`/`TaxonomyImportDrawer.doImport()` exécutent une boucle `for` d'`await`
séquentiels. Fermer le drawer visuellement (scrim cliqué) pendant l'import ne l'interrompt pas — la
boucle continue en arrière-plan et continue de créer des lignes ; l'utilisateur croit avoir annulé,
l'import se termine quand même et émet `imported` sur un composant qu'il pense fermé.

## Cause racine

`persistent` jamais posé, alors que le pattern `:persistent="loading"` (bloquer la fermeture
uniquement pendant l'opération asynchrone, pas en permanence) est déjà établi ailleurs dans le repo
(`MenuItemDeleteDialog.vue`, cf. BUG-098).

## Correction

`:persistent="<var-de-chargement>"` ajouté sur chacun des composants listés (dynamique, pas statique
— le composant reste fermable normalement quand aucune requête n'est en cours). Un état
`teamCreateLoading` a été ajouté à `EventFormDrawer.vue` pour le mini-dialog "Créer une équipe" qui
n'en avait aucun.

## Risque de régression / à surveiller

Vérifier que chaque composant reste bien fermable via le bouton "Annuler"/croix ET via clic
extérieur/Échap en dehors d'une requête ; et qu'il redevient fermable normalement après la fin de
la requête (succès ou erreur).

## Références

- `docs/bugs/98_menu_items_deletedialog_non_persistent.md` (pattern de référence)
