# BUG-036 — POST /onboarding/join/:slug déprécié mais actif, sans vérification de code

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Moyenne (sécurité — accès non invité à un tenant)
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `onboarding.controller.ts` (route supprimée, ex `:182-201`), `onboarding.service.ts`
  (méthode supprimée, ex `:100-173`)

## Symptôme

Connaître ou deviner le `slug` d'une organisation (souvent dérivé du nom de l'orga) suffit pour
rejoindre ce tenant en rôle `VIEWER`, sans invitation ni code de vérification.

## Cause racine

La route est marquée dépréciée mais reste montée et fonctionnelle, sans le contrôle de code que le
chemin recommandé (join-by-code) impose.

## Correction

**Correction appliquée** : suppression pure et simple de la route (option "désactiver"), et non ajout
d'une vérification.

Recherche préalable dans `frontend/src` (`grep -rn "onboarding/join"`) : seul `/onboarding/join-by-code`
est appelé (`frontend/src/store/modules/auth.js:428`, action `joinOrganization`). Aucun appelant actuel
de `/onboarding/join/:slug` — la route était donc une surface d'attaque morte, sûre à retirer sans
impact utilisateur.

Suppression :
- `onboarding.controller.ts` : retrait de la méthode `joinTenant` / route `@Post('join/:slug')`
  (imports `Param` et `JoinTenantDto` devenus inutiles également retirés).
- `onboarding.service.ts` : retrait de la méthode `joinTenant(...)` (l'ancienne logique sans
  vérification de code).
- `dto/join-tenant.dto.ts` : fichier supprimé (devenu orphelin).
- `onboarding.controller.spec.ts` : retrait du stub `joinTenant: jest.fn()` devenu inutile (aucun test
  n'exerçait la route déprimée, rien d'autre à adapter).

Le flux recommandé `join-by-code` (`joinByInvitationCode`) reste inchangé et continue d'exiger un code
d'invitation valide (`invitationEnabled: true`, tenant non `SUSPENDED`).

## Risque de régression / à surveiller

Aucun appelant frontend identifié pour `/onboarding/join/:slug` au moment de la correction (2026-07-24).
Si un client externe (mobile, intégration tierce, script) appelait encore cette route déprimée, il
recevra désormais un 404 au lieu d'un accès non vérifié — surveiller les logs 404 sur ce chemin après
déploiement, sans quoi rien à signaler.

## Références

- `datafriday-web/docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #3
