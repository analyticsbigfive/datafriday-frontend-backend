# BUG-153 — Taxonomie Événements : popup "view" non conforme à la charte graphique + liste d'événements liés absente (et action absente sur Categories/Subcategories)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (UX/cohérence, aucune perte de données)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** :
  - `src/components/events/views/EventsTypeListView.vue`
  - `src/components/events/views/EventsCategorieListView.vue`
  - `src/components/events/views/EventsSubcategorieListView.vue`
  - `src/components/events/drawers/TaxonomyDetailDrawer.vue` (nouveau)

## Symptôme

Signalé par capture d'écran sur `/event-types` : l'action "œil" (view) ouvre un `v-dialog` centré
(overlay classique) au lieu d'un tiroir latéral cohérent avec le reste de la charte graphique — le
tiroir d'édition juste à côté (même écran) utilise déjà `v-navigation-drawer location="right"`. Le
contenu du popup n'affichait par ailleurs qu'un compteur brut ("4 événements") au lieu de la liste
réelle des événements liés, rendant la page peu intuitive pour explorer l'usage d'un type. `/event-
categories` et `/event-subcategories` n'avaient quant à elles **aucune** action "view" du tout —
seuls edit/delete.

## Cause racine

`EventsTypeListView.vue` implémentait son détail comme un `v-dialog` isolé (composant local, jamais
factorisé), alors que le reste du domaine Événements a déjà établi le pattern "composant partagé +
prop `entity`" pour éviter les divergences (`TaxonomyImportDrawer.vue`, `EventCategoryDialog.vue`)
— pattern qui a justement dû être introduit après coup pour corriger BUG-130/131/145 (deux
implémentations de la création de catégorie ayant divergé). Rien n'avait généralisé l'action "view"
elle-même aux 3 écrans taxonomie.

## Correction

Nouveau composant partagé `TaxonomyDetailDrawer.vue` (prop `entity: 'type' | 'category' |
'subcategory'`), construit sur `EventDrawerShell.vue` (même shell que `TaxonomyImportDrawer.vue` —
gradient header, dark mode, `persistent`) :
- Statut actif/inactif (dérivé du nombre d'événements liés réels, plus du seul comptage côté
  `EventsTypeListView`).
- Section "parent" (type pour une catégorie, catégorie pour une sous-catégorie) résolue via les
  stores taxonomie (même pattern de fallback que les colonnes de tableau existantes).
- Section "enfants" (catégories pour un type, sous-catégories pour une catégorie ; absente pour une
  sous-catégorie, niveau terminal).
- Section "Événements" : liste réelle (nom + date), triée par date décroissante, filtrée
  côté client sur `events/events` (store déjà entièrement chargé par `fetchEvents`, cf.
  `events.js`) par `eventTypeId`/`eventCategoryId`/`eventSubcategoryId` selon l'entité.
- Chaque ligne événement est cliquable → ferme le tiroir et navigue vers `/events?editEventId=<id>`
  (réutilise le deep-link déjà existant dans `EventsListView.vue`, cf. BUG-154 ci-dessous pour le
  correctif nécessaire à sa fiabilité).

`EventsTypeListView.vue` migré vers ce composant (ancien `v-dialog`/state/`normalizeCategoryLabel`
supprimés). Action "œil" ajoutée à `EventsCategorieListView.vue` et
`EventsSubcategorieListView.vue` (jusque-là absente), branchée sur le même composant.

## Risque de régression / à surveiller

Non reproduit en navigateur (pas de `pnpm dev` dans cette session) — à valider manuellement : ouvrir
le tiroir depuis les 3 écrans, vérifier le dark mode, et cliquer un événement lié pour confirmer la
navigation vers `/events` avec la fiche ouverte (dépend du fix BUG-154).

## Références

- [BUG-130](130_eventcategorielist_hashometeam_jamais_envoye.md)/[BUG-145](145_eventcategorielist_duplication_creation_categorie.md) — précédent motivant le choix d'un composant partagé plutôt que 3 implémentations.
- [BUG-154](154_eventslistview_deeplink_editeventid_casse_keepalive.md) — fix connexe nécessaire pour que la navigation "événement lié" fonctionne de façon fiable.
