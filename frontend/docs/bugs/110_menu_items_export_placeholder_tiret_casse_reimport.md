# BUG-110 — Export/Import CSV MenuItem : le placeholder d'affichage "-" cassait le réimport en masse

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17 (signalé par l'utilisateur — réimport réel d'un export réel : 77
  erreurs "Type "-" introuvable" sur ~120 articles, 0 ligne valide)
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemView.vue` (export),
  `src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue` (import)

## Symptôme

Réimporter un fichier tout juste exporté depuis `/menu-items` échouait presque totalement : la
grande majorité des lignes étaient rejetées avec `Type "-" introuvable`, alors que ce sont
exactement les mêmes articles que ceux déjà en base.

## Cause racine

`mapItemToRow()` (`MenuItemView.vue`) affiche `"-"` comme texte de repli quand un article n'a pas
de type/catégorie (`item?.productType?.name || "-"`) — un choix d'affichage légitime pour le
tableau/la grille. Mais `onExportCsv()` réutilisait ce même champ déjà mappé
(`raw.productType?.name || item.type || ''`) pour construire la colonne CSV "Type" : le repli sur
`item.type` réinjectait le `"-"` d'affichage **dans le fichier exporté**, comme si `"-"` était un
vrai nom de type. Au réimport, `resolveTypeCategory()` cherchait alors un `ProductType` réellement
nommé `"-"` — inexistant — et rejetait la ligne.

## Correction

- **Export** : les colonnes Type/Catégorie utilisent désormais directement `raw.productType?.name`/
  `raw.productCategory?.name` (repli sur chaîne vide, jamais sur le champ d'affichage `"-"`).
- **Import** : `resolveTypeCategory()` traite en plus explicitement `"-"` comme équivalent à une
  valeur vide (en plus de la chaîne vide) — défense en profondeur, au cas où un autre fichier CSV
  (pas généré par cet export) contiendrait aussi ce placeholder.

## Risque de régression / à surveiller

Si un futur champ d'affichage introduit un autre placeholder texte (`"—"`, `"N/A"`, etc.), vérifier
qu'aucune fonction d'export ne le reprend tel quel comme valeur de donnée exportée — c'est la
classe de bug exacte ici.

## Références

- [[107_menu_items_export_csv_lent_incomplet_ids_bruts]]
- [[112_menu_items_import_mapping_creation_auto_referentiels]] (le fix complémentaire : même un
  vrai nom de type inconnu n'est plus une erreur bloquante, il est créé automatiquement)
