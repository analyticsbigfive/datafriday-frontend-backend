# BUG-086 — Import CSV MenuItem : aucune déduplication au réimport

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue:449-483`

## Symptôme

Réimporter deux fois le même CSV (par exemple après l'échec partiel décrit dans
[[85_menu_items_csv_succes_partiel_invisible]]) crée des menu items en double par nom, sans
avertissement.

## Cause racine

`runImport()` envoie directement `validRows.map(buildPayload)` à `bulkCreateMenuItems`/
`createMenuItem` sans vérifier l'existence préalable d'un item du même nom dans le catalogue déjà
chargé en store.

## Correction

Avant l'appel API, chaque ligne est comparée (nom normalisé, insensible à la casse/espaces) à la
liste des menu items déjà présents dans le store `menuItems`. Les doublons détectés sont exclus de
l'import et listés explicitement à l'utilisateur (comme "ignorés — déjà existants") plutôt que
renvoyés silencieusement au backend.

## Risque de régression / à surveiller

Un article légitimement renommé puis réimporté sous son ancien nom serait à tort marqué comme
doublon — vérifier que le message affiché permet à l'utilisateur de comprendre et de contourner
si besoin (ex. renommer avant réimport).

## Références

- [[50_market_prices_import_csv_dedup_supplierid_fragile_mirror]] (même classe de bug sur
  `/market-prices`).
