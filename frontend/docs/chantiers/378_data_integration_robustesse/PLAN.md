# Plan — Data Integration : rendre la page robuste (sync fiable + structure)

Audit source : session 2026-08-26/27, en continuité du bilan de performance transversal. Périmètre :
`frontend/src/views/DataIntegrationView.vue` (3422 lignes) et le wizard associé
(`frontend/src/components/integration/wizard/`).

## Constat de fond

Contrairement à Analyse (problème de volume de données/calcul), le poids ici est **architectural** :
un chemin de synchronisation par défaut qui peut faire perdre des données silencieusement, du réseau
redondant, et un fichier qui grossit sans être découpé malgré une convention déjà en place juste à
côté. Rien de tout ça n'est un problème de performance pure — c'est un problème de fiabilité d'abord,
de performance ensuite.

## Todo, par ordre de priorité

### 1. 🔴 Unifier le chemin de synchronisation (le plus urgent — perte de données silencieuse)

- [ ] `DataIntegrationView.vue:1594-1600` : ne plus brancher sur le legacy synchrone quand aucune date
      n'est saisie — router systématiquement vers le job chunké (`POST /weezevent/sync/start`, déjà
      prouvé à 5802/5802 transactions, déjà le chemin utilisé par le wizard).
- [ ] Corriger BUG-139-01 au passage (le dialogue affiche `res.count` — total en base — au lieu
      d'`itemsCreated` — réellement importé cette fois — donc un rattrapage vide s'affichait comme un
      succès).
- [ ] Une fois le legacy retiré du chemin utilisateur par défaut, évaluer si `POST /weezevent/sync`
      (in-process, sans queue, backend) peut être retiré entièrement ou doit rester en filet de
      secours technique.
- [ ] Vérifier BUG-138-01 (pagination Weezevent plafonnée à 500/appel) — le job chunké en hérite-t-il
      aussi silencieusement ?

### 2. 🟠 Un seul mécanisme de suivi de progression, coordonné côté serveur

- [ ] Remplacer les 3 boucles de polling indépendantes (legacy 5s/8s `DataIntegrationView.vue`,
      `SyncProgressDialog.vue:555` 3s, `SyncJobFloatingWidget.vue:110,277` 5s) par un seul composable
      de polling partagé.
- [ ] Brancher `SyncTrackerService` (existe déjà côté backend, jamais appelé) comme vraie garde
      anti-double-exécution entre le cron `weezevent-cron.service.ts` (10 min) et un job manuel sur
      la même intégration.
- [ ] Évaluer SSE/WebSocket comme remplacement du polling une fois le mécanisme unique en place
      (hors scope immédiat, à noter pour plus tard).

### 3. 🟡 Endpoint batché pour l'historique (N+1 réseau)

- [ ] Backend : nouvel endpoint `GET /weezevent/sync/jobs?integrationIds=a,b,c` (et équivalent
      Digifood CSV history) renvoyant `{integrationId: jobs[]}` en un seul aller-retour.
- [ ] Frontend : `loadAllSyncJobs()` (`DataIntegrationView.vue:1781-1796`) et `loadAllCsvHistory()`
      (`:1807-1818`) consomment le nouvel endpoint au lieu de `Promise.allSettled(map(...))`.

### 4. 🟡 Découper le monolithe (dette déjà documentée, jamais traitée)

Le domaine a déjà la structure `components/integration/wizard/dialogs/` — répliquer le même pattern
pour `DataIntegrationView.vue` :

- [ ] Extraire le drawer de config Weezevent/Digifood → `components/integration/drawers/ConfigDrawer.vue`.
- [ ] Extraire le dialog d'import CSV Digifood → `components/integration/dialogs/CsvImportDialog.vue`.
- [ ] Extraire le dialog de suppression → `components/integration/dialogs/RemoveIntegrationDialog.vue`.
- [ ] `DataIntegrationView.vue` redevient un orchestrateur fin (liste + montage des drawers/dialogs),
      cohérent avec le reste du domaine.

### 5. 🔴 Transitions du wizard — le gain le plus rapide de tout ce plan

Un fix existe déjà pour la lenteur la plus grave, juste pas appliqué partout :

- [ ] **Lancer `backend/scripts/backfill-sales-price-agg.ts` sur les 26 intégrations clients actives**
      (seul le tenant de diagnostic l'a reçu). Ramène l'arrivée sur l'étape 3 (Menu Items) de 17-40s
      mesurées à ~1,7s. Aucun code à écrire, juste à exécuter — le plus haut rapport gain/effort de
      tout le plan.
- [ ] `StepMapMenuItems.vue:1077-1082` : le watcher `hideUnsold` recharge tout le réseau pour une
      case à cocher — filtrer `this.products` déjà en mémoire côté client à la place.
- [ ] `IntegrationWizard.vue:88-120` : remplacer `v-if`/`v-else-if` par `v-show` (ou équivalent qui
      garde les composants montés) — un aller-retour Précédent/Suivant ne doit pas redéclencher tout
      le chargement réseau d'une étape déjà visitée.
- [ ] Retirer `forceRefresh: true` par défaut sur `StepMapSpace.vue:603` et
      `StepMapShops.vue:1089,1091` — laisser jouer les caches TTL déjà fonctionnels
      (`spaces.js`/`spaceShops.js`), exposer un vrai bouton "rafraîchir" si un besoin explicite existe.
- [ ] `store/modules/spaceConfigurations.js:14-28` : ajouter un cache TTL sur le même patron que
      `spaceShops.js`/`spaceIntegrations.js` (actuellement aucun cache, rappelé jusqu'à 4 fois dans
      une seule session d'étape 2).
- [ ] `StepMapShops.vue:1143` : inclure `getSpaceFloorOptions` dans le `Promise.all` du montage
      (ligne 1087) au lieu de l'appeler en série après coup — ne dépend que de `spaceId`.
- [ ] `getWeezeventLocations` (appelé en direct depuis `aggregation.api.js`, sans store) : lui donner
      un cache court côté store, comme les autres endpoints d'étape.

## Vérification

- Aucun de ces changements ne doit modifier le comportement observable pour un import qui marche déjà
  correctement aujourd'hui — seul le chemin par défaut change de mécanisme (legacy → job chunké).
- Tester spécifiquement le cas qui a motivé BUG-139-01 : resync sans dates sur une fenêtre passée,
  vérifier que le nombre affiché correspond aux transactions réellement importées.
- `pnpm tsc`/build : jamais lancés par Claude sur ce repo (interdit par `frontend/CLAUDE.md`) —
  relecture de fichier après édition, tests réels à la charge de l'utilisateur.

## Références

- Audit complet : voir la conversation du 2026-08-26/27 (bilan perf transversal + deep-dive dédié).
- `frontend/docs/modules/05_INTEGRATIONS_VENTES.md` §154-184 ("Piège n°2"), §615-632.
- `backend/docs/bugs/139_01_resync_manuelle_fromdate_ignore.md`, `138_01_*.md`, `112_*.md`.
- `frontend/docs/bugs/337_02_stepmapmenuitems_pagination_front_ne_reduit_pas_le_fetch.md`,
  `332_02_*.md`, `333_02_*.md`, `334_02_*.md` (cascade de prix étape 3).
- `frontend/docs/bugs/00_INDEX.md` — BUG-373-02 (étape 4, déjà corrigée, référence de bonne pratique),
  BUG-320-02 (fan-out `getSpaceShops`).
