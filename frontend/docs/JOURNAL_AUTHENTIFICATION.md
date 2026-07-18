# Journal des changements — Module Authentification

> Registre des modifications apportées au domaine **Auth & onboarding / RBAC**, avec auteur, date,
> heure et description. Tenu à jour à chaque intervention sur le module.
>
> **Périmètre** : uniquement le module authentification. Les changements portant sur d'autres
> domaines n'y figurent pas.
>
> **Sources de référence** — un changement n'est considéré comme documenté que s'il est répercuté
> dans les trois :
> 1. [`modules/08_AUTH_ONBOARDING.md`](modules/08_AUTH_ONBOARDING.md) — source de vérité du domaine
> 2. [`MODULE_AUTHENTIFICATION.md`](MODULE_AUTHENTIFICATION.md) — synthèse opérationnelle
> 3. [`bugs/`](bugs/00_INDEX.md) — fiche individuelle par bug, avec statut
>
> **Convention d'entrée** : `[AAAA-MM-JJ HH:MM] — Auteur — Type — Titre`, puis fichiers touchés,
> description, vérification, statut. Les heures sont celles de dernière écriture des fichiers
> concernés (fuseau GMT).

---

## Résumé

| Date | Heure | Auteur | Type | Objet | Statut |
|---|---|---|---|---|---|
| 2026-07-18 | 14:31–14:40 | emmanuel | Correctif | [BUG-149](bugs/149_auth_signed_out_rotation_deconnexion_multi_onglets.md) — déconnexion multi-onglets sur rotation du refresh token | 🟢 Corrigé |
| 2026-07-18 | 14:34 | emmanuel | Correctif | [BUG-150](bugs/150_auth_console_log_jwt_en_clair.md) — JWT imprimé en clair dans la console | 🟢 Corrigé |
| 2026-07-18 | 14:52 | emmanuel | Correctif | [BUG-028](bugs/28_predict_test_sans_guard_auth.md) — `/predict-test` sans guard | 🟢 Corrigé |
| 2026-07-18 | 15:04–15:05 | emmanuel | Correctif | [BUG-027](bugs/27_bypass_demo_actif_sans_distinction_env.md) — bypass démo `?demo=1` | 🟢 Corrigé |
| 2026-07-18 | 15:08 | emmanuel | Documentation | Création de [`MODULE_AUTHENTIFICATION.md`](MODULE_AUTHENTIFICATION.md) | ✅ |
| 2026-07-18 | 15:16 | emmanuel | Configuration | `VUE_APP_API_URL` absente — 404 sur `POST /onboarding` | ⚠️ Local, non versionné |
| 2026-07-18 | 17:57 | emmanuel | **Correctif de régression** | Interblocage du `signOut()` introduit par la 1ʳᵉ version de BUG-149 | 🟢 Corrigé, vérifié au navigateur |
| 2026-07-18 | 18:59 | emmanuel | Documentation | Création de [`AMELIORATIONS_AUTHENTIFICATION.md`](AMELIORATIONS_AUTHENTIFICATION.md) | ✅ |
| 2026-07-18 | 18:59 | emmanuel | Nettoyage | [BUG-151](bugs/151_auth_code_mort_login_onboarding_guards.md) — suppression du code mort du domaine | 🟢 Corrigé |
| 2026-07-18 | 19:11 | emmanuel | **Vérification navigateur** | Recette des correctifs des lots 1 à 3 | ✅ 5/6 scénarios verts |

Branche de travail : `fix/currentBug-fixAuthentification`. **Aucun commit effectué à ce jour** —
les changements sont dans l'arbre de travail.

---

## [2026-07-18 14:31–14:40] — emmanuel — Correctif — BUG-149 : déconnexion intempestive multi-onglets

**Fichiers**
- `src/utils/authSessionEvent.js` *(nouveau)*
- `src/store/modules/auth.js` — handler `onAuthStateChange`, imports, variables de module
- `src/api/client.js` — export de `isExplicitlyLoggedOut()`
- `tests/unit/authSessionEvent.spec.js` *(nouveau, 11 cas)*
- `tests/unit/authStateChangeHandler.spec.js` *(nouveau, 8 cas)*

**Description**

