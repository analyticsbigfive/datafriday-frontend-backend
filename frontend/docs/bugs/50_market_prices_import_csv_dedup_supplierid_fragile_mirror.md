# BUG-050 — Import CSV Market Prices : réimport créant des doublons malgré le dédoublonnage (fiche miroir)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : les deux (cause racine backend)
- **Découvert le** : 2026-07-16
- **Fichiers** : aucun fichier frontend modifié (cause et fix 100% backend)

## Symptôme

Réimporter un CSV déjà importé précédemment affichait "N créés, M doublons ignorés" — mais
certaines des lignes comptées en "créés" étaient en réalité des doublons visuels exacts de lignes
déjà existantes (constaté sur "Badiane" : 4 lignes fournisseur au lieu de 2, en deux paires
identiques). Le dédoublonnage introduit par le fix précédent (cf.
[[41_market_prices_import_csv_succes_partiel_invisible_et_doublons_mirror]]) ne suffisait donc pas
dans tous les cas.

## Cause racine

Fiche miroir — diagnostic complet côté backend :
`api-datafriday-staging/docs/bugs/56_market_prices_bulkcreate_dedup_supplierid_fragile.md`. En
résumé : le dédoublonnage comparait `supplierId` de façon stricte, une clé qui n'est pas toujours
renseignée de manière cohérente entre une ligne créée manuellement, une ligne créée par un ancien
import CSV (avant que [[43_market_prices_import_csv_supplierid_jamais_resolu]] ne soit corrigé), et
une ligne créée par un nouvel import qui résout désormais correctement ce champ.

## Correction

Aucun changement frontend nécessaire — le fix est entièrement dans la requête de dédoublonnage de
`bulkCreate()` côté backend, qui matche désormais sur le nom fournisseur texte (insensible à la
casse) en plus de `supplierId`.

## Risque de régression / à surveiller

- Les doublons déjà créés avant ce fix (y compris pendant les tests de cette session) restent en
  base et doivent être supprimés manuellement via l'icône poubelle sur la page `/market-prices`.
- Vérifier qu'un réimport du même fichier après ce fix ne recrée plus aucune ligne déjà présente.

## Références

- Fiche complète (cause racine) : `api-datafriday-staging/docs/bugs/56_market_prices_bulkcreate_dedup_supplierid_fragile.md`.
- [[41_market_prices_import_csv_succes_partiel_invisible_et_doublons_mirror]], [[43_market_prices_import_csv_supplierid_jamais_resolu]] — bugs liés, même composant.
