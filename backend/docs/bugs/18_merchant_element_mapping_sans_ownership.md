# BUG-018 — createMerchantElementMapping sans vérification d'ownership tenant

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur (sécurité — accès cross-tenant potentiel)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `mappings.service.ts:364-434`

## Symptôme

Appeler l'endpoint avec un `spaceElementId` appartenant à un autre tenant (nécessite un accès API
direct, pas un chemin UI normal) l'accepte sans vérification.

## Cause racine

`createMerchantElementMapping`/`bulkMerchantElementMappings` (happy-path) n'imposent aucune
vérification que le `spaceElementId` fourni appartient bien au tenant de l'appelant.

## Correction

Aucune à ce jour.

## Risque de régression / à surveiller

À traiter avec la même priorité que les failles cross-tenant déjà connues (voir BUG-035,
`OrganizationsController`) — même famille de défaut d'isolation multi-tenant.

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #5
