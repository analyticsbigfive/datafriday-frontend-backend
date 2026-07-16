# BUG-043 — Import CSV Market Prices : `supplierId` jamais résolu (fournisseur toujours en texte libre)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/drawers/MarketPriceCsvImportDrawer.vue:590` (avant fix)

## Symptôme

Un Market Price importé via CSV avec un fournisseur déjà existant en base (même nom) n'est jamais
relié à l'entité `Supplier` réelle (`supplierRel` absent) — contrairement à une création manuelle
via `MarketPriceCreateDrawer.vue` qui, elle, envoie bien `supplierId`. Le fournisseur du CSV reste
uniquement stocké en texte libre (`supplier`), créant une incohérence relationnelle silencieuse
(pas de lien vers le vrai fournisseur, malgré son existence).

## Cause racine

`doImport()` (avant fix, ligne 590) ne peuplait que le champ texte `supplier` depuis la colonne
CSV mappée (`supplier: get('supplierName') || undefined`), sans jamais tenter de résoudre
`supplierId` par rapprochement avec la liste des fournisseurs existants — contrairement à
`marketPriceTypes`/`marketPriceCategories` qui, eux, étaient déjà rapprochés par nom (lignes
507-510, 572-578 avant fix).

## Correction

Ajout de la prop `suppliers` sur `MarketPriceCsvImportDrawer.vue` (liste des fournisseurs du
tenant, déjà calculée dans `MarketPriceListView.vue`, transmise via `:suppliers="suppliers"`).
`doImport()` recherche désormais un fournisseur existant dont le nom correspond (insensible à la
casse, trim) au nom fourni dans la colonne CSV, et renseigne `supplierId` en plus de `supplier` si
une correspondance est trouvée.

## Risque de régression / à surveiller

- Vérifier qu'un import avec un nom de fournisseur exactement identique à un fournisseur existant
  relie bien la ligne (`supplierRel` présent après import).
- Vérifier qu'un nom de fournisseur qui ne correspond à aucun fournisseur existant continue de
  fonctionner comme avant (texte libre seul, pas de création automatique de fournisseur — hors
  périmètre de ce fix).
- Le rapprochement est un match exact (casse/espaces normalisés) — une faute de frappe dans le CSV
  (ex. "FreshCo" vs "Fresh Co") ne sera pas reliée automatiquement ; comportement attendu, pas une
  résolution floue.

## Références

- [[41_market_prices_import_csv_succes_partiel_invisible_et_doublons_mirror]] — même composant, même analyse.
