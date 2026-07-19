# BUG-150 — `EventsSubcategorieListView.vue exportToCSV` : colonne "Event Category" systématiquement vide

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/components/events/views/EventsSubcategorieListView.vue` (`exportToCSV`,
  ancienne version : `this.categoryNameById[s?.categoryId]`)

## Symptôme

Exporter le CSV depuis `/event-subcategories` produisait une colonne "Event Category" vide pour
**toutes** les lignes, pas seulement celles ajoutées récemment — indépendant du bug BUG-149
ci-dessus.

## Cause racine

`exportToCSV` lisait `s?.categoryId`, un champ qui n'existe sur aucune ligne renvoyée par
`GET /event-subcategories` : le vrai nom de colonne Prisma est `eventCategoryId`
(`schema.prisma`, modèle `EventSubcategory`). Le template du tableau juste au-dessus
(`#item.category`, ligne 66-76) gérait déjà correctement les deux noms
(`item?.categoryId || item?.eventCategoryId`), mais cette même logique n'avait pas été répliquée
dans `exportToCSV`.

## Correction

`this.categoryNameById[s?.categoryId] || this.categoryNameById[s?.eventCategoryId] || ''` — même
repli à deux champs que celui déjà utilisé dans le template du tableau.

## Risque de régression / à surveiller

- Vérifié par lecture de code uniquement (pas de reproduction live). À tester : exporter le CSV
  depuis `/event-subcategories` et vérifier que la colonne "Event Category" est bien remplie pour
  des sous-catégories existantes.

## Références

- `docs/bugs/149_taxonomie_evenements_optimistic_write_objets_partiels.md` (même écran, bug
  indépendant trouvé dans la même passe)
