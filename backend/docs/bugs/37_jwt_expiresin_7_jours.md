# BUG-037 — JWT expiresIn = 7 jours

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟢 Faible (mitigé par l'invalidation du cache d'auth Redis)
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `auth.module.ts:18`

## Symptôme

Une révocation de droits (changement de rôle, suspension) met jusqu'à 7 jours à expirer *le token
lui-même*.

## Cause racine

`expiresIn` du JWT est fixé à 7 jours. Mitigé en pratique par l'invalidation du cache d'auth
(Redis pub/sub) qui bloque l'accès effectif bien avant l'expiration du token brut — mais le JWT
reste valide côté signature pendant toute sa durée de vie si le cache est contourné/indisponible.

## Correction

Aucune à ce jour — envisager une durée plus courte + refresh, ou documenter explicitement que la
sécurité effective repose sur le cache Redis, pas sur l'expiration du JWT.

## Risque de régression / à surveiller

—

## Références

- `datafriday-web/docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #6
