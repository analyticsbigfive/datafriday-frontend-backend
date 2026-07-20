# BUG-190 — Déconnexion intempestive multi-onglets sur rotation du refresh token

- **Statut** : 🟢 Corrigé (2026-07-18) — vérifié au navigateur, **avec une limite assumée** : le
  scénario de rotation du refresh token n'est pas reproductible à la main tant que le JWT vit 7
  jours. Il reste couvert par les tests unitaires uniquement (voir "Risque de régression")
- **Sévérité** : 🟠 Majeur
- **Domaine** : Auth & onboarding
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15 (documenté dans `docs/modules/08_AUTH_ONBOARDING.md`, bug actif n°2)
- **Fichiers** : `src/store/modules/auth.js:570-599` (avant correction), `src/utils/authSessionEvent.js` (nouveau)

## Symptôme

Un utilisateur travaillant avec l'application ouverte dans **plusieurs onglets** est déconnecté sans
l'avoir demandé. Le symptôme n'est pas immédiat : l'onglet paraît normal, puis au premier
déclencheur — une navigation, ou un clic sur « Enregistrer » — l'utilisateur est renvoyé sur
`/login` et perd la saisie en cours.

Vécu rapporté : *« j'étais en train de remplir un formulaire, je clique sur Enregistrer, je me
retrouve sur la page de login. »*

Le décalage vient de ce que `CLEAR_AUTH` ne redirige pas seul : il vide le token, et la redirection
n'intervient qu'au prochain `beforeEach` de route ou au premier 401 intercepté par
`api/client.js`.

## Cause racine

`store/modules/auth.js:570` — le handler `onAuthStateChange` ignorait délibérément le type
d'événement (`_event`, préfixé pour marquer le non-usage) et ne branchait que sur `session`
truthy/falsy :

```js
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session) { /* ... */ } else {
    commit('CLEAR_AUTH')
    setAccessToken(null)
  }
})
```

Or le refresh token Supabase est **à usage unique**. Quand plusieurs onglets sont ouverts, un seul
gagne la course au renouvellement ; l'onglet perdant voit sa tentative rejetée et Supabase y émet un
`SIGNED_OUT` **avec une session nulle** — alors que la session persistée dans le stockage vient
d'être renouvelée par l'onglet gagnant et reste parfaitement valide.

Le handler traitait donc cet artefact exactement comme une déconnexion volontaire.

**Le piège de ce bug** : la correction naïve — ignorer les `SIGNED_OUT` relayés — casse un
comportement voulu. Supabase diffuse volontairement la déconnexion entre onglets, et se déconnecter
dans un onglet *doit* déconnecter les autres. Il fallait distinguer les deux cas, pas supprimer
l'un.

### Deux défauts adjacents corrigés dans la foulée

1. **Aucune garde de réentrance.** `getSessionOnce()` ne se contente pas de lire le stockage : si le
   token est expiré, `supabase.auth.getSession()` tente un refresh, lequel ré-émet un événement
   d'auth. Résoudre un `SIGNED_OUT` en relisant la session pouvait donc se rappeler en boucle.
2. **La souscription n'était jamais libérée.** `onAuthStateChange` retourne une souscription, qui
   était jetée. Or `initialize` est dispatché par le `beforeEach` global **et** explicitement par
   `AuthCallbackView.vue` : si le premier appel échouait avant `SET_INITIALIZED` (ligne 601, après
   des `await` réseau qui peuvent lever), le second empilait un **second listener** — donc deux
   `CLEAR_AUTH` sur le même événement, amplifiant précisément le symptôme corrigé ici.

## Correction

Branche `fix/currentBug-fixAuthentification`.

**1. Extraction de la décision dans une fonction pure** — `src/utils/authSessionEvent.js` :

```js
resolveAuthStateChange({ event, session, storedSession, explicitlyLoggedOut, now })
  → 'apply' | 'ignore' | 'clear'
```

