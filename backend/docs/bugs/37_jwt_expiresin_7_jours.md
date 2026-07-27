# BUG-037 — JWT expiresIn = 7 jours

- **Statut** : 🟢 Corrigé
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

**Corrigé le 2026-07-24** : `expiresIn` ramené de `7d` à `1d` (`auth.module.ts:18`, défaut
`app.config.ts:28` — les deux modifiés pour rester cohérents, même si seul le premier est
effectivement lu via `configService.get('JWT_EXPIRES_IN')`). Ce fix était volontairement séquencé
**après** BUG-09 (déconnexion multi-onglets) : raccourcir la durée de vie du JWT augmente la
fréquence de rotation du refresh token, ce qui aurait aggravé la course multi-onglets si BUG-09
n'avait pas déjà sa vraie correction en place. Vérifié le 2026-07-24 : BUG-09 est bien corrigé
(fix frontend du 2026-07-18, `resolveAuthStateChange`), donc sûr de procéder.

## Risque de régression / à surveiller

- Revérifier le comportement multi-onglets (BUG-09) en usage réel avec cette rotation plus
  fréquente — le fix frontend gère déjà ce cas mais n'avait pas été testé à cette fréquence de
  refresh.
- `JWT_EXPIRES_IN` en variable d'env peut toujours surcharger cette valeur — vérifier la config
  de déploiement (Render) ne fixe pas encore `7d` explicitement quelque part.

## Références

- `datafriday-web/docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #6
