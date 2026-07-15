# Rapport détaillé — Algorithme de prédiction / scoring

> Confrontation entre le prototype Supabase KV (2024) et les docs de référence actuelles :
> `ALGORITHME_PREDICTION_NEW_RULES.md`, `ALGORITHME_PREDICTION_DEFINITIF.md`,
> `PEPITES_EXTRAITES.md` §1.1.
>
> **Fichiers lus** : `shop-performance-timeline.tsx` (427 lignes, intégral),
> `shop-performance-background.tsx` (678 lignes, intégral), `index.tsx` (lignes 260-400 et
> 7660-9050+), plus grep de contrôle sur les 12 789 lignes d'`index.tsx` et l'ensemble du
> répertoire pour confirmer l'absence totale du moteur de scoring.

## Résumé exécutif

Constat central, vérifié par grep exhaustif sur les 9 fichiers du prototype (`calculateSimilarity`,
`scorePercentage`, `visitingTeam`, `scalingFactor`, `topMatches`, `dayOfWeek`, `attendanceRatio`,
`predictedRecords`, `generatePrediction`, `scoreEvent` : **zéro occurrence** en dehors des 3 fichiers
lus) : **le prototype KV ne contient aucune trace de l'algorithme de scoring/gating/pondération**
décrit dans les 3 docs de référence. Ni gates, ni poids, ni scaling par affluence, ni répartition
minute pondérée. Le seul point de contact avec la « prédiction » est un endpoint de **sélection
manuelle** d'events passés — pas un moteur de similarité automatique.

Les fichiers `shop-performance-timeline.tsx`, `shop-performance-background.tsx` et la plage
`index.tsx:7660-9050` implémentent en réalité l'ancêtre de la page **Analyse** (agrégation de ventes
réelles passées par boutique × item × event), pas l'ancêtre du moteur de scoring d'**Event Predict**.

## 1. Correspondances confirmées

Peu de correspondances algorithmiques strictes puisque l'algorithme n'existe pas encore. Deux
correspondances structurelles/lexicales réelles :

- **Granularité shop × item × event** : `shop-performance-timeline.tsx:190-253` et
  `shop-performance-background.tsx:306-343` construisent des records
  `{elementId, menuItemId, eventId, revenue, quantity, transactionCount}` — exactement la clé
  `shopId-elementName-menuItemId` que NEW_RULES §7 et DEFINITIF §4 utilisent pour la prédiction.
  C'est la même unité d'analyse dès l'origine, mais ici appliquée à du réel passé, pas à une
  prédiction pondérée.
- **`selectedEventIds`** : `index.tsx:340,346,363,367` (`predictive-event-selection`) persiste
  `{selectedEventIds, updatedAt}` par `futureEventId`. Ce nom exact **survit** dans
  `RestockStateDto.selectedEventIds` documenté en PEPITES_EXTRAITES.md §2.3 (« events sélectionnés
  (0 ou 1 en pratique) »). Filiation lexicale directe sur 2+ générations de code, mais la sémantique
  a changé : dans le prototype c'est *le* mécanisme de sélection des comparables (100 % manuel) ;
  dans RestockState c'est un champ secondaire du réarmement.

Aucune correspondance sur les poids eux-mêmes (100/800/500/400/200), les gates, le scaling
d'affluence, la fenêtre 3h, ou la répartition minute pondérée : ces éléments n'ont pas d'équivalent,
même partiel, dans le prototype.

## 2. Divergences

- **Absence totale de scoring automatique** : `index.tsx:337-373` (`POST`/`GET
  /predictive-event-selection`) ne fait que stocker/relire une liste d'IDs choisie par
  l'utilisateur (probablement via l'UI front, non présente dans ces fichiers backend). Comparé à
  NEW_RULES §1-2 (`calculateSimilarity`, gates + score par critère) et DEFINITIF §2 (filtres durs +
  poids 100/800/500/400/200), il n'y a **aucun** calcul de score, **aucun** filtre d'éligibilité
  automatique, **aucune** pondération.
- **Aucun scaling par affluence** : DEFINITIF §2.5 / NEW_RULES §6
  (`scale = ticketsSold_future / ticketsSold_passé`) n'a pas d'équivalent — le prototype n'a même
  pas de concept de `ticketsSold` dans ces routes.
- **Aucune répartition minute pondérée** : `shop-performance-timeline.tsx` et
  `shop-performance-background.tsx` agrègent des timelines de **ventes réelles passées**
  (`event-timeline:{eventId}`), jamais de courbe *prédite*. Pas de `shareProfile`, pas d'alignement
  `timeOffset`, pas de normalisation Σ=1 (DEFINITIF §5.1, NEW_RULES §11).
- **Pas de fallback déterministe/aléatoire à comparer** : comme il n'y a pas de scoring, il n'y a pas
  non plus de fallback low-confidence (ni `Math.random()` ni tri déterministe) — le point §8-B de
  DEFINITIF (bug `Math.random()` à corriger) concerne donc une étape du pipeline qui a été
  **ajoutée après** ce prototype, pas régressée depuis.

Interprétation : ce n'est pas un « ancien barème abandonné » au sens de NEW_RULES §15 (qui décrit un
algo automatique antérieur avec split 70/30 et repli aléatoire) — c'est un stade **antérieur à
l'existence même d'un algorithme automatique**. Le split 70/30 mentionné comme « avant » dans
NEW_RULES §15 est donc une étape intermédiaire entre ce prototype KV et la version « New Rules »
actuelle, pas documentée par ces fichiers.

