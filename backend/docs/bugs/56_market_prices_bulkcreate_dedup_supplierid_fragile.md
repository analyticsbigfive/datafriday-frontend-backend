# BUG-056 — `bulkCreate` : dédoublonnage basé sur `supplierId` trop fragile, crée des doublons réels

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/features/market-prices/market-prices.service.ts:357-393` (avant fix, dédoublonnage introduit par BUG-055)

## Symptôme

Après le fix BUG-055 (dédoublonnage à l'insertion dans `bulkCreate`), un réimport de fichier CSV
a bien signalé "3 créés, 20 doublons ignorés" — mais les 3 lignes "créées" étaient en réalité des
doublons visuellement identiques à des lignes déjà existantes (même article, même fournisseur,
même prix, même packaging), simplement avec un `createdAt` différent (celui de l'import du jour).
Constaté sur "Badiane" : 4 lignes fournisseur au lieu de 2, en deux paires strictement identiques.

## Cause racine

Le dédoublonnage ajouté par BUG-055 matchait sur `supplierId` exact
(`supplierId: dto.supplierId ?? null`). Or `supplierId` n'est pas une clé stable entre les
différents chemins de création d'un `MarketPrice` :
- Les lignes créées manuellement (`MarketPriceCreateDrawer.vue:1292-1316`) n'envoient **jamais**
  de champ `supplier` (texte), seulement `supplierId`.
- Les lignes créées par d'anciens imports CSV, **avant** la résolution de `supplierId` par nom
  ajoutée dans cette même session (cf.
  `datafriday-web/docs/bugs/43_market_prices_import_csv_supplierid_jamais_resolu.md`), ont
  `supplierId = null` même si un fournisseur du même nom existe.

Résultat : dès qu'un réimport CSV résout désormais correctement `supplierId` (grâce au fix
BUG-043) alors que la ligne déjà en base avait `supplierId = null` (créée avant ce fix), la
comparaison exacte `supplierId: dto.supplierId ?? null` échoue à trouver la ligne existante — un
"doublon" est créé malgré une correspondance article/prix/unité/fournisseur parfaite en apparence.

## Correction

Le rapprochement fournisseur dans le dédoublonnage utilise désormais un `OR` entre trois critères
au lieu d'une égalité stricte sur `supplierId` :
- `supplier` (texte libre) égal, insensible à la casse — toujours renseigné par les imports CSV,
  quel que soit l'état de résolution de `supplierId` ;
- `supplierId` égal — fiable pour les lignes créées manuellement (qui n'ont pas de `supplier`
  texte) tant que la résolution par nom reste cohérente ;
- `supplierItem` (référence article chez ce fournisseur, ex. "PAPRIKA DOUX 1KG") égal, insensible
  à la casse — ajouté après vérification en base : des lignes créées manuellement ont
  `supplier = ""` (chaîne vide, pas `null`), donc le critère texte ci-dessus ne les couvre pas ;
  `supplierItem` reste un signal d'identité fiable indépendant de toute résolution de FK, et
  couvre le cas où la résolution `supplierId` échouerait côté frontend pour une raison
  quelconque (ex. liste des fournisseurs pas encore chargée au moment de l'import).

`itemName` et `unit` sont désormais comparés insensibles à la casse également (une casse
différente entre deux imports ne doit pas empêcher de reconnaître le même article/la même unité).

## Risque de régression / à surveiller

- **Nettoyage des données** : les doublons déjà créés par ce bug avant le correctif restent en
  base (ex. les 2 lignes en trop sur "Badiane" observées) — à supprimer manuellement via l'icône
  poubelle sur la ligne fournisseur en trop (reconnaissable à sa date d'ajout correspondant à
  l'import du jour). Ce fix empêche les futurs doublons, il ne nettoie pas rétroactivement.
- Vérifier qu'un réimport du même fichier après ce fix ne recrée plus aucune des lignes déjà
  présentes (0 créé, tout en doublons ignorés).
- Deux fournisseurs distincts partageant accidentellement le même nom (texte) pour le même article
  au même prix seraient désormais considérés comme un doublon et l'un des deux serait ignoré —
  risque résiduel accepté, cas très improbable et de toute façon déjà présent dans la sémantique
  du champ `supplier` texte partagé.

## Références

- Fiche miroir frontend : `datafriday-web/docs/bugs/50_market_prices_import_csv_dedup_supplierid_fragile_mirror.md`.
- [[55_market_prices_bulkcreate_non_transactionnel_import_partiel_et_doublons]] — introduit le dédoublonnage corrigé ici.
- Fiche liée : `datafriday-web/docs/bugs/43_market_prices_import_csv_supplierid_jamais_resolu.md` (résolution de supplierId, dont l'introduction a révélé cette fragilité).