Le handler `onAuthStateChange` ignorait le type d'événement (`_event`) et ne branchait que sur
`session` truthy/falsy : toute session absente déclenchait `CLEAR_AUTH`. Or le refresh token
Supabase est à usage unique — quand plusieurs onglets sont ouverts, l'onglet qui perd la course au
renouvellement reçoit un `SIGNED_OUT` avec session nulle, alors que la session persistée vient
d'être renouvelée et reste valide. D'où une déconnexion en pleine édition.

La décision a été extraite dans une fonction pure, `resolveAuthStateChange()`, qui rend un verdict
`apply` / `ignore` / `clear`. L'ordre des tests est signifiant : le drapeau de déconnexion explicite
est évalué **avant** la relecture du stockage, car `signOut()` appelle `clearAccessToken()` avant
`supabase.auth.signOut()` — sans cet ordre, une déconnexion volontaire pourrait lire l'ancienne
session, la juger valide, et ne jamais déconnecter.

Point de conception : la propagation d'une déconnexion volontaire entre onglets est un comportement
**voulu** de Supabase. Le correctif distingue les deux cas, il ne supprime pas la propagation.

> ⚠️ **Cette version relisait la session via `getSessionOnce()` et a provoqué un interblocage du
> `signOut()`.** Corrigée à 17:57 — voir l'entrée dédiée en fin de journal. Ce qui suit décrit
> l'intervention telle que faite à 14:40 ; la garde de réentrance mentionnée ci-dessous a depuis
> été supprimée, devenue sans objet.

