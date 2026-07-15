# BUG-008 — TVA par défaut 20% incorrecte

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (agrégats financiers faux)
- **Domaine** : Menu & recettes / Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-06-29

## Symptôme

Un défaut de TVA à 20% était appliqué à tort dans certains agrégats, faussant les montants HT/TTC
affichés.

## Cause racine

Confusion entre 3 champs de TVA distincts : `ti.vat` (transaction), `p.vatRate` (produit) et
`MenuItem.vatRate`. Le défaut 20% masquait les cas où la TVA réelle différait de 20%.

## Correction

Défaut supprimé ; les agrégats utilisent désormais `ti.vat`, la TVA réelle de la transaction.

## Risque de régression / à surveiller

Vérifier que les 3 champs `vat` restent bien utilisés chacun dans leur contexte propre — ne pas
les refusionner par erreur dans un futur refactor de pricing.

## Références

- —
