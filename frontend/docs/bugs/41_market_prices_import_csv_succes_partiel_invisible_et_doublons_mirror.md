# BUG-041 — Import CSV Market Prices : succès partiel invisible et doublons au réimport (fiche miroir)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : les deux (cause racine backend)
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/drawers/MarketPriceCsvImportDrawer.vue:502-619` (avant fix)

## Symptôme

À l'étape "Results" du drawer d'import CSV, si le backend échoue sur une seule ligne du lot,
**toutes** les lignes valides étaient marquées en échec avec `row: '?'` — impossible de savoir
lesquelles ont réellement été importées, et la liste ne se rafraîchissait pas (`$emit('imported')`
conditionné à `success > 0`). Par ailleurs, réimporter deux fois le même CSV créait des doublons
complets à chaque fois.

## Cause racine

Fiche miroir — diagnostic complet côté backend :
`api-datafriday-staging/docs/bugs/55_market_prices_bulkcreate_non_transactionnel_import_partiel_et_doublons.md`.

Résumé côté frontend : `doImport()` (avant fix, lignes 602-614) faisait un unique `try/catch`
autour de tout l'appel `POST /market-prices/import` ; en cas d'exception, la totalité de
`validItems` était poussée dans `results.errors` avec un `row: '?'` générique, sans lien avec la
ligne CSV réellement fautive.

## Correction

`doImport()` appelle désormais `importMarketPrices()` (`api/endpoints/menu.api.js`, au lieu d'un
`api.post` ad hoc) et exploite le nouveau format de retour du backend
(`{ created, skipped, errors: [{ index, message }] }`) : chaque erreur backend est remontée à sa
ligne CSV d'origine via un tableau `validItemRows` aligné index-à-index sur `validItems`, et
l'étape "Results" affiche désormais séparément le nombre de prix créés, de doublons ignorés, et
d'erreurs avec leur ligne exacte.

## Risque de régression / à surveiller

- Vérifier l'affichage des trois compteurs (créés / doublons ignorés / erreurs) avec un fichier de
  test mixte.
- L'échec réseau/serveur global (avant même que le backend ne traite les lignes) reste géré par un
  message générique (`row: '?'`) — cas résiduel légitime, on ne peut pas savoir ce qui a été
  committé avant une coupure réseau.

## Références

- Fiche complète (cause racine) : `api-datafriday-staging/docs/bugs/55_market_prices_bulkcreate_non_transactionnel_import_partiel_et_doublons.md`.
- [[42_market_prices_import_csv_goodtype_verrouille_valeurs_fixes]], [[43_market_prices_import_csv_supplierid_jamais_resolu]], [[44_market_prices_import_csv_priceperunit_incoherent]], [[45_market_prices_import_csv_parsing_champs_multilignes]], [[46_market_prices_import_csv_barre_progression_trompeuse]] — même composant, même analyse.
