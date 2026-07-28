# BUG-051 — Import CSV Market Prices : dédoublonnage totalement inopérant pour la plupart des prix (fiche miroir)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : les deux (cause racine backend)
- **Découvert le** : 2026-07-16
- **Fichiers** : aucun fichier frontend modifié (cause et fix 100% backend)

## Symptôme

Même après les fix précédents (succès partiel invisible, dédoublonnage sur supplierId fragile),
réimporter un CSV continuait de créer des doublons exacts sur des articles dont le prix comportait
une décimale non triviale (9,80 €, 8,54 €, 9,30 €) — alors que des articles à prix "ronds" (ex.
21,40 €) semblaient correctement détectés comme doublons.

## Cause racine

Fiche miroir — diagnostic complet côté backend :
`api-datafriday-staging/docs/bugs/57_market_prices_bulkcreate_dedup_decimal_number_comparaison_silencieuse.md`.
En résumé : Prisma ne matche pas un champ `Decimal` (`MarketPrice.price`) comparé à un `number`
JavaScript brut dans un `where` — la vérification de doublon était un no-op silencieux pour la
plupart des prix réels, indépendamment de tous les raffinements apportés côté fournisseur.

## Correction

Aucun changement frontend nécessaire — fix entièrement dans la requête de dédoublonnage de
`bulkCreate()` côté backend (`price: dto.price` → `price: String(dto.price)`).

## Risque de régression / à surveiller

- Les doublons déjà créés avant ce fix restent en base et doivent être supprimés manuellement.
- Vérifier qu'un réimport du même fichier ne recrée plus aucune ligne, y compris pour des prix à
  décimales non triviales.

## Références

- Fiche complète (cause racine) : `api-datafriday-staging/docs/bugs/57_market_prices_bulkcreate_dedup_decimal_number_comparaison_silencieuse.md`.
- [[50_market_prices_import_csv_dedup_supplierid_fragile_mirror]] — bug précédent du même dédoublonnage, dont celui-ci rendait l'effet nul en pratique.
