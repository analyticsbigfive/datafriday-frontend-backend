# BUG-038 — Le clonage de rôle métier ne resynchronise jamais les permissions après création

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟢 Faible (comportement voulu, mais piégeux si non documenté)
- **Domaine** : Auth & onboarding (RBAC)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `permission-catalog.ts:250-296`

## Symptôme

Ajouter une permission au catalogue et l'attribuer à "Chef" dans `SYSTEM_ROLES` ne la propage à
AUCUN tenant existant — seulement aux tenants créés après ce changement.

## Cause racine

Les rôles métier sont clonés depuis `SYSTEM_ROLES` **à la création du tenant seulement** — voir
aussi [[project_rbac_business_roles_alignment]] : "gotcha clone create-only". Ce n'est pas un bug
de logique, mais l'absence de mécanisme de resync le rend piégeux si on l'ignore.

## Correction

Aucune à ce jour — soit un script de backfill à lancer après chaque évolution du catalogue de
permissions, soit documenter explicitement la procédure pour l'équipe.

## Risque de régression / à surveiller

Toute évolution du catalogue de permissions doit être suivie d'une vérification manuelle : les
tenants existants ont-ils besoin d'un backfill de rôles ?

## Références

- `datafriday-web/docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #8
