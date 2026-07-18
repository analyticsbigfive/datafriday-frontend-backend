# BUG-167 — Taxonomie Événements : écritures Vuex optimistes avec objets partiels (perte de champs après édition/création inline/import CSV)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (cosmétique, auto-résolu au bout de 15 min via le TTL de cache)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/store/modules/eventTypes.js:39` (`UPDATE_EVENT_TYPE`), `eventCategories.js:39`
  (`UPDATE_EVENT_CATEGORY`), `eventSubcategories.js:39` (`UPDATE_EVENT_SUBCATEGORY`) ;
  `components/events/views/EventsTypeListView.vue` (`submitType`, mode édition) ;
  `components/events/dialogs/EventTypeDialog.vue` (`submit`) ; `EventCategoryDialog.vue` (`submit`,
  création + édition) ; `EventSubcategoryDialog.vue` (`submit`) ;
  `components/events/drawers/TaxonomyImportDrawer.vue` (`doImport`, les 3 branches
  `type`/`category`/`subcategory`)

## Symptôme

Après avoir renommé un `EventType`/`EventCategory`/`EventSubcategory` via le drawer inline de
`/event-types` ou via `EventCategoryDialog.vue`, ou après en avoir créé un via les dialogs de
création rapide (`EventTypeDialog.vue`, `EventCategoryDialog.vue`, `EventSubcategoryDialog.vue`
montés depuis `EventFormDrawer.vue`/`/events`) ou via l'import CSV (`TaxonomyImportDrawer.vue`), la
ligne concernée dans `/event-types`/`/event-categories`/`/event-subcategories` affichait
`0 catégories`/`0 sous-catégories` et des colonnes `createdAt`/`updatedAt` vides — alors que les
données existaient bien côté backend. Le défaut se corrigeait tout seul au prochain rechargement
de la page une fois le cache Vuex expiré (TTL 15 min) ou après un `forceRefresh`.

## Cause racine

Les mutations `UPDATE_EVENT_TYPE`/`UPDATE_EVENT_CATEGORY`/`UPDATE_EVENT_SUBCATEGORY` remplaçaient
l'item entier dans la liste (`state.list.map(t => t.id === updated.id ? updated : t)`) au lieu de
fusionner avec l'existant — contrairement au pattern déjà utilisé dans `users.js:32`
(`{ ...u, ...updated }`), qui aurait dû servir de référence. Les composants appelants aggravaient
le problème en construisant eux-mêmes un objet partiel (`{ id, name }` ou `{ id, ...payload }`)
au lieu d'utiliser la réponse complète de l'API (qui elle-même n'inclut pas toujours les relations
`categories`/`subcategories`, absentes du `include` Prisma sur `update()`/`create()` côté backend
— seul `getEventTypes()`/`getEventCategories()` les inclut).

Sur `EventSubcategoryDialog.vue`, la réponse API utilise le vrai nom de colonne
`eventCategoryId` (`schema.prisma`), alors que `EventFormDrawer.vue:955`
(`handleSubcategoryCreated`) lit `created.categoryId` — alias uniquement accepté en écriture par
`POST/PATCH /event-subcategories` (`events.service.ts:291,350`, cf. zone grise déjà documentée dans
`docs/modules/07_EVENEMENTS.md`). Le fix a donc dû conserver cet alias en plus des champs réels.

## Correction

- Mutations `UPDATE_*` des 3 stores : fusion (`{ ...existing, ...updated }`) au lieu du
  remplacement complet.
- `EventsTypeListView.vue::submitType` (édition) : dispatch de la réponse API réelle
  (`{ id, ...updated }`) au lieu de `{ id, ...payload }` ; nom trimmé avant envoi (incohérence avec
  les autres écrans qui trimmaient déjà).
- `EventTypeDialog.vue`/`EventCategoryDialog.vue`/`EventSubcategoryDialog.vue::submit` : dispatch/
  emit de l'objet `created`/`updated` complet renvoyé par l'API au lieu d'un sous-ensemble
  construit à la main (`EventSubcategoryDialog.vue` conserve `categoryId` en plus, fusionné avec
  `created`, pour ne pas casser `EventFormDrawer.vue:955`).
- `TaxonomyImportDrawer.vue::doImport` : les 3 branches poussent l'objet `created` complet au
  store au lieu de `{ id, name, ... }`.

## Risque de régression / à surveiller

- Vérifié seulement par lecture de code + `node --check`/parse SFC (syntaxe) — **pas de
  reproduction live en navigateur** (interdiction de lancer `pnpm dev` dans cette session). À
  tester manuellement : éditer un type/catégorie/sous-catégorie et vérifier que la ligne garde ses
  bonnes valeurs de `categories`/`subcategories`/dates sans reload ; importer un CSV de
  types/catégories/sous-catégories et vérifier la même chose sur les lignes ajoutées ; créer une
  sous-catégorie depuis `EventFormDrawer.vue` (bouton "Créer" inline) et vérifier que
  `newEvent.eventSubcategoryId` se pré-remplit toujours correctement (dépend de l'alias
  `categoryId` conservé).
- Aucun test automatisé ajouté (pas de suite de tests existante sur ces stores/composants avant ce
  fix).

## Références

- `docs/modules/07_EVENEMENTS.md` (zone grise `eventCategoryId` vs `categoryId`)
- `src/store/modules/users.js:32` (pattern de merge de référence)
