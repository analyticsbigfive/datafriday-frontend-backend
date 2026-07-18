# BUG-150 — JWT imprimé en clair dans la console lors de l'onboarding

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Faible (hygiène — pas d'exposition à un tiers distant)
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15 (documenté dans `docs/modules/08_AUTH_ONBOARDING.md`, bug actif n°7)
- **Fichiers** : `src/store/modules/auth.js:351` (avant correction)

## Symptôme

À la création d'une organisation, l'action `createOrganization` imprimait le JWT d'accès complet
dans la console du navigateur :

```js
console.log('TOKEN au moment du post:', getters.token)
```

Le token apparaissait donc en clair dans les DevTools, dans une capture d'écran de support, ou dans
tout outil de collecte de logs navigateur.

## Cause racine

Log de débogage laissé en place après une session de diagnostic — vraisemblablement l'investigation
sur le JWT ne portant pas encore le `tenant_id` avant `refreshSession()` (voir `auth.js:382`).

Ce n'est pas une fuite vers un tiers : le token n'était envoyé nulle part, il s'affichait
localement. La gravité reste faible, mais un JWT porteur de 7 jours de validité
(`auth.module.ts:18`) n'a rien à faire dans une console.

## Correction

Branche `fix/currentBug-fixAuthentification`. Ligne supprimée. Le paramètre `getters` de l'action
`createOrganization` devenait inutilisé — retiré de la déstructuration.

Les autres `console.log` de `auth.js` (`createOrganization` réponse, `resetPassword` result…) n'ont
**pas** été touchés : ils n'exposent pas de secret, et leur nettoyage relève de la dette D5
inventoriée dans [`../AUDIT_VUEX_STORE.md`](../AUDIT_VUEX_STORE.md), à traiter en lot plutôt qu'au
coup par coup.

## Risque de régression / à surveiller

Aucun — suppression d'un log, aucun changement de comportement.

À surveiller : le même motif existe ailleurs dans le store (21 occurrences dans `inventory.js`, 14
dans `auth.js`, 10 dans `analyse.js`). Vérifier au passage qu'aucun autre n'imprime de secret.

## Références

- [`../modules/08_AUTH_ONBOARDING.md`](../modules/08_AUTH_ONBOARDING.md) — bug actif n°7
- [`../AUDIT_VUEX_STORE.md`](../AUDIT_VUEX_STORE.md) — dette D5, logs de debug en production
- [[149_auth_signed_out_rotation_deconnexion_multi_onglets]] — corrigé dans la même PR
