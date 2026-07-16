# BUG-055 — `bulkCreate` non transactionnel : import CSV partiellement invisible + doublons garantis au réimport

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/features/market-prices/market-prices.service.ts:350-393` (avant fix), `src/features/market-prices/market-prices.controller.ts:41-48`, `prisma/schema.prisma` (modèle `MarketPrice`, absence de `@@unique`)

## Symptôme

Sur le drawer d'import CSV `/market-prices` (étape "Results") :
1. Si une ligne du CSV échoue côté backend (contrainte, image, etc.), **toutes** les lignes du lot
   sont affichées comme échouées côté front, alors qu'une partie a réellement été créée en base ;
   la liste ne se rafraîchit même pas (aucun moyen de savoir ce qui a été importé sans rouvrir la
   page).
2. Réimporter deux fois le même fichier CSV crée systématiquement des doublons complets — aucune
   protection à l'insertion.

## Cause racine

`MarketPricesService.bulkCreate()` (avant fix, lignes 350-393) traitait tous les items dans une
boucle `for` avec un unique `try/catch` englobant **toute la boucle**, sans transaction Prisma :
- Une exception sur l'item N laissait les items 1..N-1 déjà committés en base, mais faisait
  remonter une seule exception générique au contrôleur (`bulkImport`,
  `market-prices.controller.ts:41-48`) puis à Axios côté front — impossible de distinguer "rien
  n'a été créé" de "une partie a été créée avant la casse".
- Aucune vérification de doublon avant `create()` : le modèle `MarketPrice` n'a aucune contrainte
  `@@unique` en base (seulement des `@@index` simples), et l'endpoint séparé
  `POST /market-prices/deduplicate` n'est jamais appelé automatiquement par le flow d'import.

## Correction

`bulkCreate()` traite désormais chaque ligne indépendamment (toujours sans transaction globale —
un rollback total serait pire que des lignes partiellement importées pour un import CSV de masse) :
- Avant chaque création, vérification d'un doublon **exact** (`tenantId + itemName + unit + price
  + supplierId`) — plus strict que `deduplicate()` (qui ignore prix/unité/quantité, cf.
  `24_dedup_marketprice_criteres_insuffisants.md`) donc sans risque de fusionner deux prix
  réellement différents. Un doublon exact est compté en `skipped`, pas recréé.
- Chaque erreur individuelle est catchée par item (pas par lot) et retournée avec son `index`
  dans le tableau d'entrée.
- Retour structuré `{ created: MarketPrice[], skipped: number, errors: Array<{ index, itemName,
  message }> }` au lieu de soit un tableau complet soit une exception globale.

Le contrôleur (`bulkImport`) n'a pas eu besoin de changement : simple passe-plat vers le service.
Côté frontend, `MarketPriceCsvImportDrawer.vue` exploite ce nouveau format pour attribuer chaque
erreur à sa ligne CSV d'origine et afficher séparément créés/doublons ignorés/erreurs (cf. fiche
miroir).

## Risque de régression / à surveiller

- Vérifier qu'un import avec une ligne volontairement invalide (ex. `supplierId` inexistant)
  affiche bien "N créés, 1 erreur (ligne X)" plutôt que tout en échec.
- Vérifier qu'un réimport identique du même fichier affiche bien "0 créés, N doublons ignorés" et
  ne duplique rien en base.
- Vérifier qu'un import mêlant lignes nouvelles + lignes déjà existantes + une ligne invalide donne
  un décompte cohérent des trois catégories.
- Le dédoublonnage à l'insertion ne couvre que le chemin `bulkCreate` (import CSV) — le `create()`
  unitaire et l'endpoint `deduplicate()` restent inchangés et gardent leurs limites déjà
  documentées.

## Références

- Fiche miroir frontend : `datafriday-web/docs/bugs/41_market_prices_import_csv_succes_partiel_invisible_et_doublons_mirror.md`.
- [`24_dedup_marketprice_criteres_insuffisants.md`](24_dedup_marketprice_criteres_insuffisants.md) — limites connues de `deduplicate()`, non résolues par ce fix.
