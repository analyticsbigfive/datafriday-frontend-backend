# BUG-193 — Getter `isManager` mort (gating par nom de rôle, incompatible avec les 6 rôles métier)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur (code mort + piège latent)
- **Domaine** : Auth & onboarding (RBAC)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-22 · **Corrigé le** : 2026-07-22 (emmanuel)
- **Fichiers** : `src/store/modules/auth.js:59`

## Symptôme

Le store `auth` exposait un getter `isManager: (state) => ['ADMIN', 'MANAGER'].includes(state.roleSystemKey)`.
Aucun consommateur dans tout `src` (grep exhaustif : la seule occurrence était sa propre définition).

## Cause racine

Reliquat de l'ancien modèle de rôles `ADMIN`/`MANAGER`/`STAFF`/`VIEWER`. Depuis la migration RBAC
(ADMIN + 6 rôles métier, `systemKey = null`, cf. `HANDOFF_FRONT_RBAC_ROLES.md`), le gating doit se
faire sur les **codes de permission** (`can('<code>')`), jamais sur le **nom de rôle**. `isManager`
testait `roleSystemKey === 'MANAGER'` — or `MANAGER` n'est plus seedé → le getter renvoyait toujours
`false` pour un rôle métier, et constituait un **piège** si un développeur s'en resservait pour gater.

## Correction

Getter supprimé (1 ligne). `isAdmin` (bypass ADMIN légitime, `systemKey === 'ADMIN'`) et `can()`
(basé sur les permissions) sont conservés — ce sont les seuls mécanismes de gating alignés sur le
modèle actuel. Doc canonique mise à jour : `utiles/RBAC_SYSTEM.md` (getters).

## Risque de régression / à surveiller

Aucun (0 consommateur). Ne pas réintroduire de gating par nom de rôle : utiliser `can('<code>')` ou,
pour les cas hiérarchiques, `isAdmin`/`isOwner`.

## Références

- `HANDOFF_FRONT_RBAC_ROLES.md` (backend) — gate sur `permissions[]`, pas sur `systemKey`/nom de rôle
- `utiles/RBAC_SYSTEM.md` §getters du store `auth`
