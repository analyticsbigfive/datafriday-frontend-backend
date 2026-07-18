# Améliorations à faire — Module Authentification

> Backlog des améliorations identifiées sur le domaine **Auth & onboarding / RBAC**, constituées au
> fil des interventions. Ce ne sont **pas des bugs** (ceux-ci vivent dans [`bugs/`](bugs/00_INDEX.md))
> mais des chantiers d'amélioration : comportement perfectible, dette de structure, garde-fous
> manquants.
>
> **Rien ici n'est engagé.** Chaque entrée porte son effort estimé, son risque, et ce qui la
> justifie. À arbitrer avant de coder.
>
> Voir aussi : [`JOURNAL_AUTHENTIFICATION.md`](JOURNAL_AUTHENTIFICATION.md) (ce qui a été fait),
> [`MODULE_AUTHENTIFICATION.md`](MODULE_AUTHENTIFICATION.md) (état du module),
> [`modules/08_AUTH_ONBOARDING.md`](modules/08_AUTH_ONBOARDING.md) (source de vérité).

---

## Vue d'ensemble

| # | Amélioration | Portée | Effort | Risque | Priorité |
|---|---|---|---|---|---|
| A1 | Redirection immédiate à la purge de session | Front | S | 🟠 | Haute |
| A2 | Garde-fou sur `VUE_APP_API_URL` manquante | Front | S | 🟢 | Haute |
| A3 | `.env.example` versionné | Front | S | 🟢 | Haute |
| A4 | Le store reprend le chemin d'écriture | Front | M×3 | 🟠 | Haute |
| A5 | Une seule surface RBAC | Front | S | 🟢 | Moyenne |
| A6 | `ProfileView` hors appels Axios bruts | Front | S | 🟢 | Moyenne |
| A7 | Découpe de `auth.js` | Front | L | 🔴 | Moyenne |
| A8 | Tests e2e du parcours d'authentification | Front | M | 🟢 | Moyenne |
| A9 | Guards backend en deny-by-default | **Backend** | M | 🟠 | **Haute** |
| A10 | Brancher `AuditService` | **Backend** | M | 🟢 | Haute |
| A11 | Raccourcir la durée de vie du JWT | **Backend** + front | S | 🟠 | Moyenne |
| A12 | Nettoyer l'écriture résiduelle de `analyse_demo` | Front (Prévision) | S | 🟢 | Basse |

---

## A1 — Redirection immédiate à la purge de session

**Constat** (vérifié au navigateur le 2026-07-18) : quand un onglet est déconnecté — par lui-même ou
par la propagation `BroadcastChannel` depuis un autre onglet — `CLEAR_AUTH` vide bien le token, mais
**ne déclenche aucune navigation**. Le garde de route ne s'exécutant qu'au changement de page,
l'onglet continue d'afficher les données déjà rendues jusqu'au prochain clic.

**Pourquoi ça vaut le coup** : sur un produit multi-tenant, un écran qui continue d'afficher des
données après déconnexion est trompeur — l'utilisateur croit sa session active, et un poste laissé
ouvert expose de l'information qu'il n'aurait plus le droit de voir.

**Piste** : un watcher sur `auth/isAuthenticated` qui pousse vers `/login` dès que l'état passe à
faux, monté une seule fois au niveau du shell applicatif.

**Réserve, à traiter avant de coder** — c'est un comportement **global** : un faux positif
renverrait un utilisateur en plein travail sur la page de connexion, en lui faisant perdre sa
saisie. À n'engager qu'avec une garde solide sur la distinction « purge réelle » vs « état
transitoire au démarrage », et à tester sur les parcours longs (wizards, formulaires de création).

Effort **S** · Risque **🟠** · À ouvrir en fiche dédiée, pas en élargissant BUG-149.

---

## A2 — Garde-fou sur `VUE_APP_API_URL` manquante

**Constat** : `src/api/client.js:8` fait `baseURL = process.env.VUE_APP_API_URL` sans repli ni
vérification. Variable absente → `baseURL: undefined` → toutes les requêtes partent en URL relative
sur le serveur de développement → **404 silencieux**, sans le moindre indice sur la cause.

Rencontré en conditions réelles le 2026-07-18 : `POST http://192.168.100.22:8080/onboarding` → 404.
Le diagnostic a demandé une investigation, alors que le symptôme aurait pu être auto-explicatif.

À noter : `AnalyseView.vue:497` a un repli (`|| 'http://localhost:3000/api/v1'`), `client.js` non —
l'incohérence rend le problème encore moins lisible.

