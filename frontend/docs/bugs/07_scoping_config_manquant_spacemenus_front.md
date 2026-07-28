# BUG-007 — Scoping config manquant sur perf/staff/inventory Space Menus (volet front)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Espaces & builder / Menu & recettes
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-04

## Symptôme

Voir `api-datafriday-staging/docs/bugs/12_scoping_config_manquant_spacemenus.md` — les données
perf/staff/inventory d'un Space Menu pouvaient afficher les valeurs d'une autre configuration du
même espace.

## Cause racine

Cf. fiche backend liée : `configId` manquant côté requêtes backend. Le front doit consommer le
contrat mis à jour de façon cohérente (envoi/affichage du `configId` actif).

## Correction

Déployé en même temps que le backend (migration + backend synchronisés avec le front).

## Risque de régression / à surveiller

Un décalage de déploiement FE/BE sur ce point casse l'affichage perf/staff/inventory.

## Références

- `api-datafriday-staging/docs/bugs/12_scoping_config_manquant_spacemenus.md`