L'ordre des tests est significatif :

| Ordre | Condition | Verdict | Cas couvert |
|---|---|---|---|
| 1 | `session` présente | `apply` | Connexion, refresh réussi, MAJ user |
| 2 | `explicitlyLoggedOut` | `clear` | Déconnexion volontaire **depuis cet onglet** |
| 3 | `event !== 'SIGNED_OUT'` | `clear` | `INITIAL_SESSION` sans session — état vide légitime |
| 4 | session persistée encore valide | `ignore` | **L'artefact de rotation** |
| 5 | sinon | `clear` | Déconnexion relayée, session expirée |

Le test 2 précède délibérément la relecture du stockage : `signOut()` appelle `clearAccessToken()`
**avant** `supabase.auth.signOut()` (`auth.js:264`), donc le drapeau est déjà levé quand
l'événement arrive. Sans cet ordre, une déconnexion volontaire pourrait lire l'ancienne session,
la juger valide et ne jamais déconnecter.

**2. Lecteur du drapeau** — `isExplicitlyLoggedOut()` exporté depuis `api/client.js`. Le drapeau
`_explicitlyLoggedOut` existait déjà (posé par `clearAccessToken()`), il n'était simplement pas
lisible de l'extérieur. Aucun nouveau mécanisme d'état introduit.

**3. Handler** — `auth.js` relit la session persistée sur événement sans session, applique le
verdict, et sur `ignore` resynchronise le token depuis la session valide plutôt que de purger.
Garde de réentrance `resolvingSignedOut` autour de la relecture.

**4. Souscription conservée** dans `authSubscription` et libérée avant tout ré-enregistrement.

**5.** Suppression du `console.log('TOKEN au moment du post:', getters.token)` (`auth.js:351`) qui
imprimait le JWT en clair dans la console — voir [[191_auth_console_log_jwt_en_clair]].

## ⚠️ Régression introduite par la première version du correctif (2026-07-18)

La première version relisait la session via `getSessionOnce()` → `supabase.auth.getSession()`.
**C'était faux, et ça a cassé la déconnexion.** Symptômes remontés par le testeur :

1. « Sign out » depuis l'en-tête du dashboard ne redirigeait plus vers `/login` ; l'écran restait
   figé, un chargement s'arrêtait au bout de ~30 s, puis 401 à la navigation suivante.
2. Un second onglet continuait de servir des données alors que l'utilisateur s'était déconnecté.

**Cause** — vérifiée dans le code de `@supabase/auth-js@2.91.0` :

- `signOut()` s'exécute **sous verrou** : `_acquireLock(lockAcquireTimeout, …)`, timeout **10 s**.
- À l'intérieur de ce verrou, il notifie ses abonnés et **attend leur retour** :
  `_notifyAllSubscribers()` fait `await Promise.all(promises)`.
- Notre callback appelait `getSession()`, qui tente d'acquérir **le même verrou**.

→ Interblocage : le callback attend un verrou que `signOut()` ne relâchera qu'une fois le callback
terminé. Il faut attendre l'expiration du timeout pour que la chaîne se débloque — d'où l'écran
figé, la redirection qui n'arrive pas, et la purge de session qui n'aboutit pas dans les temps.

**Correction** — lecture **synchrone et sans verrou** du stockage, via `readPersistedSession()`
(`src/lib/supabase.js`) : `localStorage.getItem(storageKey)` + `JSON.parse`, la clé étant lue sur
l'instance `supabase.auth.storageKey` plutôt que reconstruite. Aucun verrou, aucun refresh
déclenché — ce qui a rendu la garde de réentrance `resolvingSignedOut` sans objet ; elle a été
retirée.

**Ce que cette régression apprend sur le domaine** — deux faits vérifiés dans le SDK, à ne pas
réapprendre à ses dépens :