**Piste** : lever une erreur explicite au chargement du module si la variable est absente, plutôt
qu'un repli silencieux — un repli masquerait la mauvaise configuration au lieu de la signaler.

Effort **S** · Risque **🟢**

---

## A3 — `.env.example` versionné

**Constat** : aucun fichier d'exemple n'est versionné (`.env*` est gitignoré dans son ensemble). La
variable n'est documentée que dans [`utiles/CONNECTION_BACKEND_FRONTEND_DONNEES_REELLES.md`](utiles/CONNECTION_BACKEND_FRONTEND_DONNEES_REELLES.md),
un dossier que la documentation elle-même classe comme corpus historique.

Conséquence : pour un nouvel arrivant, l'application démarre normalement et échoue en 404 sans
indice. Complémentaire de A2 — l'un signale l'erreur, l'autre l'évite.

Effort **S** · Risque **🟢**

---

## A4 — Le store reprend le chemin d'écriture

**Constat** : les stores `users`/`roles`/`permissions` n'importent **qu'une fonction chacun**
(`getUsers`/`getRoles`/`getPermissions`). Les 9 autres fonctions de `user.api.js` sont appelées
**directement par les vues**, qui commitent ensuite `ADD_USER`/`UPDATE_USER` à la main pour
resynchroniser le cache.

Le store est donc traité comme un cache passif que la vue tient à jour, au lieu d'être le
propriétaire du chemin d'écriture. C'est la cause structurelle du fait que **5 des 11 composants
RBAC court-circuitent la chaîne** `composant → store → endpoint`.

**Pourquoi c'est le chantier principal** : tant que le découpage est celui-là, chaque nouvel écran
reproduira mécaniquement le court-circuit. C'est aussi ce qui rend le domaine testable — une action
de store se teste, un `methods` de `.vue` beaucoup moins.

**Découpage** : trois PR — `users` d'abord (5 composants, pose le patron), puis `roles`, puis
`permissions` qui deviennent mécaniques.

Effort **M×3** · Risque **🟠**

---

## A5 — Une seule surface RBAC

**Constat** : trois façons de poser la même question de permission.

| Surface | Fichier | Consommateurs |
|---|---|---|
| Getter `auth/can` | `store/modules/auth.js:58` | Le `beforeEach` global, `DashboardView.vue` |
| Composable `usePermissions` | `composables/usePermissions.js` (21 l.) | **1** : `MainNav.vue` |
| Directive `v-can` | `plugins/permissions.js` (20 l.) | **2** : `RoleListView`, `PermissionListView` |

Ce n'est pas une abstraction à trois niveaux, c'est une hésitation figée dans le code.

**Piste proposée** : garder le getter comme source, exposer `usePermissions` comme façade
Composition API, supprimer la directive. **À valider** — la directive est plus lisible en template,
c'est un choix d'ergonomie autant que de structure.

Effort **S** · Risque **🟢**

---

## A6 — `ProfileView` hors appels Axios bruts

**Constat** : `components/user/views/ProfileView.vue` appelle `api.get('/me')` et `api.patch('/me')`
en Axios brut, via le shim déprécié `lib/api.js` — ni endpoint, ni store, ni composable.

**Piste** : créer `api/endpoints/me.api.js`, y router ces appels, puis basculer `auth.js` sur
`@/api/client` et supprimer `lib/api.js` (ses deux seuls importeurs sont `auth.js` et `ProfileView`).

Effort **S** · Risque **🟢**

---

## A7 — Découpe de `auth.js`

**Constat** : 755 lignes cumulant quatre responsabilités — session Supabase, appels d'onboarding,
CRUD de profil, état RBAC. C'est un `analyse.js` en miniature, et l'audit du store pose qu'un module
dépassant 300-400 lignes est un signal à discuter.

**À faire en dernier** : c'est le fichier dont dépendent 15 composants en `mapGetters`/`mapActions`,
et l'unique point d'entrée de l'authentification. À engager une fois A4 à A6 faits, quand la
couverture de test aura grandi.

Effort **L** · Risque **🔴**

---

## A8 — Tests e2e du parcours d'authentification

**Constat** : `tests/e2e/` contient 25 lignes de specs réelles pour tout le projet. Le domaine auth
n'a **aucun** test e2e.