## 3. Pépites nouvelles

- **UX de sélection manuelle comme brique fondatrice** : le fait que le tout premier prototype
  (`index.tsx:337-373`) ait fait reposer la « prédiction » sur un choix humain des events
  comparables (`selectedEventIds`) plutôt que sur un score automatique dès le départ est une donnée
  de conception oubliée : le scoring automatique a été ajouté *en remplacement* d'un geste
  utilisateur, jamais documenté comme un choix produit délibéré dans les 3 docs actuels. Pourrait
  expliquer pourquoi RestockState (PEPITES §2.3) a gardé un champ `selectedEventIds` distinct de la
  logique de scoring — c'est un vestige direct de cette UX d'origine, pas une redondance
  accidentelle.
- **Garde-fou « future event ne doit jamais avoir de ventes »** : `index.tsx:8474-8484` et
  `8803-8819` (`finalize-shop-performance`) détectent et **purgent** explicitement les données de
  vente stale trouvées sur des events futurs (`isFuture && eventPerf.aggregations` → skip + log
  `⚠️ SKIPPING future event with stale data`). C'est une règle défensive de cohérence temporelle
  (un event futur ne peut pas avoir de vraies ventes) qui n'apparaît dans aucun des 3 docs actuels —
  pourtant elle recoupe directement le concept de gate temporel implicite utilisé par l'algorithme
  de prédiction (ne comparer qu'à des events *passés*). Vaut la peine d'être vérifiée côté NestJS :
  le filtre passé/futur est-il aussi explicite et journalisé qu'ici ?
- **Résolution de nom d'élément « le plus frais gagne »** : `index.tsx:8300-8378` — en cas de
  conflit entre le nom sauvegardé dans `shop-element-mapping` et le nom courant lu depuis la config
  active du 3D builder (`config.data.fbElementsRegistry`), le code préfère **toujours** le nom
  courant du builder, avec un log explicite du remplacement. C'est le même problème de fond que
  celui documenté dans `project_builder_floor_id_desync` (ids/floor dupliqués) et
  `project_floor_dialog_rework` côté mémoire — la règle de résolution « config live > mapping
  figé » était déjà appliquée ici en 2024, bien avant que le problème ne soit re-découvert et
  re-documenté côté NestJS.
- **Fallback `'unmapped'` / `'Uncategorized'`** : `shop-performance-timeline.tsx:195-196,132-133` —
  un item de timeline sans `mappedMenuItemId` devient `'unmapped'`, et un menu item sans
  type/catégorie devient `'Uncategorized'`, jamais une exclusion silencieuse de la ligne. Cette
  philosophie (« ne jamais jeter une ligne pour donnée manquante, la marquer ») est exactement celle
  documentée pour la version actuelle en PEPITES §1.5 (« Unidentified transaction item » = 100 % du
  donut) — la lignée du principe remonte donc jusqu'au tout premier prototype, ce qui confirme que
  c'est un choix de conception constant et non un bug isolé du système actuel.

## 4. Mort / hors-sujet

- **Toute la couche KV Supabase** : `kv.get/set/getByPrefix/getByPrefixWithKeys/mget/mdel`, clés
  `space:`, `event:`, `event-timeline:`, `shop-mappings:`, `menu-mappings:`, `menu-item:`, `type:`,
  `category:`, `shop-performance-cache:`, `shop-granular-records:`, `shop-perf-event:`,
  `shop-perf-job:` — remplacé intégralement par le modèle Prisma/Postgres actuel.
- **Le système de background job/checkpoint** (`shop-performance-background.tsx` en entier, 678
  lignes) — existe uniquement pour contourner la limite de 150s d'exécution des Supabase Edge
  Functions (`MAX_RUNTIME_MS = 120000`, ligne 132, et toute la logique de reprise par checkpoint
  `lastProcessedEventIndex`/`aggregationEventIndex`). Sans objet sur un backend NestJS
  long-running.
- **Chunking KV** (`index.tsx:8674-8705`, `RECORD_CHUNK_SIZE = 2000`) — contournement de limite de
  taille de ligne KV Supabase, sans équivalent utile en Postgres.
- **Endpoints dupliqués/obsolètes en cascade** : `/compute-shop-performance` (calcul depuis
  `menu-revenue-calculation`, `index.tsx:7666-7946`) supplanté par
  `/compute-shop-performance-from-timeline` (PHASE 2C) lui-même remplacé par
  `/process-event-shop-performance` + `/finalize-shop-performance` (event-by-event) — trois
  générations d'implémentation de la même fonctionnalité cohabitant dans le même fichier.
- **Debug hardcodé « 🍺 Budweiser tracking »** (`index.tsx:8077-8093, 8143-8167`) filtré sur le nom
  d'event `"entourloop"` — hack de debug ponctuel, aucune valeur métier.
- **Logs de diagnostic de date avec valeur codée en dur** (`index.tsx:8286` :
  `Expected Today: 2024-12-16`) — confirme que ce prototype date de décembre 2024, cohérent avec
  l'hypothèse « toute première version ».
- **`GET/PUT /kv/:key`** (`index.tsx:8952-9007`) — passthrough KV générique, pure dette
  d'architecture Supabase.
- **Endpoint de migration désactivé** (`index.tsx:9037+`, commenté, marqué DEPRECATED) — mort et
  déjà signalé comme tel dans le code source lui-même.
- **`cache-diagnostic/:spaceId`** (`index.tsx:8845-8948`) — outil de debug opérationnel de l'époque
  KV, sans valeur de portage.