| Fait | Conséquence |
|---|---|
| La synchronisation multi-onglets passe par **`BroadcastChannel`**, pas par l'événement `storage` (`addEventListener('storage')` est absent du SDK) | Un onglet reçoit bien `SIGNED_OUT` d'un autre onglet — la propagation existe |
| Les callbacks `onAuthStateChange` sont **attendus** sous le verrou d'auth | **Aucun appel à l'API `supabase.auth.*` depuis un callback** : ni `getSession()`, ni `refreshSession()`, ni `signOut()`. Lire le stockage directement |

## Risque de régression / à surveiller

**Tests ajoutés** — 19 cas, premiers tests du domaine auth qui n'en avait aucun :

- `tests/unit/authSessionEvent.spec.js` (11) — la **décision** : déconnexion locale, déconnexion
  relayée, artefact de rotation, session morte, bornes de validité d'échéance.
- `tests/unit/authStateChangeHandler.spec.js` (8) — le **câblage** : le handler applique bien le
  verdict (resync vs purge), **n'appelle jamais `getSession()`** (garde anti-interblocage), la
  souscription précédente est libérée, le chemin nominal ne relit pas le stockage inutilement.

**Vérifiés par mutation** (un test qui ne peut pas échouer ne prouve rien) : réintroduire
`getSessionOnce()` dans le handler fait tomber 3 tests ; inverser l'ordre `explicitlyLoggedOut` /
session persistée dans la fonction pure en fait tomber 2. La couverture est donc réelle, pas
décorative.

**Suite complète** : 3 suites en échec (`apiOrMock`, `eventDetailsEditor`, `spaceMenusInventory`)
— vérifié **pré-existant et sans rapport** (transformation ESM d'axios sous Jest), identique avant
et après la correction.

**À vérifier au navigateur** :

| # | Manipulation | Attendu |
|---|---|---|
| 1 | Deux onglets, déconnexion volontaire dans A | **Les deux** partent sur `/login` — comportement voulu à préserver |
| 2 | Deux onglets ouverts pendant une rotation de token, puis action dans chacun | **Aucun ne tombe**, les deux actions passent |
| 3 | Session réellement expirée / révoquée | Redirection propre sur `/login` |
| 4 | Rechargement (F5) d'un onglet connecté | Reste connecté, pas de flash `/login` |
| 5 | Onglet unique, navigation normale | Inchangé |

⚠️ **Le scénario 2 n'est pas reproductible à la demande** : la rotation survient près de
l'expiration du JWT, soit 7 jours aujourd'hui (`auth.module.ts:18` côté backend). Trois voies pour
le forcer — baisser l'expiration à 60 s dans le dashboard Supabase le temps du test ; ou exposer
temporairement le client Supabase en dev et appeler `await supabase.auth.refreshSession()` depuis
l'onglet A, ce qui consomme le refresh token et périme la session de B ; ou instrumenter le handler
pour logger le type d'événement et observer sur une session longue en staging.

C'est précisément parce que ce scénario est difficile à reproduire manuellement que la garantie
repose sur les tests unitaires de la fonction pure, et non sur le navigateur seul.

**Points de vigilance ultérieurs** :
- Ne pas remettre `_event` en paramètre ignoré dans le handler — c'est la régression exacte.
- Le raccourcissement du JWT (7 j → ~1 h, bug n°6 du domaine) fera passer la rotation
  d'exceptionnelle à routinière : ce correctif devra être revérifié à ce moment-là, il sera bien
  plus sollicité.

## Références

- [`../modules/08_AUTH_ONBOARDING.md`](../modules/08_AUTH_ONBOARDING.md) — bug actif n°2, contexte
  complet du domaine
- [`../MODULE_AUTHENTIFICATION.md`](../MODULE_AUTHENTIFICATION.md) — synthèse opérationnelle
- [[191_auth_console_log_jwt_en_clair]] — corrigé dans la même PR
- `src/utils/authSessionEvent.js`, `tests/unit/authSessionEvent.spec.js`
