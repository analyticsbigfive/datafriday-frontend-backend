# BUG-007 — Prix F&B Weezevent absent du catalogue

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (Weezevent)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-06-29

## Symptôme

Le catalogue Weezevent F&B affichait des produits sans prix.

## Cause racine

Le prix réel n'était pas porté par le catalogue produit mais par `ti.unitPrice` (ligne de
transaction) — le catalogue seul ne suffisait pas à dériver un prix de vente.

## Correction

Fix read-time : `deriveSalesPrices` dérive désormais le prix depuis les transactions réelles au
lieu du catalogue seul.

## Risque de régression / à surveiller

—

## Références

- —