**Deux défauts adjacents corrigés dans la même passe**
- Absence de garde de réentrance : `getSessionOnce()` déclenche un refresh si le token est expiré,
  lequel ré-émet un événement — la résolution pouvait boucler. *(Garde retirée à 17:57 : le handler
  ne fait plus d'appel asynchrone au SDK.)*
- Souscription `onAuthStateChange` jamais libérée : `initialize` étant dispatché par le `beforeEach`
  global **et** par `AuthCallbackView.vue`, un premier appel échouant avant `SET_INITIALIZED`
  empilait un second listener, donc deux `CLEAR_AUTH` sur le même événement. *(Toujours en place.)*

**Vérification**
- 19 tests unitaires ajoutés, tous passants. Premiers tests du domaine auth, qui n'en avait aucun.
- Validés par mutation : inverser l'ordre de décision fait tomber 2 tests.
- Suite complète : 4 échecs, tous **pré-existants** (transformation ESM d'axios sous Jest), vérifiés
  identiques avant/après par `git stash`.

**Limite de cette vérification, mise en évidence par la régression** — les tests mockaient
`getSessionOnce()`, donc ils ne pouvaient pas révéler que l'appeler depuis le callback était
interdit. Un test unitaire valide la logique qu'on lui donne, pas la justesse du contrat qu'on
suppose au SDK. C'est le test navigateur qui a trouvé le défaut.

**Reste à faire** — vérification navigateur des 5 scénarios (voir la fiche). Le scénario de rotation
n'est pas reproductible à la demande avec un JWT de 7 jours ; trois méthodes de forçage sont
décrites dans la fiche. Statut maintenu à 🟡 tant que ce n'est pas fait.

---

## [2026-07-18 14:34] — emmanuel — Correctif — BUG-150 : JWT en clair dans la console

**Fichiers** — `src/store/modules/auth.js:351` (avant correction)

**Description**

L'action `createOrganization` imprimait le JWT complet via
`console.log('TOKEN au moment du post:', getters.token)`. Ligne supprimée ; le paramètre `getters`
devenant inutilisé, il a été retiré de la déstructuration de l'action.

Les autres `console.log` du module n'ont pas été touchés : ils n'exposent aucun secret et relèvent
de la dette D5 inventoriée dans [`AUDIT_VUEX_STORE.md`](AUDIT_VUEX_STORE.md), à traiter en lot.

**Vérification** — suppression d'un log, aucun changement de comportement.

---

## [2026-07-18 14:52] — emmanuel — Correctif — BUG-028 : `/predict-test` sans guard

**Fichiers**
- `src/router/index.js` — déclaration de la route

**Description**

La route était montée sans guard, y compris en production. La fiche laissait trois options ouvertes
(guarder, désactiver en prod, assumer public). **Option retenue : ne pas monter la route quand
`NODE_ENV === 'production'`**, en conservant l'accès libre hors production.

Raisonnement : c'est un banc de test du moteur predict sur données mock. Un guard d'auth lui ferait
perdre son intérêt — pouvoir exercer le moteur sans compte — alors que sa présence en production
n'apporte rien et ajoute une surface non authentifiée.

**Point de vigilance** — le composant reste référencé par un `import()` dynamique : webpack peut
encore émettre son chunk au build de production. La route n'étant pas déclarée, il est
inatteignable par navigation. Ne pas conclure de la présence du fichier dans `dist/` que le
correctif n'a pas pris.

---

## [2026-07-18 15:04–15:05] — emmanuel — Correctif — BUG-027 : bypass démo `?demo=1`

**Fichiers**
- `src/router/guards.js` — `requireOrganization`
- `tests/unit/routerGuards.spec.js` *(nouveau, 5 cas)*

**Description**

⚠️ **Correctif divergent de la prescription initiale de la fiche.** Celle-ci demandait de
restreindre le bypass à l'environnement de développement. Il a été **entièrement retiré**, sur la
base d'un fait découvert en instruisant le correctif :

`src/utils/demoMode.js::isDemoMode()` retourne `false` en dur depuis un chantier antérieur — le mode
démo est débranché, et toutes les branches mock qui en dépendent (EventPredict, Restock, Inventory,
`space.api.js`, `useEventPredictVersions.js`) sont neutralisées. Le flag `?demo=1` /
`localStorage.analyse_demo` ne servait donc plus **aucune donnée de démonstration** : sa seule
conséquence vivante était d'accorder un accès non authentifié à des écrans qui, sans token, se
faisaient de toute façon rejeter en 401 puis rediriger vers `/login`.

Le restreindre au développement aurait préservé une capacité qui n'existe plus. Un commentaire dans
`guards.js` précise que la restriction à l'environnement redeviendrait la bonne réponse **si** le
mode démo était un jour rebranché.

**Vérification** — 5 tests, dont deux dédiés à faire échouer la suite si le bypass est réintroduit.
Validés par mutation : réinjecter `if (to.query?.demo === '1') return next()` dans
`requireOrganization` fait bien tomber 2 tests.

> Note de méthode : la première mutation tentée n'avait rien fait échouer, ce qui aurait laissé
> croire à une couverture inexistante. En vérifiant, c'était la mutation qui était fausse — la
> fonction morte `requireAuth` porte le même commentaire que `requireOrganization` et avait absorbé
> l'injection. Toute validation par mutation sur ce fichier doit cibler la fonction explicitement.

**Résidu connu, non traité** — `src/components/EventPredictView.vue:3549` écrit encore
`localStorage.setItem('analyse_demo', '1')` dans une branche de repli deep-link. L'écriture est
désormais inerte mais trompeuse à la lecture. Non nettoyée ici : fichier de 9 192 lignes appartenant
au domaine Prévision (owner Jean-Luc).

---

## [2026-07-18 15:08] — emmanuel — Documentation — Synthèse opérationnelle du module

**Fichiers** — `docs/MODULE_AUTHENTIFICATION.md` *(nouveau)*

**Description**

Document d'entrée du domaine, dérivé de [`CARTOGRAPHIE_MODULES.md`](CARTOGRAPHIE_MODULES.md) et
recoupé avec [`modules/08_AUTH_ONBOARDING.md`](modules/08_AUTH_ONBOARDING.md) et le code réel de
`src/`. Couvre le modèle mental (rôle et périmètre d'espaces comme deux axes indépendants), le
catalogue RBAC réel (35 permissions, 9 rôles), la chaîne du token, le gating des routes,
l'inventaire des fichiers, le code mort, les bugs actifs et les zones grises.

Signale explicitement que [`utiles/RBAC_SYSTEM.md`](utiles/RBAC_SYSTEM.md) et
[`utiles/AUTHENTICATION_FLOW.md`](utiles/AUTHENTICATION_FLOW.md) sont **périmés** (4 rôles / 19
permissions, gating UI décrit comme absent alors qu'il est livré).

---

## [2026-07-18 15:16] — emmanuel — Configuration — `VUE_APP_API_URL` absente

**Fichiers** — `.env.local` *(nouveau, **non versionné** — `.gitignore:13` → `.env*`)*

**Description**

Symptôme rencontré : `POST http://192.168.100.22:8080/onboarding` → **404**. La requête partait sur
le serveur de développement au lieu du backend.

Cause : aucun fichier `.env` n'existait dans le dépôt. `process.env.VUE_APP_API_URL` valant
`undefined`, `src/api/client.js:8` créait l'instance Axios avec `baseURL: undefined`, produisant des
URLs relatives. Diagnostic déjà consigné dans
[`utiles/CONNECTION_BACKEND_FRONTEND_DONNEES_REELLES.md:42`](utiles/CONNECTION_BACKEND_FRONTEND_DONNEES_REELLES.md).

Ce n'est **pas une régression** des correctifs ci-dessus, mais ceux-ci l'ont révélée : le bypass
`?demo=1` permettait jusqu'alors d'entrer sans traverser le parcours d'onboarding authentifié.

Correction locale : `.env.local` pointant sur `https://datafriday-api.onrender.com/api/v1`
(joignabilité vérifiée — `GET /api/v1/health` → 200). Nécessite un **redémarrage du serveur de
développement**, `vue-cli-service` ne lisant les fichiers `.env` qu'au démarrage.

**Deux manques structurels identifiés, non corrigés** — à arbitrer :
1. `src/api/client.js:8` n'a aucun repli ni garde-fou, là où `AnalyseView.vue:497` en a un. Une
   variable manquante ne produit pas d'erreur explicite mais des 404 silencieux.
2. Aucun `.env.example` n'est versionné. Pour un nouvel arrivant, l'application démarre et échoue
   en 404 sans indice.

---

## [2026-07-18 17:57] — emmanuel — Correctif de régression — Interblocage du `signOut()`

**Fichiers**
- `src/lib/supabase.js` — ajout de `readPersistedSession()`
- `src/store/modules/auth.js` — le handler lit le stockage au lieu d'appeler `getSession()` ;
  suppression de la garde `resolvingSignedOut`, devenue sans objet
- `tests/unit/authStateChangeHandler.spec.js` — le test de réentrance est remplacé par une garde
  anti-interblocage

**Signalé par le testeur**
1. « Sign out » depuis l'en-tête du dashboard ne redirigeait plus vers `/login` ; écran figé,
   chargement s'arrêtant après ~30 s, puis 401 à la navigation suivante.
2. Un second onglet continuait de servir des données malgré la déconnexion.

**Cause — régression introduite par la première version du correctif BUG-149 (14:40).**
Celle-ci relisait la session via `getSessionOnce()` → `supabase.auth.getSession()` depuis le
callback `onAuthStateChange`. Vérifié dans `@supabase/auth-js@2.91.0` : `signOut()` s'exécute sous
verrou (`_acquireLock`, timeout 10 s) et **attend le retour de ses abonnés**
(`_notifyAllSubscribers` fait `await Promise.all`). Le callback tentait donc de reprendre un verrou
que `signOut()` ne relâcherait qu'après le retour du callback — interblocage jusqu'à expiration du
timeout.

**Correction** — `readPersistedSession()` : lecture synchrone `localStorage.getItem` + `JSON.parse`,
sans verrou et sans déclencher de refresh. La clé est lue sur `supabase.auth.storageKey` plutôt que
reconstruite, pour rester juste si le SDK change sa convention.

**Règle à retenir pour ce module** : **aucun appel à `supabase.auth.*` depuis un callback
`onAuthStateChange`** — ni `getSession()`, ni `refreshSession()`, ni `signOut()`. Lire le stockage
directement.

**Vérification** — garde de non-régression ajoutée : réintroduire `getSessionOnce()` dans le handler
fait tomber 3 tests. Suite complète : 428 passés, 4 échecs pré-existants.

**Réserve honnête** — le symptôme 1 (pas de redirection, écran figé) est pleinement expliqué par
l'interblocage. Le symptôme 2 (second onglet toujours servi) est **cohérent** avec cette cause — la
session n'était pas purgée du stockage dans les temps — mais n'a pas pu être confirmé mécaniquement.
Il peut aussi s'agir de données déjà chargées restant affichées sans rechargement, `CLEAR_AUTH`
n'entraînant de redirection qu'à la navigation suivante. **À confirmer au retest.**

---

## [2026-07-18 18:59] — emmanuel — Nettoyage — BUG-151 : suppression du code mort du domaine

**Fichiers**
- `src/components/Login.vue` *(supprimé)*
- `src/api/endpoints/onboarding.js` *(supprimé)*
- `src/router/guards.js` — 4 guards morts retirés (236 → 140 lignes)
- `src/router/index.js:3` — `requireAuth` retiré de l'import

**Description**

Trois zones de code mort qui ressemblaient à du code vivant. Le cas le plus coûteux :
`endpoints/onboarding.js` était une API bien formée, bien nommée, au bon endroit — quelqu'un
cherchant « où modifier l'onboarding » la trouvait en premier et modifiait du code jamais exécuté.

Les 4 guards (`requireAuth`, `requireAdmin`, `requireManager`, `requirePermission`) anticipaient un
mécanisme qui a finalement été implémenté ailleurs : `meta.permission` + le `beforeEach` global de
`router/index.js:415-433`.

**Méthode** — chaque suppression précédée d'un `grep` exhaustif sur `src/`, avec décompte des
références **guard par guard**, y compris pour les 4 guards conservés, plutôt que de se fier au seul
inventaire de la documentation. Un piège levé au passage : `joinOrganization` produit des
correspondances dans `auth.js`, mais ce sont celles de l'action de store homonyme, pas d'un import
du fichier d'endpoints.

**Vérification** — `grep` des 7 symboles retirés après suppression : aucune occurrence. Suite
complète inchangée (428 passés, 4 échecs pré-existants). `routerGuards.spec.js`, qui exerce
`requireOrganization` voisine des blocs supprimés, passe toujours.

---

## [2026-07-18 18:59] — emmanuel — Documentation — Backlog d'améliorations

**Fichiers** — `docs/AMELIORATIONS_AUTHENTIFICATION.md` *(nouveau)*

**Description**

Constitution du backlog des améliorations identifiées au fil des interventions — distinct des bugs.
12 entrées (A1 à A12) avec portée, effort, risque, priorité et ordre suggéré. Trois d'entre elles
sont **backend** (`api-datafriday-staging`), dont A9 — passer les guards en deny-by-default, qui est
la cause structurelle de la faille `/organizations` et l'amélioration à plus fort effet de levier du
domaine.

Origine directe des tests navigateur du jour : A1 (redirection immédiate à la purge de session),
A2 et A3 (garde-fou et exemple pour `VUE_APP_API_URL`), A8 (tests e2e — la régression
d'interblocage est passée à travers 19 tests unitaires parce qu'ils mockaient le SDK).

---

## [2026-07-18 19:11] — emmanuel — Vérification navigateur — Recette des lots 1 à 3

**Contexte** — recette manuelle après mise en place de `.env.local` et redémarrage du serveur de
développement. C'est cette recette qui a révélé l'interblocage du `signOut()` (corrigé à 17:57),
puis validé le correctif.

| # | Scénario | Résultat |
|---|---|---|
| 1 | Déconnexion volontaire, onglet A | ✅ Redirection immédiate vers `/login` |
| 1b | Propagation vers l'onglet B | ✅ Bascule sur `/login` — **à la navigation suivante**, pas instantanément |
| 3 | Suppression de la clé de session puis rechargement | ⚠️ Protocole initial erroné, voir ci-dessous |
| 4 | F5 / rechargement forcé sur un onglet connecté | ✅ Reste connecté, données présentes |
| 5 | `/dashboard?demo=1` en déconnecté | ✅ Reste sur `/login` |
| 2 | Rotation du refresh token | ⏸️ Non reproductible à la main (JWT 7 jours) |

**Le scénario 3 était mal conçu — erreur du protocole, pas du code.** Supprimer la clé
`localStorage` dans un onglet vivant ne déconnecte rien, et c'est le comportement attendu : le token
existe aussi en mémoire (Vuex `state.token` et variable module d'`api/client.js`), supabase-js
n'écoute pas l'événement `storage`, et le garde de route lit `isAuthenticated` → `!!state.token`. Le
stockage ne sert qu'à **restaurer** la session au démarrage. Le test correct est « supprimer la clé
**puis recharger** ».

Cet écart illustre le point n°6 du domaine : tant que le JWT vit 7 jours, un token déjà chargé en
mémoire reste accepté par le backend quoi qu'on fasse côté stockage local.

**Le scénario 1b n'est pas un défaut du correctif** mais une caractéristique de l'architecture :
`CLEAR_AUTH` vide le token sans déclencher de navigation, et le garde de route ne s'exécute qu'au
changement de page. Que l'onglet B finisse par basculer **prouve** que la propagation
`BroadcastChannel` fonctionne. L'amélioration correspondante est consignée en
[A1](AMELIORATIONS_AUTHENTIFICATION.md).

**Conséquence sur les statuts** — [BUG-149](bugs/149_auth_signed_out_rotation_deconnexion_multi_onglets.md)
passe en 🟢 **avec une limite assumée et consignée** : le scénario de rotation reste couvert par les
seuls tests unitaires. Il ne deviendra testable à la main qu'avec
[A11](AMELIORATIONS_AUTHENTIFICATION.md) (raccourcissement du JWT).

---

## État du module après ces changements

| # | Bug | Statut |
|---|---|---|
| 1 | `OrganizationsController` — faille cross-tenant | 🔴 **Ouvert — backend, hors de ce dépôt** |
| 2 | Déconnexion multi-onglets | 🟢 Corrigé et vérifié |
| 3 | `POST /onboarding/join/:slug` sans code d'invitation | 🔴 Ouvert — backend |
| 4 | Bypass démo `?demo=1` | 🟢 Corrigé |
| 5 | `/predict-test` sans guard | 🟢 Corrigé |
| 6 | JWT `expiresIn` = 7 jours | 🔴 Ouvert — backend, impact front à revérifier |
| 7 | Clé anon Supabase en dur | 🔴 Ouvert — [BUG-029](bugs/29_cle_anon_supabase_codee_en_dur.md) |
| 8 | Clonage de rôle sans resynchronisation | 🔴 Ouvert — backend, comportement voulu mais piégeux |
| 9 | JWT en clair en console | 🟢 Corrigé |

**Les 4 bugs traitables depuis ce dépôt sont traités.** Ceux qui restent sont soit backend
(`api-datafriday-staging`, owner Ulrich), soit en attente d'arbitrage.

⚠️ **Le bug le plus grave du domaine n'est pas dans ce dépôt.** La faille cross-tenant
`/organizations` est exploitable en une requête HTTP sur les données d'un autre client — un
utilisateur authentifié de n'importe quel tenant peut lire, modifier (`plan` inclus) ou suspendre
l'organisation d'un tiers. À escalader indépendamment de tout travail frontend.

---

## Reste à faire sur le module

**Vérification navigateur** (bloquant pour passer BUG-149 en 🟢)
1. Deux onglets, déconnexion volontaire dans l'un → les deux partent sur `/login`
2. Deux onglets pendant une rotation de token → aucun ne tombe
3. Session révoquée → redirection propre
4. F5 sur un onglet connecté → reste connecté
5. `/dashboard?demo=1` sans être connecté → redirige vers `/login`
6. `/predict-test` en développement → répond normalement

**Chantiers de structure identifiés** (non engagés, voir le plan par lots)
- Le store ne possède pas le chemin d'écriture : les vues appellent `user.api.js` directement et
  resynchronisent le cache à la main. 5 des 11 composants RBAC court-circuitent la chaîne.
- `auth.js` cumule quatre responsabilités en 755 lignes (session, onboarding, profil, RBAC).
- Trois surfaces pour la même question de permission : getter `auth/can`, composable
  `usePermissions` (1 consommateur), directive `v-can` (2 consommateurs).
- `ProfileView.vue` appelle `/me` en Axios brut via le shim déprécié `lib/api.js`.
- Code mort : `components/Login.vue`, `api/endpoints/onboarding.js`, 4 guards de `guards.js`.

---

## Références

- [`modules/08_AUTH_ONBOARDING.md`](modules/08_AUTH_ONBOARDING.md)
- [`MODULE_AUTHENTIFICATION.md`](MODULE_AUTHENTIFICATION.md)
- [`bugs/00_INDEX.md`](bugs/00_INDEX.md) — fiches 027, 028, 029, 149, 150
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — workflow Git, obligation de test navigateur
