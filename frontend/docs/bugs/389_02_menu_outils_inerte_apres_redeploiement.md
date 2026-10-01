# BUG-389-02 : Menu des outils du workspace sans effet après plusieurs minutes d'inactivité

- **Statut** : 🟡 Corrigé non déployé (branche `fix/bug-389-02-menu-outils-chunk`, non commité, 2026-10-01)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Space workspace (navigation entre outils)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-10-01 (signalé comme ancien, « existe depuis longtemps »)
- **Fichiers** : `src/components/space-workspace/analyse/views/AnalyseView.vue:781`,
  `src/components/space-workspace/event-predict/views/SpacePredictView.vue:49`,
  `src/router/index.js:612`, `src/composables/useWorkspaceToolbox.js`

## Symptôme

Signalement client : dans le menu qui permet de passer d'Event Predict à Analyse, Logistic, etc., cliquer sur
un élément ne fait parfois rien. Ça se produit quand l'interface est chargée depuis plusieurs minutes et est
restée inactive. Pas de cas de reproduction fourni, pas de capture de la console.

## Cause racine

Cause probable, non reproduite : un fichier de code (chunk) obsolète après un redéploiement, dont l'échec de
chargement n'est rattrapé nulle part.

Ce qui est vérifié :

1. **Chunks obsolètes servis en HTML.** Les vues sont chargées à la demande (`router/index.js`, imports lazy).
   Après un déploiement, leurs noms hachés changent. En production, Vercel répond **200 + index.html** pour un
   chunk qui n'existe plus (vérifié le 2026-10-01 sur `/js/chunk-doesnotexist.12345678.js` et
   `/css/...css`). webpack rejette alors l'import avec une `ChunkLoadError`.
2. **Le rattrapage existant ne couvre que les routes.** `router.onError` (`router/index.js:612`) recharge la
   page une fois sur `ChunkLoadError`. Il couvre les erreurs JS (`JsonpChunkLoadingRuntimeModule`) et CSS
   (mini-css-extract-plugin 2.10 pose aussi `name = "ChunkLoadError"`, code `CSS_CHUNK_LOAD_FAILED`).
3. **Event Predict n'est pas une route.** Analyse, Predict et Event Predict partagent la route `space-analyse`
   (`?toolbox=`). Event Predict s'affiche en overlay chargé par
   `defineAsyncComponent(() => import(...EventPredictView.vue))` (`AnalyseView.vue:781`, idem
   `SpacePredictView.vue:49`), **sans `onError` ni `errorComponent`**, et l'app n'a pas
   d'`app.config.errorHandler`. Si ce chunk est obsolète, l'erreur n'atteint jamais `router.onError` :
   l'URL change, l'écran reste le même. C'est exactement « rien ne se passe ».
4. **`router.push` sans `.catch`** dans `useWorkspaceToolbox.js` : une navigation rejetée ne laisse aucune trace
   visible.

Ce qui reste une hypothèse :

- Le lien avec « plusieurs minutes d'inactivité » : l'équipe déploie souvent ; un onglet ouvert avant un
  déploiement demande les anciens chunks. Le build vue-cli précharge (`prefetch`) les chunks au démarrage, et
  Chrome garde ces préchargements environ 5 minutes avant de revalider : passé ce délai, le chunk est
  redemandé et tombe sur l'index.html. Non vérifié en conditions réelles.

Pistes écartées :

- Gardes de navigation (`router/guards.js`, `router.beforeEach`) : n'attendent `auth/initialize` que si l'auth
  n'est pas initialisée, ce qui n'est plus le cas après le premier chargement.
- Erreurs CSS non reconnues par le rattrapage : fausse piste, couvertes par `err.name` (point 2).

## Correction

À faire :

1. Extraire le rattrapage dans `src/utils/chunkReload.js` : `isChunkLoadError(err)` (nom `ChunkLoadError`,
   code `CSS_CHUNK_LOAD_FAILED`, message « Loading (CSS )?chunk ») et `reloadOnceForChunkError(target)`
   (même verrou `sessionStorage` `chunk_reload_attempted`). `router.onError` l'utilise.
2. Brancher `onError` sur les deux `defineAsyncComponent` d'Event Predict : sur une erreur de chunk,
   rechargement unique de la page vers l'URL courante (qui porte déjà `?toolbox=event-predict`).
3. `.catch` sur les `router.push` de `useWorkspaceToolbox.js` : ignorer les navigations redirigées ou
   annulées, journaliser les autres.
4. Optionnel : activer la Skew Protection de Vercel (anciens chunks servis pendant une durée donnée), ou
   faire vérifier périodiquement la version déployée pour proposer un rechargement.

## Risque de régression / à surveiller

- Boucle de rechargement : le verrou `sessionStorage` doit rester partagé entre le routeur et les composants
  asynchrones, et être levé après une navigation réussie (`router.afterEach`, déjà en place).
- Test unitaire sur `isChunkLoadError` (JS, CSS, erreur quelconque).
- Reproduction locale avant et après le fix (build lancé par Ulrich, jamais par un agent) : `pnpm build`, servir `dist` avec repli SPA, ouvrir Analyse,
  refaire un build avec une modification d'`EventPredictView.vue`, recharger seulement le serveur (pas
  l'onglet), cliquer sur Event Predict. Avant : rien ne se passe. Après : la page se recharge sur
  Event Predict.
- Si le problème revient après le fix, demander la console du navigateur au moment du clic.

## Références

- Signalement Skype du 2026-10-01 (même message que le chantier 388, répartition par PDV du réarmement).

## Mise en œuvre (2026-10-01)

Branche `fix/bug-389-02-menu-outils-chunk` : util `src/utils/chunkReload.js` (isChunkLoadError, reloadOnceForChunkError, asyncComponentWithChunkReload, safePush), branché sur router.onError, les deux `defineAsyncComponent` d'Event Predict et toutes les navigations des menus d'outils ; verrou non levé à la navigation initiale (évite une boucle si le chunk reste introuvable). Tests : chunkReload.spec.js, useWorkspaceToolbox.spec.js. Reste : reproduction réelle après un redéploiement.