L'intérêt est démontré par l'expérience du 2026-07-18 : la régression d'interblocage du `signOut()`
est passée à travers 19 tests unitaires, parce que ceux-ci mockaient le SDK Supabase et ne pouvaient
donc pas révéler qu'un appel était interdit depuis un callback. **Seul un test qui exerce le vrai
SDK l'aurait attrapé.**

**Périmètre minimal utile** : connexion, déconnexion, redirection d'un utilisateur non authentifié,
et le comportement multi-onglets.

Effort **M** · Risque **🟢**

---

## A9 — Guards backend en deny-by-default ⚠️ **Backend**

**Constat** : `RolesGuard` et `PermissionsGuard` sont globaux mais **permissifs par défaut** — un
handler sans `@RequirePermissions(...)` est accessible à tout utilisateur authentifié ayant un
tenant résolu.

**C'est la cause structurelle de la faille `/organizations`** (bug n°1 du domaine, 🔴 critique,
toujours ouvert) : aucun décorateur posé = aucune restriction. Tant que le défaut est permissif, la
prochaine route oubliée rouvrira exactement le même trou.

Inverser le défaut — permission explicite requise, `@Public()` explicite pour ouvrir — transforme une
faille silencieuse en erreur détectable.

**C'est l'amélioration à plus fort effet de levier du domaine**, mais elle est dans
`api-datafriday-staging` (owner Ulrich) et demande un audit de toutes les routes existantes.

Effort **M** · Risque **🟠** · **Hors de ce dépôt**

---

## A10 — Brancher `AuditService` ⚠️ **Backend**

**Constat** : le modèle Prisma `AuditLog` et le service `AuditService` sont complets et
fonctionnels, et **ne sont appelés nulle part dans tout le backend**. Aucune action sensible —
changement de rôle, suppression d'utilisateur, suspension de tenant, octroi d'accès espace — n'est
tracée de façon requêtable ; tout passe par des `Logger.log()` applicatifs.

Pour un produit multi-tenant, c'est une lacune de conformité autant que de diagnostic.

Effort **M** · Risque **🟢** · **Hors de ce dépôt**

---

## A11 — Raccourcir la durée de vie du JWT ⚠️ **Backend + front**

**Constat** : `expiresIn` = **7 jours**. Une révocation de droits met donc jusqu'à 7 jours à expirer
le token lui-même. L'invalidation du cache d'auth (Redis pub/sub) mitige côté permissions, mais le
JWT reste valide en signature.

Vérifié au navigateur le 2026-07-18 : un token déjà chargé en mémoire continue d'être accepté par le
backend quoi qu'on fasse côté stockage local.

**Attention à l'effet de bord côté front** : raccourcir le JWT fait passer la rotation du refresh
token d'exceptionnelle à routinière. Le correctif de [BUG-149](bugs/149_auth_signed_out_rotation_deconnexion_multi_onglets.md)
sera alors **bien plus sollicité** — à revérifier au moment de ce changement, et c'est aussi ce qui
rendrait enfin le scénario de rotation testable à la main.

Effort **S** (le changement) · Risque **🟠** (l'effet de bord) · **Coordination front/back requise**

---

## A12 — Nettoyer l'écriture résiduelle de `analyse_demo`

**Constat** : `components/EventPredictView.vue:3549` fait encore
`localStorage.setItem('analyse_demo', '1')` dans une branche de repli deep-link. L'écriture est
**inerte** depuis la suppression du bypass ([BUG-027](bugs/27_bypass_demo_actif_sans_distinction_env.md))
et le débranchement du mode démo, mais elle reste trompeuse à la lecture.

Non traité avec BUG-027 : le fichier fait 9 192 lignes et appartient au domaine Prévision (owner
Jean-Luc). À joindre à un lot dédié à ce domaine plutôt qu'à toucher isolément.

Effort **S** · Risque **🟢** · **Hors du périmètre auth**

---

## Ordre suggéré

1. **A9** — c'est le seul qui ferme structurellement une faille critique. Backend, à escalader.
2. **A2 + A3** — deux petits correctifs qui évitent de reperdre une heure sur un 404 muet.
3. **A4** — le chantier de structure qui conditionne tout le reste.
4. **A1** — une fois A4 fait, le shell est plus sain pour y poser un watcher global.
5. **A5, A6** — mécaniques une fois le patron d'A4 posé.
6. **A8** — dès qu'il y a un parcours stable à exercer.
7. **A7** — en dernier, quand la couverture le permet.

A10, A11 et A12 dépendent d'autres personnes ou d'autres domaines : à planifier avec leurs owners.
