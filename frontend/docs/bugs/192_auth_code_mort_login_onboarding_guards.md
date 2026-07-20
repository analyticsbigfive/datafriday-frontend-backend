# BUG-192 — Code mort du domaine Auth : `Login.vue`, `endpoints/onboarding.js`, 4 guards

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟢 Faible (dette — aucun impact fonctionnel, mais pièges de lecture actifs)
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15 (inventorié dans `docs/modules/08_AUTH_ONBOARDING.md` §"Code mort")
- **Fichiers** : `src/components/Login.vue`, `src/api/endpoints/onboarding.js`, `src/router/guards.js`, `src/router/index.js:3`

## Symptôme

Pas de symptôme utilisateur. Le problème est un **piège de lecture** : trois zones de code mort qui
ressemblent à du code vivant, et vers lesquelles un développeur ou un agent se dirige naturellement.

Le cas le plus coûteux : `src/api/endpoints/onboarding.js` est une API bien formée, correctement
nommée, au bon endroit dans l'arborescence. Quelqu'un cherchant « où modifier l'onboarding » la
trouve en premier — et modifie du code qui n'est jamais exécuté, la logique réelle étant
réimplémentée en dur dans `store/modules/auth.js`.

## Cause racine

Trois origines distinctes, toutes vérifiées par recherche exhaustive avant suppression :

| Zone | Preuve de mort | Origine |
|---|---|---|
| `components/Login.vue` | Zéro importeur (`grep` sur tout `src/`). `router/index.js` monte `views/LoginView.vue`. Un seul commit git (`3a39240`, scaffold de masse du 16/12/2025), jamais retouché ; soumission = `alert('Connexion réussie !')` | Scaffold initial jamais nettoyé |
| `api/endpoints/onboarding.js` | Ses 3 exports (`getOnboardingStatus`, `completeOnboarding`, `joinOrganization`) n'ont aucun importeur. `auth.js` appelle `/onboarding/status`, `/onboarding` et `/onboarding/join-by-code` en dur sur l'instance Axios | Couche API doublée puis contournée |
| `guards.js` : `requireAuth`, `requireAdmin`, `requireManager`, `requirePermission` | Aucune n'est posée en `beforeEnter`. `requireAuth` était même **importée dans `router/index.js:3` sans être utilisée** | Le mécanisme qu'ils anticipaient a été implémenté ailleurs — `meta.permission` + `beforeEach` global (`index.js:415-433`) |

## Correction

Branche `fix/currentBug-fixAuthentification`.

- `src/components/Login.vue` — **supprimé**
- `src/api/endpoints/onboarding.js` — **supprimé**
- `src/router/guards.js` — les 4 guards morts supprimés (236 → 140 lignes, −40 %)
- `src/router/index.js:3` — `requireAuth` retiré de l'import

**Vérification préalable systématique.** Chaque suppression a été précédée d'un `grep` exhaustif sur
`src/`, et le décompte des références a été fait guard par guard — y compris pour les 4 guards
**conservés** (`requireOrganization` 2 usages, `onboardingGuard` 1, `guestOnly` 3, `spaceEntryGuard`
1), afin de ne pas se fier au seul inventaire de la documentation.

À noter : `joinOrganization` produit des correspondances `grep` dans `auth.js` — ce sont celles de
l'**action de store homonyme**, pas d'un import du fichier d'endpoints. Le piège de l'homonymie a
été levé explicitement avant suppression.

`SPACE_SCREENS` est conservé : consommé par `spaceEntryGuard`.

## Risque de régression / à surveiller

**Contrôle après suppression** : `grep` des 7 symboles retirés sur tout `src/` → aucune occurrence.
Suite complète inchangée (428 passés, 4 échecs pré-existants sans rapport), et
`tests/unit/routerGuards.spec.js` — qui exerce `requireOrganization`, voisine des blocs supprimés —
passe toujours.

**Le risque réel n'est pas la régression mais la réintroduction.** Si un besoin de guard par
permission réapparaît, ne pas réécrire `requirePermission` : le mécanisme existe déjà via
`meta: { permission: 'code' }` + le `beforeEach` global de `router/index.js`. C'est précisément la
duplication qui avait produit ce code mort.

De même, pour modifier le comportement d'onboarding côté front, éditer `store/modules/auth.js` —
il n'y a plus de fichier d'endpoints à mettre à jour, et c'est volontaire tant que `auth.js` n'a pas
été découpé.

## Références

- [`../modules/08_AUTH_ONBOARDING.md`](../modules/08_AUTH_ONBOARDING.md) §"Code mort de ce domaine",
  §"Piège n°3" (`Login.vue`), §"Piège n°4" (`onboarding.js`)
