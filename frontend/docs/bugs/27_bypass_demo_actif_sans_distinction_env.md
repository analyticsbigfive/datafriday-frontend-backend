# BUG-027 — Bypass démo (`?demo=1`) actif sans distinction dev/prod

- **Statut** : 🟢 Corrigé (2026-07-18) — **par suppression, pas par restriction à l'environnement**
- **Sévérité** : 🟡 Moyenne (sécurité — accès non authentifié à des écrans protégés)
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `router/guards.js:32-44` (avant correction)

## Symptôme

Naviguer avec `?demo=1` sur `/dashboard` contourne entièrement `requireOrganization` en
**production**. Le flag `localStorage.analyse_demo` produit le même effet, et de façon
**persistante** pour le navigateur concerné.

## Cause racine

Le guard de route acceptait `?demo=1` / `localStorage.analyse_demo` sans distinguer
l'environnement (dev vs prod).

## Correction

Le bypass a été **retiré**, et non restreint au développement comme le prescrivait la version
initiale de cette fiche. La raison tient à un fait découvert en instruisant le correctif :

**le mode démo est déjà débranché.** `src/utils/demoMode.js::isDemoMode()` retourne `false` en dur
(commentaire du fichier : *« Les sections Analyse / EventPredict / Restock tournent désormais
exclusivement sur l'API réelle… `?demo=1` / `localStorage.analyse_demo` ne réactivent plus rien »*).
Toutes les branches mock qui en dépendent — dans `EventPredictView.vue`, `SpaceRestockView.vue`,
`SpaceInventoryView.vue`, `store/modules/inventory.js`, `space.api.js`,
`useEventPredictVersions.js` — sont neutralisées.

Le flag n'accordait donc plus **aucune donnée de démonstration** : sa seule conséquence vivante
était de laisser entrer un visiteur non authentifié sur des écrans qui, faute de token, se
faisaient de toute façon rejeter en 401 par l'API — 401 que l'intercepteur d'`api/client.js`
traduit en redirection vers `/login`. Le bypass ne servait plus rien, y compris en développement :
le restreindre au dev aurait préservé une capacité qui n'existe plus.

La restriction à l'environnement redeviendrait la bonne réponse **si** le mode démo était un jour
rebranché. Le commentaire laissé dans `guards.js` le dit explicitement.

## Risque de régression / à surveiller

**Test ajouté** : `tests/unit/routerGuards.spec.js` (5 cas). Deux d'entre eux existent uniquement
pour faire échouer la suite si le bypass est réintroduit « pour dépanner » — vérifié par mutation :
réinjecter `if (to.query?.demo === '1') return next()` dans `requireOrganization` fait bien tomber
2 tests.

**Écriture résiduelle du flag** : `EventPredictView.vue:3549` fait encore
`localStorage.setItem('analyse_demo', '1')` dans une branche de repli deep-link. Cette écriture est
désormais **inerte** (plus personne ne lit le flag pour contourner l'auth, et `isDemoMode()` est
faux), mais elle reste trompeuse à la lecture. Non nettoyée ici : le fichier appartient au domaine
Prévision (owner Jean-Luc) et fait 9 192 lignes — à traiter dans un lot dédié à ce domaine.

**À retester au navigateur** : accès à `/dashboard?demo=1` sans être connecté → doit rediriger vers
`/login`. Et vérifier qu'un navigateur portant déjà `analyse_demo=1` en `localStorage` (résidu d'une
session antérieure) n'a plus d'accès privilégié.

## Références

- [`../modules/08_AUTH_ONBOARDING.md`](../modules/08_AUTH_ONBOARDING.md) §"Récapitulatif — bugs
  actifs confirmés" #4
- [`../MODULE_AUTHENTIFICATION.md`](../MODULE_AUTHENTIFICATION.md)
- `src/utils/demoMode.js` — l'état débranché qui motive la suppression
- [[28_predict_test_sans_guard_auth]] — corrigé dans la même PR (même famille : surfaces non
  authentifiées)
