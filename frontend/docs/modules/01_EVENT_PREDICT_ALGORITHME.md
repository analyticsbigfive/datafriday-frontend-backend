# Prévision (Event Predict) — Algorithme & architecture

> Domaine cartographié : **Prévision (Event Predict)**. Owner produit : Jean-Luc.
> Écrans : `/spaces/:spaceId/predict` (route réelle, gate RBAC `front.fb.eventPredict`) ;
> `/predict-test` (banc de test, **sans authentification**, données mock).
>
> Vérifié exhaustivement le 2026-07-15 : chaque modèle Prisma, chaque route backend, chaque
> composable, chaque client API et chaque écran de ce domaine a été localisé et lu directement
> (fichier réel, pas un rapport tiers recopié). Objectif : qu'un dev ou un agent IA qui doit
> corriger un bug ici sache exactement où regarder et ce qu'il risque de casser ailleurs, sans
> relire tout le code.
>
> Doc de référence du barème (fait foi pour les RÈGLES métier, ce présent fichier fait foi pour
> l'ARCHITECTURE/l'emplacement du code) :
> [`docs/utiles/ALGORITHME_PREDICTION_NEW_RULES.md`](../utiles/ALGORITHME_PREDICTION_NEW_RULES.md).
> Chaque règle qu'il énonce a été re-vérifiée ligne à ligne dans le code Vue réel pour cette passe
> (voir §"Conformité au barème").
>
> **Validé le 2026-07-15 par une relecture indépendante** (5 agents séparés, un par grande section,
> relisant directement le code réel sans se fier au texte de ce fichier) : ~60 groupes d'affirmations
> vérifiés (modèles/routes backend, couche API front, moteur de scoring, composable minute-level,
> `EventPredictView.vue`+sections enfants, bugs actifs, code mort) — **0 erreur factuelle ou
> comportementale trouvée**, seulement 2-3 dérives de numéro de ligne de ±1 à 3 lignes sans impact.

---

## Vue d'ensemble — comment les pièces s'emboîtent

```
Event (calendrier)                                EventPredictVersion (scénario persisté)
  eventTypeId/eventCategoryId/eventSubcategoryId      eventId, spaceId, menuConfig,
  → EventType/EventCategory/EventSubcategory          quantityAdjustments, manualQuantities,
  visitingTeamId → Team (visitingTeamName = repli)     predictedRecords, selectedPredictionEventIds,
  ticketsSold / ticketsScanned                        totalRevenue/adjustedTotalRevenue, isDefault
  sessions: String (JSON sérialisé, PAS un Json Prisma)
       │
       │ parsé UNE FOIS par EventPredictView.normalizeEvent()/parseSessions()
       │ avant d'entrer dans le moteur (sinon sessions[0].showTime lit un
       │ caractère d'une string et vaut toujours undefined)
       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ MOTEUR DE SCORING — src/utils/predictiveAnalytics.js (100% frontend,      │
│ le backend ne fait QUE persister Event et EventPredictVersion, aucun      │
│ calcul de scoring/pondération côté NestJS)                                │
│ calculateSimilarity / findAndScorePastEvents / generatePredictionsForEvent│
│ Barème NEW RULES : gates (type/config/catégorie/affluence/horaire) +     │
│ poids purs score/Σscore (PAS de split 70/30), PAS de Math.random         │
└───────────────────────────────────────────────────────────────────────────┘
       │ partagé par 3 domaines indépendants (voir "Piège architectural" §1)
       ├──▶ usePredictiveTimeline.js  (minute-level, seul consommateur : EventPredictView.vue)
       ├──▶ store/modules/analyse.js `regeneratePredictions` (mode "predict" de la page Analyse)
       └──▶ SpaceRestockView.vue (réarmement, appel direct ligne 2518)

EventPredictView.vue (orchestrateur, route /spaces/:spaceId/predict)
  ├─ usePredictiveTimeline()      → courbe minute + sélection top-10 / repli / manuelle
  ├─ useEventPredictVersions()    → CRUD des scénarios (REST EventPredictVersion + miroir localStorage)
  ├─ EventPredictSourcesDrawer.vue    → override manuel des events "sources" de la prédiction
  ├─ EventPredictMenusSection.vue     → "Configuration settings" (sélection items + % shop/item/cellule)
  ├─ EventPredictStockUpSection.vue   → "Stock up" (expansion recette readyForSale → besoins)
  ├─ EventPredictRowActions.vue       → kebab actions par ligne "non rattachée" au catalogue
  └─ AlgoTraceTerminal.vue (debug)    → rejoue le barème en lecture seule (findAndScorePastEventsWithTrace)
```

---

## Piège architectural n°1 : le moteur de scoring est partagé par 3 domaines, pas réservé à Event Predict

`src/utils/predictiveAnalytics.js` exporte `calculateSimilarity`, `findAndScorePastEvents`,
`generatePredictionsForEvent`, `normalizeStr`, `isAdhocEvent`. Avant de "corriger" une formule ici,
il faut savoir qui d'autre en dépend — vérifié par grep exhaustif des imports :

| Consommateur | Ce qu'il importe | Rôle |
|---|---|---|
| `src/composables/usePredictiveTimeline.js` | `findAndScorePastEvents`, `findAndScorePastEventsWithTrace` | Moteur minute-level d'**Event Predict** (le seul consommateur de ce composable, `EventPredictView.vue`). |
| `src/store/modules/analyse.js` (`regeneratePredictions`, ligne 2007) | `generatePredictionsForEvent` (import dynamique ligne 2022) | Génère les prédictions affichées par le **mode "predict" de la page Analyse** (`selectedToolbox === 'predict'`, permission `front.fb.predict` — distincte de `front.fb.eventPredict`, voir §Permissions). Alimente aussi une **rescale automatique** : si un event a une version Event Predict active/par défaut en localStorage, les records prédits sont multipliés par `factor = (adjustedTotalRevenue ?? totalRevenue) / currentRev` (`analyse.js:2094-2133`) pour que la barre "Predict" d'Analyse affiche le scénario validé, pas le brut auto. |
| `src/views/SpaceRestockView.vue` (ligne 1001 import, ligne 2518 appel) | `generatePredictionsForEvent` | Régénère les quantités prédictives du **module Réarmement** pour construire la liste d'achats, en forçant `forcedPastEventIds = version.selectedPredictionEventIds` de la version Event Predict sauvegardée. |
| `normalizeStr` seul (pas le moteur) | `useInventoryData.js`, `analyseReconciliation.js`, `stockNetting.js`, `EventPredictMenusSection.vue`, `AnalyseView.vue`, `MenuItemsByShopTable.vue`, `store/modules/analyse.js` | Réutilisent uniquement la normalisation de chaîne (trim/minuscule/sans accent), pas le scoring. |
| `src/utils/predictiveAnalyticsTimeline.js` | `findAndScorePastEvents` | **Code mort** (voir §Code mort) — importe le moteur mais n'est lui-même jamais importé. |
| `src/views/PredictTestView.vue` | `findAndScorePastEvents`, `generatePredictionsForEvent`, `calculateSimilarity`, `WEIGHTS` | Banc de test isolé (`/predict-test`), pas un vrai consommateur métier. |

**Conséquence pratique** : modifier `WEIGHTS`, une formule de gate, ou l'agrégation de
`generatePredictionsForEvent` change simultanément (1) l'écran Event Predict, (2) les barres de la
page Analyse en mode "predict", et (3) les quantités calculées par le Réarmement. Le lien
Analyse ↔ Event Predict passe par des **clés localStorage partagées en dur** (voir plus bas), pas
par un contrat de type — un renommage de clé côté `useEventPredictVersions.js` casserait
silencieusement la rescale d'Analyse sans erreur visible.

## Piège architectural n°2 : clients API — même risque que documenté pour Menu & Recettes

| Entité | Client réellement utilisé par Event Predict | Autres clients existants pour la même entité |
|---|---|---|
| `EventPredictVersion` | `src/api/endpoints/eventPredict.api.js` (seul et unique, pas d'ambiguïté) | — |
| `Event` (le calendrier) | `src/api/endpoints/event.api.js` (nommé `getEvents/createEvent/updateEvent/...`, consommé par `store/modules/events.js` ET directement par `EventPredictView.vue`) | Aucun doublon legacy trouvé pour `Event` lui-même (contrairement à MenuItem dans le domaine Menu & Recettes) — mais `event.api.js` contient aussi des fonctions **hors-scope Event Predict** et non consommées (`getEventSponsors`, `calculateEventRevenue`, `calculateUnregisteredEventRevenue`, `saveEventRevenueCalculation`, `getEventRevenueCalculation` — zéro appelant en dehors du fichier lui-même, cf. Code mort). |
| `Team` | `src/api/endpoints/team.api.js` | — mais son commentaire d'en-tête (ligne 4-8) dit *"tant que le backend n'expose pas encore `/teams`"* et dégrade silencieusement un 404 en `[]` — **ce commentaire est aujourd'hui FAUX** : `TeamsController` (`@Controller('teams')`, `events.controller.ts:172-215`) expose bien `GET/POST/PATCH/DELETE /teams` avec permission `menu.events.manage` en écriture. Le code de repli reste inoffensif (juste mort en pratique) mais le commentaire induit en erreur un futur lecteur qui croirait le catalogue d'équipes non fiable. |

**Convention d'unwrap à double piège** (`src/api/client.js:231-292`) : `export const api = {...}` (named
export) **retourne déjà `response.data`** (`extractData`, ligne 222) ; `export default apiClient`
(default export) est l'instance Axios brute et exige `.data` manuel. `eventPredict.api.js` utilise
`{ api }` (named, auto-unwrap) et le documente explicitement en commentaire (lignes 6-11 : *"il ne
faut donc PAS refaire `.data` ici"*) suite à un bug historique (double-unwrap → `undefined` →
versions vides + duplications). `team.api.js` utilise `import api from '../client'` (**default**,
donc la variable locale `api` désigne l'instance brute) et fait `.data` manuellement partout — les
deux fichiers sont internes cohérents, mais le même identifiant `api` désigne deux objets aux
contrats opposés selon la forme d'import choisie. **Si tu ajoutes un nouveau client, vérifie
laquelle des deux formes tu importes avant d'écrire `.data`.**

**KV legacy confirmé mort et doublement mort** : `utils/api.js` expose encore `setKVData`/`getKVData`
(lignes 1425-1443, commentaire : *"utilisé par Event Predict pour persister versions"*) — ce
commentaire date de l'ère Supabase Edge Function. Vérifié : (1) **zéro appelant** dans tout `src/`
en dehors de la déclaration elle-même ; (2) même si un appelant existait, le module NestJS
correspondant (`src/features/kv/kv.module.ts`, `kv.controller.ts` — le fichier existe) **n'est pas
importé dans `app.module.ts`** (grep exhaustif des imports du module racine, aucune trace de
`KvModule`) → toute route `/kv/*` retourne 404 en prod. La persistance des versions passe
entièrement par `EventPredictVersion` via `eventPredict.api.js`.

---

## Event — le calendrier des événements

**Qu'est-ce que c'est** : un événement (match, concert, salon) rattaché à un espace, avec ses
métadonnées (type/catégorie/sous-catégorie, équipe visiteuse, horaires, affluence). C'est la source
des events "passés" (comparables) et de l'event "futur" (cible) de toute prédiction.

**Où vit le code** :
- Modèle : `api-datafriday-staging/prisma/schema.prisma:2169-2229`.
- Service/contrôleur : `src/features/events/events.service.ts` / `events.controller.ts`
  (`@Controller('events')`, + `EventTypesController`/`EventCategoriesController`/
  `EventSubcategoriesController`/`TeamsController` dans le même fichier contrôleur).
- Client API front : `src/api/endpoints/event.api.js`.
- Store Vuex : `src/store/modules/events.js` (cache TTL 5 min, dédup `fetching`).
- Écrans dédiés (hors Event Predict, gestion CRUD) : `components/events/views/EventsListView.vue`,
  `EventsTypeListView.vue`, drawers `EventFormDrawer.vue`/`CsvImportDrawer.vue`.

**Toutes les routes backend** (`events.controller.ts`) :

| Route | Permission | Rôle |
|---|---|---|
| `POST /events` | `menu.events.manage` | Créer un event |
| `GET /events` | — (authentifié) | Liste paginée, filtrable `?spaceId=` |
| `GET /events/:id` | — (authentifié) | Détail |
| `PATCH /events/:id` | `menu.events.manage` | Édition partielle |
| `DELETE /events/:id` | `menu.events.manage` | Suppression |
| `GET/POST/PATCH/DELETE /event-types` | lecture libre, écriture `menu.events.manage` | Taxonomie type |
| `GET/POST/PATCH/DELETE /event-categories` | idem | Taxonomie catégorie (+ `hasHomeTeam`) |
| `GET/POST/PATCH/DELETE /event-subcategories` | idem | Taxonomie sous-catégorie |
| `GET/POST/PATCH/DELETE /teams` | lecture libre, écriture `menu.events.manage` | Catalogue équipes (409 si nom déjà pris pour la même compétition) |

**Note de sécurité factuelle** : toutes les routes `GET` de ce module (Event, taxonomie, Teams)
n'exigent que `JwtDatabaseGuard` (utilisateur authentifié du tenant) — aucun `RequirePermissions`
dessus. Seules les mutations (`POST`/`PATCH`/`DELETE`) exigent `menu.events.manage`. La restriction
d'accès à l'écran `/spaces/:spaceId/predict` lui-même est **uniquement côté frontend**
(`meta.permission: 'front.fb.eventPredict'` dans le router) — un utilisateur avec un JWT valide du
même tenant mais sans la permission front peut appeler `GET /events` directement.

**Champs clés et leur sens métier** :

| Champ | Sens |
|---|---|
| `eventTypeId`/`eventCategoryId`/`eventSubcategoryId` | FK vers la taxonomie (Sport/Football/Ligue 1). Utilisés par le moteur comme `eventType`/`category`/`subcategory` **après résolution du nom** (le moteur compare des libellés, pas des ids — voir §Moteur). |
| `homeTeamName` | Texte libre — l'équipe à domicile n'a PAS de FK catalogue (asymétrie voulue, voir plus bas). |
| `visitingTeamId` / `visitingTeamName` | FK vers `Team` + nom dénormalisé. `visitingTeamId: null` explicite désassigne (`events.service.ts:83-95`, `resolveEventTeamFields`). Le nom est **recalculé côté serveur** dès qu'une FK est posée (`team.name`), le nom envoyé par le client n'est pris en repli que sans FK. |
| `ticketsSold` / `ticketsScanned` | Affluence prévue (vendue) vs réelle (scannée aux portes). Le moteur résout `ticketsScanned ?? ticketsSold` des deux côtés (voir §Moteur) — donc `ticketsScanned` prime dès qu'il existe, y compris pour l'event **futur** (structurellement 0/absent tant que l'event n'a pas eu lieu, d'où le repli sur `ticketsSold`). |
| `sessions` | **`String?` en base (JSON sérialisé), PAS un `Json` Prisma.** Le service écrit `JSON.stringify(dto.sessions)` (`events.service.ts:112,170`) et **ne le re-parse jamais côté backend** à la lecture (`findAll`/`findOne` retournent la string telle quelle). Voir encadré ci-dessous. |
| `revenue`/`transactionCount`/`avgSpendPerTx`/`perCapita`/`calculatedAt` | Champs "calculés" — commentaire du schéma les annonce comme dérivés, mais **`events.service.ts` ne les calcule jamais** (aucune écriture trouvée dans ce fichier) ; leur alimentation, si elle existe, vit ailleurs (hors périmètre de ce module, non exploré dans cette passe — voir Zones grises). |

### Piège vérifié et résolu : `sessions` est une string JSON, pas un tableau

`Event.sessions` est un `String?` Prisma (pas `Json`), donc l'API renvoie littéralement
`"[{\"showTime\":\"19:00\"}]"`. Tout code qui ferait `event.sessions?.[0]?.showTime` sur cette
valeur brute lirait le premier **caractère** de la string (`'['`), qui n'a pas de `.showTime` →
`undefined` silencieux (pas d'erreur, juste un horaire jamais détecté). **Ce n'est pas un bug actif**
: `EventPredictView.vue` centralise le parsing avant que quoi que ce soit d'autre ne touche
l'event — `normalizeEvent(ev)` (ligne 5368) appelle `parseSessions(ev.sessions)` (ligne 5388), qui
gère string→`JSON.parse` ou array direct, puis reformate chaque `showTime`/`doorsOpening` en `HH:MM`
via `toHHMM` (lignes 5338-5362). Ce point de passage unique est appliqué à **tous** les events avant
qu'ils n'entrent dans `this.events`/`eventsHolder` (ligne 3486-3489) — donc avant `predictiveAnalytics.js`
et `usePredictiveTimeline.js`. **Si tu ajoutes un nouveau point d'entrée d'events dans Event Predict
(nouvel import, nouvelle source), tu dois repasser par `normalizeEvent`/`parseSessions`, sinon le
gate/score `showTime` se dégrade silencieusement à "non renseigné" pour cette source.**
`store/modules/analyse.js` a le même problème documenté en commentaire (lignes 1574-1583) mais ne
le corrige que pour un champ dérivé local, **sans réécrire `e.sessions` lui-même** dans l'objet
event qu'il expose — ce qui explique pourquoi `EventPredictView.vue` doit re-parser lui-même plutôt
que de faire confiance à la donnée qu'il reçoit du store Analyse.

### EventType / EventCategory / EventSubcategory — taxonomie du calendrier

Modèles `schema.prisma:2093-2146`. Hiérarchie stricte `EventType → EventCategory (+hasHomeTeam) →
EventSubcategory`, chacun avec `tenantId` **nullable** (`OR: [{tenantId}, {tenantId: null}]` dans
toutes les requêtes de lecture, `events.service.ts:194-224,282-286`) : un référentiel `tenantId=null`
est un référentiel **global partagé entre tous les tenants**, en plus des référentiels propres au
tenant. `EventCategory.hasHomeTeam` pilote côté UI si le formulaire d'event doit afficher le champ
équipe à domicile.

### Team — catalogue d'équipes, scopé compétition

Modèle `schema.prisma:2149-2166`. `eventCategoryId`/`eventSubcategoryId` **optionnels tous les
deux** : une équipe avec les deux à `null` est une équipe **générique** (visible pour toute
compétition) ; `getTeams` (`events.service.ts:433-451`) construit un `OR` qui inclut toujours les
équipes génériques **plus** celles scopées à la compétition demandée. Contrainte anti-doublon
applicative (pas une contrainte DB) : `createTeam` refuse (409) un nom déjà pris pour le **même**
scope catégorie+sous-catégorie (`events.service.ts:453-466`), insensible à la casse. Suppression :
`onDelete: SetNull` sur `Event.visitingTeamId`, et `visitingTeamName` (dénormalisé) est
**volontairement conservé** après suppression de l'équipe comme repli d'affichage
(`events.service.ts:502-507`). Renommer une équipe **repropage** le nouveau nom sur tous les events
qui la référencent (`updateTeam`, lignes 491-497) — évite un nom d'équipe périmé dans l'historique.

**Pourquoi `homeTeamName` est une string libre mais `visitingTeamId` une vraie FK** : décision
explicitement commentée dans le moteur (`predictiveAnalytics.js:240-243`) — seule l'équipe
**visiteuse** est scorée par similarité (800 pts si match exact), pour éviter qu'un simple match "à
domicile" (souvent la même équipe hôte d'un space) ne fausse la similarité de tous les matchs de la
saison. `homeTeamName` reste donc un champ d'affichage sans rôle dans le scoring.

---

## EventPredictVersion — le scénario de prédiction persisté

**Qu'est-ce que c'est** : un "scénario" nommé et sauvegardable pour un event donné — la
prédiction brute de l'algo, plus tous les ajustements manuels de l'utilisateur (sélection des menu
items par shop, curseurs %, quantités manuelles, choix des events sources). Plusieurs scénarios
peuvent coexister pour le même event (ex. "Pluie" vs "Beau temps"), un seul marqué `isDefault`.

**Où vit le code** :
- Modèle : `schema.prisma:2551-2576`.
- Service : `src/features/events/predict-versions.service.ts`.
- Contrôleurs : `predict-versions.controller.ts` — deux contrôleurs distincts, voir routes.
- DTO : `src/features/events/dto/predict-version.dto.ts`.
- Composable de persistance front : `src/composables/useEventPredictVersions.js`.
- Client API front : `src/api/endpoints/eventPredict.api.js`.

**Toutes les routes backend** :

| Route | Contrôleur | Permission | Rôle |
|---|---|---|---|
| `GET /events/:eventId/predict-versions` | `PredictVersionsController` | — (authentifié) | Liste des versions d'un event, triée `isDefault desc, createdAt desc` |
| `POST /events/:eventId/predict-versions` | `PredictVersionsController` | `menu.events.manage` | Créer une version (`isDefault` toujours forcé à `false` à la création, voir plus bas) |
| `PUT /events/:eventId/predict-versions/default` | `PredictVersionsController` | `menu.events.manage` | Définir (exclusif) la version par défaut ; `versionId: null` retire le défaut. **Doit rester déclaré AVANT toute route `:versionId`** dans le contrôleur (commentaire explicite ligne 66) sinon NestJS matcherait `default` comme un `:versionId` littéral. |
| `PATCH /predict-versions/:id` | `PredictVersionsStandaloneController` | `menu.events.manage` | Mise à jour partielle (whitelist de champs, voir DTO) |
| `DELETE /predict-versions/:id` | `PredictVersionsStandaloneController` | `menu.events.manage` | Suppression (204) |

**Champs clés et leur sens métier** :

| Champ | Sens |
|---|---|
| `eventSnapshot` (Json) | Copie des métadonnées de l'event au moment de la sauvegarde (nom, date, type…) — permet de rouvrir un scénario même si l'event a changé depuis. |
| `totalRevenue`/`adjustedTotalRevenue` | CA prédit brut (moteur) vs CA après ajustements manuels (%/quantités). `adjustedTotalRevenue` est ce qui prime partout en aval (rescale Analyse, affichage sidebar) via le pattern `adjustedX ?? totalX`. |
| `perCapita`/`adjustedPerCapita` | Panier moyen par personne, mêmes deux variantes. |
| `menuConfig` (Json) | `Object<elementId, string[]>` — quels menu items sont sélectionnés par shop. Alimenté par `EventPredictMenusSection.vue` via `update:selectedMenuItems`. |
| `quantityAdjustments` (Json) | `Object<"elementId-menuItemId", percent 0-500>` — curseur cellule/shop/item (voir §EventPredictMenusSection). |
| `manualQuantities` (Json, défaut `{}`) | `Object<"elementId-menuItemId", quantité absolue>` pour les items à prédiction 0 (pas de données historiques mais l'utilisateur veut en prévoir quand même). **Colonne existante et acceptée par le DTO — mais jamais envoyée par le frontend actuel, voir Bugs actifs.** |
| `predictedRecords` (Json, défaut `[]`) | Quantités prédites agrégées par (shop × item), lues par le module Réarmement pour préremplir la liste d'achats cross-device (sans dépendre du pont localStorage). |
| `selectedPredictionEventIds` (`String[]`) | Les events passés effectivement utilisés comme sources (top-10 auto ou override manuel via `EventPredictSourcesDrawer.vue`). Réutilisé tel quel comme `forcedPastEventIds` par `SpaceRestockView.vue`. |
| `selectedTimeRange` (Json?) | Plage horaire sélectionnée sur le slider de la courbe minute (affichage uniquement, `{start,end}` ou `null`). |
| `isDefault` | Un seul `true` par event, imposé par le service (`setDefault` fait un `updateMany` à `false` puis cible l'id dans une transaction, `predict-versions.service.ts:105-122`) — **jamais** modifiable via `create`/`patch` (le DTO `CreatePredictVersionDto.isDefault` existe mais `create()` l'ignore et force `false` en dur, ligne 41 : `isDefault: false,`). Design volontaire : une seule route (`PUT .../default`) est la source de vérité de l'exclusivité, pour ne jamais avoir deux versions `isDefault=true` simultanées. |

**Pourquoi ce design (double couche de persistance)** : `useEventPredictVersions.js` documente en
en-tête une persistance à 2 couches : (1) l'API REST NestJS = source autoritaire ; (2) un **miroir
localStorage** (`mirrorLS`, préfixe `analyse:`) utilisé comme cache offline ET comme filet de
sécurité pendant la période où l'API n'existait pas encore. Le composable garde une logique de
**réconciliation** (`reconcileLocalToDb`, lignes 267-312) qui migre au premier chargement les
versions restées en localStorage (créées hors-ligne) vers la base, avec anti-doublon par
**signature de contenu** (`versionSignature`, lignes 257-265 : nom + CA + menuConfig + adjustments
sérialisés) — si une version locale a déjà un jumeau en base (même signature), elle est **remappée**
(id local → id serveur), jamais recréée. Une deuxième garde (`_postedSigByEvent`, persistée
elle-même en localStorage sous `event-predict-posted-sigs:{eventId}`) empêche de re-POSTer une
version déjà envoyée cette session si le `GET` qui suit ne la renvoie pas immédiatement (bug backend
observé et commenté : *"GET /predict-versions = 0 après POST"* — protection anti-cascade de
doublons, l'incident cité dans le commentaire mentionne 76 versions dupliquées observées avant ce
correctif).

**Ce qui dépend d'EventPredictVersion (impact si tu le modifies)** :
- Le mode "predict" de la page **Analyse** lit `analyse:event-predict-active-version:{eventId}` /
  `analyse:event-predict-default-version:{eventId}` / `analyse:event-predict-versions:{eventId}`
  directement en localStorage (`store/modules/analyse.js:2085-2089`) — **pas** via l'API REST ni via
  le composable. Ces clés sont un contrat implicite non typé entre deux modules : renommer les clés
  localStorage dans `useEventPredictVersions.js` (`VERSIONS_KEY`/`DEFAULT_VERSION_KEY`/
  `ACTIVE_VERSION_KEY`, lignes 62-65) casse silencieusement la rescale d'Analyse sans aucune erreur
  (le `lsRead` renvoie juste `null`, la boucle `continue`).
- Le module **Réarmement** (`SpaceRestockView.vue`) lit `selectedPredictionEventIds` (comme
  `forcedPastEventIds`) et `predictedRecords` d'une version via `listEventPredictVersions` (import
  ligne 1042).
- `EventPredictView.vue` lui-même : `snapshotForVersion()` (lignes 5528-5554) est le point d'écriture
  unique ; `applyVersion()` (lignes 5675-5745) le point de lecture unique.

---

## Le moteur de scoring — `src/utils/predictiveAnalytics.js`

**Qu'est-ce que c'est** : la fonction pure qui score chaque event passé par similarité à un event
futur cible, puis agrège les ventes historiques pondérées en une prédiction. **100% frontend,
déterministe, sans effet de bord** — aucun appel réseau, aucun état.

### Pipeline exact (lu ligne à ligne, `predictiveAnalytics.js`)

1. **Normalisation des comparaisons** — `normalizeStr` (lignes 70-83) : gère le cas où un champ
   relation NestJS non aplati (`{id, name}`) est passé tel quel — sans le `v.name ?? ''` explicite
   (ligne 76), `String(objet)` vaudrait `"[object Object]"` et le gate `eventType` écarterait TOUS
   les events passés (bug historique documenté en commentaire). `eqNorm` (lignes 86-90) exige les
   deux valeurs non vides ET normalisées égales.
2. **Gates** (`evaluateSimilarity`, lignes 151-382), un seul échec écarte l'event (`return null`) :
   - `eventType` (176-190), `configurationId` (193-207), `category` (210-224) : gate **uniquement
     si les deux côtés sont renseignés** — sinon ignoré (ni points ni exclusion). Sans cette
     tolérance, des events passés partiellement classifiés seraient tous éliminés.
   - `showTime` (295-326) : gate si écart circulaire (`circularTimeDiff`, modulo 1440, lignes 53-57)
     > 180 min. Si l'un des deux horaires manque, le critère est **ignoré entièrement** (pas de
     défaut `19:00` côté engine — nuance vs le composable timeline, voir plus bas).
   - `attendance` (332-357) : gate si `pTickets < 0.6×tTickets || pTickets > 1.4×tTickets` (fenêtre
     ±40% symétrique). Champ résolu `ticketsScanned || ticketsSold` **des deux côtés** (ligne
     332-333, commentaire explicite : "MÊME résolution que la timeline, sinon deux ratios
     d'affluence divergents").
3. **Scoring** des critères non-gate : `subcategory` (800/0), `performerName` (800/0),
   `visitingTeam` (800/0, **sans repli sur l'équipe domicile**, lignes 240-250), `sponsorName`
   (400/0), `dayOfWeek`/`weekendDay` (500/250/0, exclusifs selon que la cible tombe en semaine ou le
   week-end — Ven/Sam comptent comme week-end, lignes 258-289), `attendance` proportionnel
   (`round(200×(1−écart))`, jamais < 120 pour un survivant puisque la fenêtre est ±40%).
4. **`maxPossibleScore` dynamique** (lignes 359-372) : ce n'est **pas** une constante fixe par type
   d'event — il ne compte `configuration`/`showTime` que si les deux events en ont un, et
   `visitingTeam`/`sponsor`/`performer` que si la **cible** (pas le passé) a la donnée. Les tables
   "SPORT=3000/CONCERT=3000/MICE=2600" de NEW_RULES sont donc des cas particuliers (tout renseigné
   des deux côtés), pas la formule réelle de calcul.
5. **Tri déterministe** (`compareScoredEvents`, lignes 408-414) : score desc, puis date d'event desc,
   puis id asc en dernier recours — sans ce triple critère, des ex æquo laissés dans l'ordre
   d'arrivée API rendaient le "top 10" non reproductible d'une session à l'autre.
6. **Exclusion des events "ad hoc"** (`isAdhocEvent`, lignes 127-138) : détectés **uniquement par le
   nom** (regex `/ad[\s_-]?hoc/i`, ligne 134) — le modèle de données ne porte aucun flag structurel
   dédié. Ces events sont écartés du pool automatique (`findAndScorePastEvents`, ligne 432) mais
   restent sélectionnables à la main via `allowIds` (le drawer de sources).
7. **`generatePredictionsForEvent`** (lignes 543-634) : top-10 max (`slice(0,10)`, ligne 566) ;
   **NEW RULES : aucun match → `[]`, aucune prédiction fabriquée** (pas de repli aléatoire dans ce
   moteur — nuance importante, le repli déterministe "3 events récents" n'existe QUE dans le
   composable timeline, voir plus bas) ; poids purs `score/Σscore` (ligne 576, garde-fou
   `totalScore===0 → []` ligne 574) ; agrégation par clé `${shopName}-${elementName}-${menuItemId}`
   (ligne 592), **sans renormalisation par couverture** (un item vendu dans une fraction seulement
   des events retenus pèse à proportion de sa présence, formule pure §7 de NEW_RULES).
8. `findSimilarPastEvents` (ligne 684) est un **simple alias** de `findAndScorePastEvents` conservé
   pour compat ascendante — pas une fonction distincte.

**Debug/traçabilité** : `findAndScorePastEventsWithTrace` (lignes 460-527) rejoue **exactement**
`evaluateSimilarity` (même fonction interne, pas une copie) mais collecte, pour chaque event exclu,
la raison précise (`GATE_LABELS`, lignes 118-125 : libellés FR par gate). Coût nul en production
(n'est appelé que si le mode debug est actif) et garanti **bit-identique** au chemin de production
puisque c'est la même fonction `evaluateSimilarity` sous-jacente qui est invoquée dans les deux cas
(`calculateSimilarity` l'appelle sans collecteur, `findAndScorePastEventsWithTrace` avec).

### Conformité au barème NEW_RULES — vérifiée ligne par ligne dans le code Vue réel

| Règle NEW_RULES | Vérifiée dans le code | Verdict |
|---|---|---|
| Poids `eventType:100, configuration:100, category:100, subcategory:800, visitingTeam:800, sponsor:400, performer:800, attendance:200, dayOfWeek:500, showTime:400` | `WEIGHTS` (lignes 96-107) | ✅ Exact, valeur par valeur |
| Poids purs `score/totalScore`, plus de split 70/30 | `generatePredictionsForEvent:576` | ✅ Exact dans ce moteur — **nuance** : `usePredictiveTimeline.js:857-869` implémente la même formule pure pour la timeline, mais l'ancien split 70/30 documenté comme "supprimé" par NEW_RULES ne s'appliquait historiquement qu'à la version React (`versionReact/`, code mort archivé) — vérifié absent du code Vue actuel des deux moteurs. |
| Fenêtre d'affluence ±40% symétrique | `evaluateSimilarity:336` | ✅ Exact |
| Pas de `Math.random` | Grep exhaustif `Math.random` sur `predictiveAnalytics.js` et `usePredictiveTimeline.js` : zéro occurrence | ✅ Le repli low-confidence de `usePredictiveTimeline.js` (lignes 813-855) trie par date desc + id asc — déterministe |
| `eqNorm` (comparaison normalisée) | Lignes 70-90 | ✅ Présent et utilisé sur tous les champs texte comparés |
| `visitingTeam` jamais de repli sur l'équipe domicile | Lignes 240-250, commentaire explicite | ✅ Confirmé |
| Écart d'horaire circulaire dans le gate | `circularTimeDiff` lignes 53-57, appelé ligne 300-303 | ✅ Confirmé |
| Gate "Configuration" (+100 pts) | Lignes 192-207 | ✅ Présent (absent du prototype React archéologique, ajouté au portage Vue) |

**Nuance non documentée par NEW_RULES, vérifiée dans le code** : le moteur "engine"
(`generatePredictionsForEvent`) et le composable timeline diffèrent sur UN point — le moteur engine
n'a **aucun** repli en cas de zéro match (`return []`, ligne 567), alors que le composable timeline
implémente un repli déterministe "3 events récents" (voir section suivante). Un même appel avec les
mêmes données peut donc renvoyer une prédiction agrégée vide côté engine tout en affichant une
courbe minute basse-confiance côté timeline — comportement voulu, pas un bug, mais à connaître avant
de "corriger" l'un en pensant aligner sur l'autre.

---

## Le moteur minute-level — `src/composables/usePredictiveTimeline.js`

**Qu'est-ce que c'est** : le composable Composition API qui produit la **courbe de vente par
minute** affichée dans `EventPredictView.vue` (`EventTimelineChart`). Contrairement au moteur
"engine" (agrégats totaux par shop×item), celui-ci distribue la prédiction minute par minute en
répliquant les courbes de vente réelles des events sources, réalignées sur l'horaire de l'event
cible. **Seul consommateur dans tout `src/` : `EventPredictView.vue`** (vérifié par grep).

### Étapes clés (lu ligne à ligne)

1. **Court-circuit mock** (lignes 470-527) : si le "granular holder" contient déjà des records
   `isPredictive` minute-level pour l'event cible (mode démo Adidas Arena), on les utilise tels
   quels sans re-scorer — **sauf** les records taggés `_engine` (produits par
   `generatePredictionsForEvent`/`regeneratePredictions`, qui sont agrégés sans dimension temporelle
   et écraseraient toute la courbe sur une seule minute si on les laissait passer ici, commentaire
   explicite lignes 471-477).
2. **Double mémoïsation** (lignes 210-229) : `resultMemo` (résultat complet, clé incluant
   sélection/affluence/showTime/mode debug, max 20 entrées) et `scoredEventsMemo` (scoring seul,
   clé SANS la sélection manuelle — un `apply` du drawer de sources réutilise le même set scoré,
   ne refait que le filtrage + la pondération + l'agrégation timeline). Objectif : rouvrir un event
   déjà vu = restitution instantanée ; appliquer une sélection manuelle après le drawer = recalcul
   partiel, pas un re-scoring complet.
3. **Jeton de génération + `AbortController`** (`loadGeneration`/`activeLoadCount`, lignes 189-201,
   414-444) : corrige deux courses documentées explicitement — un appel plus ancien qui se réveille
   après un `await` ne doit ni écraser les refs partagées, ni éteindre le spinner d'un appel plus
   récent encore en vol. Watchdog de 45s (`LOAD_WATCHDOG_MS`, ligne 200) en filet ultime contre un
   spinner infini si le réseau se fige.
4. **Sélection des events sources** — SOURCE UNIQUE = `overridePredictionIds` fourni par l'appelant
   (lignes 736-742, commentaire explicite : l'ancien fetch de repli vers l'Edge Function
   `/predictive-event-selection` en LECTURE a été **retiré**, car non déterministe et divergent du
   CA affiché). Si aucune sélection n'est fournie → top-10 auto (`allScoredEvents.slice(0,10)`,
   ligne 770).
5. **Repli "confiance faible" déterministe** (lignes 812-855) : si zéro event ne passe les gates
   (`scoredEvents.length === 0`), et qu'il existe des events passés avec des ventes réelles, on
   prédit à partir des **3 plus récents** (tri date desc + id asc pour la reproductibilité, lignes
   824-833) en signalant `isLowConfidencePrediction = true`. Si vraiment aucun event passé n'a de
   ventes → `insufficientData = true`, rien n'est fabriqué.
6. **"Manual 30%"** (lignes 672-734) : les events de même sous-catégorie ou catégorie que la cible,
   qui n'ont pas fait le top-10 automatique, sont réinjectés dans les listes
   `excludedSameSubcategoryEvents`/`excludedSameCategoryEvents` avec un **score fictif = 30% du
   meilleur score possible** (`weight30Score`, ligne 674) et le motif `"Manual 30%"` — **uniquement**
   pour peuplement du drawer de sélection manuelle (`EventPredictSourcesDrawer.vue`), jamais
   utilisés dans la pondération automatique tant qu'ils ne sont pas explicitement cochés par
   l'utilisateur.
7. **Alignement temporel** (`alignPastMinute`, lignes 79-82, appliqué ligne 986) :
   `minute_affichée = ((minute_passée + timeOffset) % 1440 + 1440) % 1440` puis bucketée à la
   minute, avec `timeOffset = horaireCible − horairePassé` (ligne 891). **Un event passé sans coup
   d'envoi (`showTime`) est totalement ignoré** (ni offset 0 par défaut, ni affichage en heure brute
   — lignes 933-952, commentaire explicite : l'ancien repli `|| 0` empilait les ventes à 00:00 et
   polluait la courbe alignée). L'event garde néanmoins son poids dans le CA total via
   `eventWeightsMap` — seule sa **courbe minute** est ignorée, pas sa contribution au total.
8. **Fetch borné** (`runWithConcurrency(eventIds, 5, ...)`, ligne 918) : 5 requêtes simultanées max
   (avant : jusqu'à 10 en parallèle non bornées), résultats indexés **par position** (pas par ordre
   de complétion réseau) pour que les libellés shop/item agrégés restent déterministes d'un run à
   l'autre.
9. **Agrégation finale** (lignes 1026-1068) : somme directe par `${minute}_${shopId}_${identifier}`
   — pas de renormalisation, la somme des minutes égale le total par construction (les courbes
   passées ont déjà été pondérées `× scale × poids` avant sommation).

**Champ d'affluence utilisé pour le scaling** (lignes 894, 907-908, 957-958) : `ticketsScanned ||
ticketsSold` **des deux côtés** — même résolution que le moteur "engine", contrairement à la
formulation littérale de NEW_RULES §6 qui ne mentionne que `ticketsSold` côté futur ; le
comportement réel est volontairement identique aux deux moteurs (commenté explicitement "sinon deux
ratios d'affluence divergents").

**`showTime` par défaut `'19:00'`** (ligne 458) : appliqué **uniquement à l'event cible**
(`predictiveIsDefaultShowTime = true` posé en drapeau UI, ligne 460), **jamais** aux events passés —
différence assumée avec le moteur "engine" qui n'a aucun défaut, des deux côtés.

### Fonctions exportées mais mortes dans ce fichier

`persistSelection` (lignes 288-304) POSTe vers un **Edge Function Supabase legacy**
(`API_BASE = https://${projectId}.supabase.co/functions/v1/make-server-eb31619c`, ligne 31) — une
route de l'ère React, distincte de l'API NestJS actuelle. Elle n'est appelée que par
`updatePredictionEvents` (lignes 1090-1098), elle-même exportée dans l'objet retourné (ligne 1125)
mais **jamais invoquée par `EventPredictView.vue`** (grep confirmé : l'unique consommateur du
composable appelle `timeline.loadPredictiveTimeline(event, ids)` directement à chaque endroit où il
pourrait appeler `updatePredictionEvents`, lignes 4552 et 4962 du composant). Code mort en pratique,
inoffensif (try/catch + `console.error`), mais à ne pas prendre comme le mécanisme réel de
persistance de la sélection — c'est `EventPredictVersion.selectedPredictionEventIds` (via
`useEventPredictVersions.js`) qui joue ce rôle.

---

## Persistance des scénarios — `useEventPredictVersions.js`

Composable détaillé au-dessus (§EventPredictVersion, "pourquoi ce design"). Points d'implémentation
supplémentaires vérifiés :

- **`apiAvailable` ne bascule en `false` que sur panne réelle** (`apiIsDown`, lignes 177-181) :
  erreur réseau, timeout, ou 5xx — **jamais** sur 404/400/409. Sans cette distinction, une seule
  version localStorage non migrée aurait pu, sur un 404 isolé, désactiver toute la persistance BDD
  pour le reste de la session.
- **`dbBackedIds`** (ligne 194) : set des ids réellement confirmés en base (chargés via `GET` ou
  créés via `POST`). `setDefault`/`PUT .../default` ne cible **jamais** un id absent de ce set — un
  id localStorage-only enverrait un `PUT` sur un id inexistant côté serveur → 500 *"Record to update
  not found"*, qui avait déjà déclenché par le passé une cascade de bascule `apiAvailable=false` +
  doublons (incident documenté en commentaire).
- **Upsert sur 404** (`upsertOn404`, lignes 536-561) : un `PATCH` sur une version pas encore
  confirmée en base (créée hors-ligne) déclenche un `POST` de secours puis un **remappage complet**
  de tous les ids réactifs qui pointaient sur l'ancien id local (`currentEditingVersionId`,
  `activeVersionId`, `defaultVersionId`) — **réservé** aux versions jamais persistées
  (`!dbBackedIds.has(versionId)`) : un vrai 404 sur une version déjà confirmée en base est traité
  comme une anomalie transitoire, jamais comme une recréation (pour ne pas dupliquer).
- **Single-flight sur `load()` et `setDefault()`** (lignes 183-187, 195-196, 315-372, 620-654) :
  coalesce les appels concurrents identiques (le composant appelle `load()` deux fois au montage —
  watcher + hook explicite).

---

## `EventPredictView.vue` — l'orchestrateur

**Qu'est-ce que c'est** : le composant unique (9192 lignes, template + Options API + `setup()`
hybride) qui porte tout l'écran `/spaces/:spaceId/predict` : sélection de l'event, édition de ses
métadonnées, courbe minute, sections "Configuration settings"/"Stock up", gestion des versions.

**Où vit le code** : `src/components/EventPredictView.vue`. Monté par `src/views/SpacePredictView.vue`
(chargement async, `defineAsyncComponent`, pour sortir Event Predict du chunk JS partagé).

**Architecture interne** : hybride Options API (`data`/`computed`/`methods`, ~64/~106/~82 membres) +
un `setup()` (lignes 1307-1349) qui instancie `useEventPredictVersions()` et
`usePredictiveTimeline(...)` puis les expose à `this` via `versionsApi`/`timeline`.
`eventsHolder`/`granularHolder` (lignes 1332-1335) sont des objets `{ value: [] }` **synchronisés
manuellement** à chaque mutation de `this.events`/`this.shopGranularData` (`this.eventsHolder.value =
this.events`, répété à ~10 endroits) — c'est le pont entre l'état Options API et les `ref`/getters
attendus par le composable Composition API `usePredictiveTimeline`.

**Contrat de state avec les enfants** — les deux structures documentées par
`docs/utiles/EVENT_PREDICT_SECTIONS.md` existent bien, mais **pas comme des `Map`/`Set`** malgré ce
que suggère le commentaire d'en-tête d'`EventPredictMenusSection.vue` ("sera ponté vers Map en
interne", jamais implémenté) :
- `eventMenuConfig` (data) + `derivedMenuConfigFromRecords` (dérivé) → fusionnés en
  `effectiveMenuConfig` (computed, lignes 2274-2276) : **plain Object `{elementId: string[]}`**,
  passé en prop `selected-menu-items` aux deux sections enfants.
- `quantityAdjustments`/`manualQuantities` (data, lignes 1406-1412) : **plain Object
  `{"elementId-menuItemId": number}`**, mutés uniquement via les événements `update:*` remontés par
  les enfants (`onAdjustmentsChange`/`onManualQuantitiesChange`/`onMenuConfigChange`, lignes
  4569-4591) — flux unidirectionnel, l'enfant ne mute jamais directement le state du parent.

**Sélection des events sources** : `EventPredictSourcesDrawer.vue` reçoit `scoredEvents`
(top-10 réel) et `unselectedEvents` (`drawerUnselectedEvents`, computed lignes 2391-2418, fusion de
`timeline.candidateEvents` hors top-10 + les deux listes "Manual 30%" + les events ad hoc via
`isAdhocEvent`). L'état d'override utilisateur (`excludedPastEventIds`/`manualIncludedPastEventIds`,
des vrais `Set`, lignes 1384-1386) est possédé par ce fichier, combiné en
`selectedPastEventIds` (computed, lignes 2377-2384) puis persisté dans
`EventPredictVersion.selectedPredictionEventIds` à la sauvegarde.

**Gestion des versions/scénarios** : UI complète dans la colonne de gauche — une carte par version
(`sortedVersions`, boucle lignes 238-333) avec sélection (radio), renommage, duplication, partage de
lien (`?version=`), suppression, et un bouton "Update" conditionné à `hasUnsavedChanges`. Deep-link
`?version=` géré par `applyDeepLinkFromRoute` (lignes 6089-6123). Écriture des 10 champs
`EventPredictVersion` centralisée dans `snapshotForVersion()` (lignes 5528-5554) ; lecture dans
`applyVersion()` (lignes 5675-5745).

**Permissions** : un seul point de gate RBAC dans ce fichier, `visibleToolboxItems` (computed,
lignes 1566-1573), qui filtre le sélecteur d'outils (`WorkspaceToolSelect`) par
`front.fb.analyse`/`front.fb.predict`/`front.fb.eventPredict`/`front.fb.spaceInventory`/
`front.fb.logistic`/`[front.fb.restock, front.fb.restockBoard]`. C'est un **sélecteur de
navigation**, pas un vrai gate d'accès à l'écran (celui-ci est déjà posé par le router, voir
§Écrans routés).

**Deux imports totalement morts, vérifiés zéro appel** : `import * as eventApi from
"../utils/eventApi"` (ligne 1167) et `import * as api from "../utils/api"` (ligne 1176) — ni
`eventApi.*` ni `api.*` n'est appelé nulle part dans les 9192 lignes (grep exhaustif). Toute la
donnée réseau de ce fichier passe soit par des imports nommés d'`api/endpoints/*`, soit par des
`store.dispatch(...)` Vuex.

---

## `EventPredictMenusSection.vue` — "Configuration settings"

**Qu'est-ce que c'est** : la section qui pilote **quels menu items sont vendus dans quel shop pour
cet event**, et permet d'ajuster les quantités prédites à 3 niveaux (cellule/shop/item) avant
réarmement.

**Où vit le code** : `src/components/EventPredictMenusSection.vue` (3230 lignes, dont ~2370 de
template+script, le reste est `<style scoped>`).

**Props reçues** (lignes 870-931) : `configuration`, `menuItems`, `ingredients`, `components`,
`suppliers`, `spaceId`, `eventId`, `predictedTimelineData`, `weezeventPriceMap`/`weezeventCostMap`,
`menuItemCostMap`, `selectedMenuItems`/`quantityAdjustments`/`manualQuantities` (les 3 states
contrôlés par le parent, plain Objects — voir section précédente), `isOpenByShop`, `configHasShops`,
`configShops`, `mapStatusByShop`, `menuAssignmentMissing`, `shopMenuAssignment` (**mort, jamais lu**),
`shopMenuAssignmentItems`, `shopMenuMembership`, `unmappedItemsByShop` (**mort, jamais lu**),
`viewMode` (Shop/Item), `itemsContext`, `productTypes`/`productCategories`.

**Émissions déclarées** (lignes 932-941) : `update:selectedMenuItems`, `update:quantityAdjustments`,
`update:manualQuantities`, `update:viewMode` (**jamais réellement émis** depuis ce fichier — grep
confirmé zéro `$emit('update:viewMode', ...)`), `manual-info`, `remap-request`, `assign-shop-item`,
`assign-blocked`. Un `$emit('assign-shop-items', ...)` (pluriel, batch) existe bien dans le code
(ligne 2266, `handleSelectAllForShop`) mais **n'est pas déclaré** dans `emits` (absent des lignes
932-941) — Vue le laisse passer sans erreur mais le contrat déclaré du composant ne le liste pas.

### Index de performance et architecture d'ajustement (vérifiés contre `EVENT_PREDICT_SECTIONS.md`)

- **`timelineDataIndex`** (computed, lignes 1123-1159) : clé `${shopKey}|${itemKey}`, indexé sous
  **shopId brut ET nom de shop normalisé** (pas `registryId` côté construction — ce champ n'existe
  que côté lecture) ; côté item, sous id ET nom en minuscule. Un **index jumeau**
  `timelineRevenueIndex` (lignes 1163-1194, non documenté par la spec React d'origine) accumule le
  revenu au lieu de la quantité — c'est la source de vérité pour le revenu prédit brut, indépendante
  du prix catalogue.
- **`getPredictedQuantity`/`getPredictedItemRevenue`** (lignes 1672-1708, 1728-1756) : essaient
  `element.id`, `element.registryId`, `normalizeStr(element.name)` × id-ou-nom d'item, et prennent
  le **max** des correspondances trouvées (pas la somme) — protection anti double-comptage explicite
  puisqu'un même record contribue à la fois à la clé id et à la clé nom dans l'index.
- **3 niveaux d'ajustement**, confirmés :
  - Cellule : `adjustedQty = round(base × adj/100)` (`getAdjustedQuantity`, lignes 1709-1726),
    mais **uniquement pour les items sélectionnés** — un item non coché est affiché à sa quantité
    brute, jamais mis à l'échelle par le curseur (nuance absente de la doc React d'origine).
  - Shop (`derivedShopAdjustments`, lignes 1288-1300) : si tous les items sélectionnés du shop ont
    le même %, exposé ; sinon replié silencieusement à 100% (pas d'indicateur "Mixed" au niveau
    shop, contrairement au niveau item).
  - Item (`derivedItemAdjustments`, lignes 1301-1314) : même logique à travers les shops, **avec**
    un indicateur explicite `isItemAdjustmentMixed` (lignes 1881-1884) affichant le texte "Mixed" si
    les valeurs divergent — asymétrie UX entre les deux niveaux, vérifiée réelle.
- **Deux calculs de revenu prédit indépendants** coexistent : `shopRevenues` (lignes 1262-1286,
  quantité × prix HT unitaire résolu via `htUnitPrice`) alimente les pastilles d'en-tête de carte
  shop (`getPredictedRevenue`, lignes 1973-1978) ; `timelineRevenueIndex`/`getPredictedItemRevenue`
  (revenu brut sommé directement depuis les records timeline) sert d'autres affichages. Les deux
  peuvent diverger si `htUnitPrice` et le ratio revenu/quantité réellement enregistré dans la
  timeline ne coïncident pas exactement — à garder en tête avant de "corriger" l'un en pensant que
  l'autre est faux.

### Disponibilité d'un menu item dans un shop — deux chaînes distinctes

1. **Matching shopType** (`menuItemsPerElement`, lignes 1202-1257) : shop `gppremium`/`temporary` ou
   sans `shopType` → tous les items admis. Sinon `classifyItemType` (Food/Beverage/Combo) puis :
   Food ⊂ `food` ; Beverage ⊂ `beverages ∨ drinkee ∨ beer` ; **Combo ⊂ `food ∨ beverages`** — **`∨`
   (OU), pas `∧` (ET)**. C'est une divergence réelle avec la spec archéologique
   (`EVENT_PREDICT_SECTIONS.md` §5.3, qui documentait un `∧` pour Combo d'après le prototype React) :
   un shop taggé uniquement `food` (sans `beverages`) admet déjà les items Combo dans le code Vue
   actuel.
2. **Disponibilité ingrédient → fournisseur → sites** (`isMenuItemAvailableInSpace`, lignes
   1903-1934, et sa variante enrichie `checkMenuItemAvailability`, lignes 1935-1971) : shortcut
   prioritaire si `menuItem.spaceIds` est renseigné (`spaceIds.includes(spaceId)`, court-circuite
   toute la chaîne) ; sinon marche récursive composants → ingrédients → `Supplier.sites`, **tous**
   les fournisseurs doivent servir l'espace (`sites` vide = fournisseur non restreint = disponible,
   cohérent avec la règle stricte documentée dans le domaine Menu & Recettes). Les items
   `_synthetic` (dérivés de la timeline, sans layout réel) sont **toujours** considérés disponibles
   (ligne 1938, rationale : "il a été vendu, donc il est disponible"). Les deux implémentations
   dupliquent la même marche composants→ingrédients→fournisseurs (pas de fonction factorisée) — un
   bug corrigé dans l'une pourrait ne pas l'être dans l'autre si elles divergent un jour.
3. `checkMenuItemAvailability` calcule `missingIngredients` en prenant, pour chaque fournisseur hors
   zone, **le premier** ingrédient trouvé qui le référence (`ingredients.find(...)`, ligne
   1955-1963) — sous-rapporte si plusieurs ingrédients partagent le même fournisseur hors zone
   (précision imparfaite, pas un crash).

---

## `EventPredictStockUpSection.vue` — "Stock up"

**Qu'est-ce que c'est** : à partir des quantités ajustées de la section précédente, calcule la
liste des composants/ingrédients à réapprovisionner par shop, en éclatant récursivement les menu
items "assemblés sur place".

**Où vit le code** : `src/components/EventPredictStockUpSection.vue` (1152 lignes). Explicitement
commenté (ligne 202-204) comme un "port 1:1 du composant React `EventPredictStockUpSection.tsx`".

**Props** (lignes 272-295) : `configuration`, `menuItems`, `ingredients`, `components`,
`predictedTimelineData`, `selectedMenuItems`, `quantityAdjustments`, `manualQuantities`, `viewMode`,
`menuItemCostMap`, `itemsContext`. **Aucune émission** — composant pur consommateur, tout son state
(`expandedShops`, `collapsedStockGroups`) est local à l'affichage.

**`expandMenuItem`** (méthode, ligne 644) — signature
`expandMenuItem(menuItemId, menuItemQuantity, rootMenuItemName, depth, menuItemsById, componentLookup)`,
garde `MAX_DEPTH = 10` (constante module, ligne 256) avec `if (depth > MAX_DEPTH) return []` (ligne
645, appelé initialement à `depth=0` → autorise en réalité 11 niveaux avant de couper, un
décalage d'un cran par rapport à ce que "MAX_DEPTH=10" suggère littéralement — sans conséquence
pratique visible mais à connaître si tu débogues une recette à profondeur limite) :
- `readyForSale === 'Yes'` → item feuille, unité `'pcs'`, pas d'expansion (lignes 649-666).
- `readyForSale === 'No'` + `components` non vide → expansion : `componentQty = numberOfUnits ×
  menuItemQty / numberOfPiecesRecipe` (lignes 669-673) ; si le composant résout lui-même à un menu
  item `readyForSale === 'No'`, récursion (ligne 699).
- **Cas non couvert par un flag explicite** : `readyForSale` absent, ou `'No'` avec `components`
  vide/manquant → traité **silencieusement comme le cas `'Yes'`** (item feuille, `pcs`, aucun
  signal), lignes 731-748. Une recette mal saisie peut donc sous-déclarer des ingrédients sans
  aucun avertissement visible.

### Confirmation du bug cross-domaine déjà documenté dans `04_MENU_CATALOGUE.md`

Grep exhaustif de ce fichier pour `comboItem` : **zéro occurrence**. La décision "faut-il éclater
cette ligne" repose ici **uniquement** sur `readyForSale`, à chaque point de branchement (racine et
récursion). Le domaine Menu & Recettes documente que `logistics.service.ts` (backend) combine
`readyForSale` **et** `comboItem` pour la même décision (`04_MENU_CATALOGUE.md`, bug #3). **Cette
passe confirme que l'incohérence existe toujours** dans la version actuelle de ce fichier — les deux
chemins (Event Predict côté frontend, Logistics côté backend) peuvent éclater une même ligne
différemment pour un article marqué `comboItem='Yes'`.

**Packaging** (`computePackaging`, lignes 773-807) : résout la ligne source dans `ingredients` puis
`components` (par id ou nom insensible à la casse) ; nécessite `packagingType` +
`packagingUnitNumber` + `packagingUnit` tous renseignés (sinon `null`, repli sur le badge quantité
brute) ; `packedCount = Math.ceil((quantity / packagingUnitNumber) × purchaseUnitConversion)`,
affiché avec la quantité "lâche" équivalente en sous-ligne.

**Import de données** : ce fichier n'importe **rien** de `predictiveAnalytics.js`,
`usePredictiveTimeline.js`, `stockPlanning.js` ni `bomPlanning.js` (grep confirmé) — toute la donnée
de prédiction lui arrive déjà calculée via la prop `predictedTimelineData`. C'est un pur
consommateur d'agrégats, pas un second moteur.

---

## `EventPredictSourcesDrawer.vue` / `EventPredictRowActions.vue`

**`EventPredictSourcesDrawer.vue`** (374 lignes) : tiroir de sélection manuelle des events "sources"
de la prédiction. Reçoit `scoredEvents` (top-10 réel avec `breakdown` détaillé par critère),
`unselectedEvents` (candidats hors top-10 + "Manual 30%" + exclus, chacun avec un `reason`), et
`selectedIds` (l'état courant). État local `checked` (copie de travail, `Set`) — **rien n'est
appliqué avant le clic "Sauvegarder & Recalculer"** (`apply()`, ligne 206, émet `apply` avec la liste
cochée) ; le parent relance alors `timeline.loadPredictiveTimeline` avec ces ids comme
`overridePredictionIds` explicite — recalcul partiel grâce au cache REST des timelines déjà
chargées (voir §usePredictiveTimeline).

**`EventPredictRowActions.vue`** (88 lignes) : simple menu kebab (3 actions max) pour une ligne
"non rattachée" au catalogue dans les sections Configuration/Stock up — `kind='remap'` (item hors
catalogue, propose de remapper), `'add'` (disponible mais hors menu du shop), `'reactivate'` (dans
le menu mais désactivé). Émet `remap`/`add`/`open-space-menus` — logique métier déléguée entièrement
au parent, ce composant ne fait aucun calcul.

---

## Écrans routés & permissions

| Route | Composant | Permission | Notes |
|---|---|---|---|
| `/spaces/:spaceId/predict` | `SpacePredictView.vue` → `EventPredictView.vue` (async) | `front.fb.eventPredict` | Écran réel. `SpacePredictView.vue` (190 lignes) ne fait que charger `store.dispatch('analyse/loadSpace')` si besoin puis monter `EventPredictView`, avec un skeleton de chargement pendant `store.state.analyse.loading`. |
| `/predict-test` | `PredictTestView.vue` | **aucune** (route hors du groupe authentifié, `router/index.js:376-380`) | Banc de test du moteur "engine" sur données mock (`@/data/predictMock.json`), aucune dépendance UI — sert à visualiser scoring/poids/trace de calcul par item sans backend. **Confirmé sans authentification ni permission** — accessible à quiconque connaît l'URL, y compris hors connexion. À gater ou retirer avant toute mise en avant publique de l'app. |

**`front.fb.eventPredict` vs `front.fb.predict`** — deux permissions RBAC **distinctes et
délibérément séparées** (`permission-catalog.ts:48-49` : *"Event Predict"* vs *"Predict"*),
généralement accordées ensemble aux mêmes rôles (mêmes listes lignes 129-130 et 180-181) mais
techniquement indépendantes : `front.fb.eventPredict` gate la route `/spaces/:spaceId/predict`
elle-même (ce module) ; `front.fb.predict` gate un **mode** à l'intérieur de la page **Analyse**
(`selectedToolbox === 'predict'`, `store/modules/analyse.js`) qui n'a pas de route dédiée — les deux
apparaissent comme deux entrées séparées dans le sélecteur d'outils (`TOOLBOX_ITEMS`, dupliqué tel
quel dans `EventPredictView.vue`, `SpaceRestockView.vue`, `SpaceInventoryView.vue`,
`SpaceLogisticView.vue` — 4 copies indépendantes du même tableau, pas de source unique factorisée).

**Sécurité des routes REST** : comme noté plus haut, toutes les routes `GET` (`Event`, taxonomie,
`Team`, `EventPredictVersion`) n'exigent qu'un JWT valide du tenant, sans vérification de la
permission front `menu.events.manage`/`front.fb.eventPredict` côté serveur — seules les mutations
sont protégées par `RequirePermissions('menu.events.manage')`.

---

## Bugs actifs confirmés (2026-07-15 ; statuts mis à jour 2026-07-18)

> **Mise à jour 2026-07-18** : #1 corrigé (fiche 08) ; #3 corrigé (`&&`, fiche 09) ; #4 corrigé
> (`assign-shop-items` déclaré, fiche 10) ; #5 corrigé (déclaration + listener orphelin retirés,
> fiche 11) ; #7 corrigé (fonctions + `API_BASE`/import supabase legacy supprimés, fiche 12) ;
> #8 corrigé (commentaire réécrit, fiche 13). Restent ouverts : #2 (règle métier combo →
> `QUESTIONS_A_BERTRAND.md` #18, fiche 188) et #6 (code mort backend, sans fiche dédiée).

| # | Bug | Fichiers | Repro / preuve |
|---|---|---|---|
| 1 | `manualQuantities` n'est **jamais envoyé** au backend bien que le DTO l'accepte déjà | `useEventPredictVersions.js:144-149` (payload construit sans le champ, commentaire dit d'attendre que "la colonne + le DTO existent") vs `predict-version.dto.ts` (`CreatePredictVersionDto.manualQuantities?: Record<string,number>` déjà déclaré, `@IsOptional() @IsObject()`) et `predict-versions.service.ts:49,73` (écrit déjà `manualQuantities: (dto.manualQuantities ?? {})`) | Éditer un item à quantité manuelle (prédiction=0), sauvegarder une version, recharger sur un **autre appareil/navigateur** (localStorage non partagé) : la quantité manuelle est perdue — seul `menuConfig`/`quantityAdjustments` survivent au changement d'appareil, `manualQuantities` retombe systématiquement à `{}` puisqu'il n'a jamais quitté le localStorage local. |
| 2 | `EventPredictStockUpSection.vue` n'utilise que `readyForSale` pour décider d'éclater une ligne, jamais `comboItem` | `EventPredictStockUpSection.vue` (fonction `expandMenuItem`, ligne 644 ; zéro occurrence de `comboItem` dans tout le fichier) | Incohérent avec `logistics.service.ts` (backend, cf. `04_MENU_CATALOGUE.md` bug #3) qui combine les deux champs pour la même décision — un article `comboItem='Yes'` peut être traité différemment par Event Predict (Stock up) et par Logistics pour le même besoin d'approvisionnement. |
| 3 | Availability Combo utilise `∨` (OU) au lieu de `∧` (ET) entre `food` et `beverages` | `EventPredictMenusSection.vue`, `menuItemsPerElement`, branche `Combo` (ligne ~1227) | Un shop taggé `shopType: ['food']` seul (sans `beverages`) admet déjà les items catégorie Combo — divergence vérifiée avec la spec archéologique `EVENT_PREDICT_SECTIONS.md` §5.3, qui documentait un `∧` d'après le prototype React d'origine. |
| 4 | `assign-shop-items` (pluriel/batch) émis sans être déclaré dans `emits` | `EventPredictMenusSection.vue`, `handleSelectAllForShop` (ligne 2266) émet ; `emits` (lignes 932-941) ne liste que le singulier `assign-shop-item` | Fonctionnel en Options API (Vue ne bloque pas un émit non déclaré), mais absent de tout contrat/typage généré à partir de `emits` — un futur portage `<script setup>`/`defineEmits` perdrait cet événement silencieusement. |
| 5 | `update:viewMode` déclaré mais jamais émis depuis `EventPredictMenusSection.vue` | `emits` (ligne 936) déclare l'événement ; grep exhaustif du fichier = zéro `$emit('update:viewMode', ...)` | Le changement de vue Shop/Item doit être piloté ailleurs (état local `shopStatusTab`/`itemTypeTab` ou contrôle côté `EventPredictView.vue`) — à vérifier avant de supposer que cocher un onglet ici remonte l'info au parent. |
| 6 | `PredictVersionsService.update()` (DTO `UpdatePredictVersionDto`) n'a **aucune route qui l'appelle** | `predict-versions.service.ts:58-79` (méthode définie) ; `predict-versions.controller.ts` (aucun contrôleur n'invoque `service.update(`, seul `service.patch(` est câblé) | Méthode et DTO morts côté API — toute mise à jour passe par `PATCH /predict-versions/:id` (`patch()`, whitelist de champs), jamais par un remplacement complet. Sans conséquence fonctionnelle actuelle (le chemin vivant marche), mais du code mort à ne pas prendre comme référence si tu ajoutes une route de remplacement complet. |
| 7 | `usePredictiveTimeline.js` : `persistSelection`/`updatePredictionEvents` écrivent vers un Edge Function Supabase legacy, jamais appelés | `usePredictiveTimeline.js:288-304,1090-1098` (exportés ligne 1125) ; `EventPredictView.vue` appelle `timeline.loadPredictiveTimeline` directement partout (lignes 4552, 4962), jamais `updatePredictionEvents` | Sans conséquence (try/catch silencieux), mais à ne pas prendre comme le mécanisme réel de sauvegarde de la sélection manuelle — c'est `EventPredictVersion.selectedPredictionEventIds` qui joue ce rôle. |
| 8 | `team.api.js` : commentaire "backend n'expose pas encore /teams" obsolète | `team.api.js:4-8` vs `events.controller.ts:172-215` (`TeamsController` complet, GET/POST/PATCH/DELETE) | Comportement inoffensif (le fallback 404→`[]` ne se déclenche simplement jamais en pratique), mais le commentaire pourrait faire croire à tort que le catalogue d'équipes n'est pas fiable/complet. |

---

## Code mort de ce domaine (à ne PAS prendre comme référence)

- `src/utils/predictiveAnalytics.legacy.js` (411 lignes) — 3ᵉ génération d'algo (poids `/10`, seuil
  de similarité `0.05`, repli aléatoire implicite via tri par score sans départage) : **zéro import**
  dans tout `src/` (grep exhaustif confirmé). Ses noms de fonctions (`calculateEventSimilarity`,
  `findSimilarPastEvents`, `generatePredictiveData`) collisionnent volontairement/accidentellement
  avec ceux du moteur actuel — vérifier systématiquement le chemin d'import avant de croire lire le
  bon fichier.
- `src/utils/predictiveAnalytics.js.bak` (3 lignes) — commentaire seul, aucune logique, reliquat
  d'un renommage.
- `src/utils/predictiveAnalyticsTimeline.js` (218 lignes) — `generateTimelineBasedPredictions`/
  `generateTimelinePredictionsForAllFutureEvents` importent bien le moteur réel
  (`findAndScorePastEvents`, ligne 9) et `getEventTimeline` (`./api`, legacy), mais **ce fichier
  lui-même n'est importé par aucun autre** dans tout `src/` (grep confirmé — la seule occurrence de
  son nom ailleurs est en commentaire, dans `usePredictiveTimeline.js:51` et
  `EventPredictView.vue:2322`, en référence historique). Documente une approche "moyenne simple par
  agrégation directe" jamais réellement exécutée en prod.
- `src/utils/api.js` : `setKVData`/`getKVData` (lignes 1425-1443) — zéro appelant dans `src/`, et le
  backend `KvModule` (fichier existant, `src/features/kv/kv.module.ts`) n'est de toute façon **pas
  enregistré** dans `app.module.ts` → route `/kv/*` 404 en prod même en cas d'appel. Double mort.
- `src/api/endpoints/event.api.js` : `getEventSponsors`, `calculateEventRevenue`,
  `calculateUnregisteredEventRevenue`, `saveEventRevenueCalculation`, `getEventRevenueCalculation` —
  zéro appelant en dehors du fichier lui-même (grep confirmé). Hors-scope Event Predict de toute
  façon (ancien flux de calcul de revenu manuel), mais à ne pas réutiliser en pensant qu'il est
  branché quelque part.
- `EventPredictView.vue` — imports morts `eventApi` (`../utils/eventApi`, ligne 1167) et `api`
  (`../utils/api`, ligne 1176) ; icône `Info` importée et enregistrée (lignes 1149, 1279) mais jamais
  utilisée dans le template ; propriétés/computed/méthodes définies mais jamais référencées ailleurs
  : `calendarOpen`, `multiSelectDates` (get/set référençant `this.sidebarEventTab`, lui-même **non
  défini nulle part** dans `data()` — bug latent inoffensif car tout le computed est mort),
  `confidenceScore`, `predictionRows`, `timelineSparkPath`, `timelineTotalRevenue`,
  `preprocessedTimelinePerMinute`, `usedEventDates`, `sidebarEvents`, `sidebarDateValues`, le cluster
  `headerUser*` (4 computed, vestige d'un ancien header custom remplacé par `WorkspaceUserMenu`),
  `formatWeight`, `pastEventCA`, `isSidebarEventDate` (alors qu'un commentaire sur la méthode voisine
  `isFutureEventDate` affirme à tort que le sidebar "utilise désormais `isSidebarEventDate`"),
  `togglePastEvent`, `includeAllPastEvents`, `excludeAllPastEvents`, `clearMultiSelect`,
  `toggleMultiEvent`, `resetSelection`, `formatCurrency` (dans ce fichier — délégation seule, jamais
  appelée), `goToHome` (le bouton Home du header appelle directement `$router.push` au lieu de passer
  par cette méthode et son garde-fou "modifications non sauvegardées"), `headerSignOut`,
  `onSetDefault` (flux complet défini, aucun contrôle du template ne l'invoque — les cartes de
  version ne câblent que select/rename/duplicate/share/delete), `getEventConfigName`, `askDate`.
- `EventPredictMenusSection.vue` — props `shopMenuAssignment` et `unmappedItemsByShop` déclarées
  (lignes 911, 922) mais jamais lues ailleurs dans le script (grep confirmé).

---

## Zones grises restantes (pas des angles morts — des points réellement non tranchés)

- **Alimentation de `Event.revenue`/`transactionCount`/`avgSpendPerTx`/`perCapita`/`calculatedAt`** :
  ces champs sont annoncés "calculés" par le commentaire du schéma Prisma, mais `events.service.ts`
  ne les écrit jamais. Leur alimentation (si elle existe) vit probablement dans le module Analyse ou
  un job d'agrégation hors périmètre de ce document — non retracée dans cette passe, à vérifier
  spécifiquement si un bug de CA affiché sur la fiche Event (hors Event Predict) remonte un jour.
- **Rescale exacte d'Analyse en cas de plusieurs versions/localStorage désynchronisé du serveur** :
  `regeneratePredictions` (`analyse.js:2073-2134`) lit les clés localStorage `event-predict-*`
  directement, indépendamment de l'état réel en base (pas d'appel à `useEventPredictVersions.js`
  ni à l'API REST) — si l'utilisateur a vidé son localStorage ou change de navigateur, la rescale
  d'Analyse ne verra tout simplement aucune version active/défaut et affichera le brut auto, sans
  synchronisation avec ce que `EventPredictView.vue` affiche lui-même (qui, lui, recharge bien depuis
  l'API). Comportement vérifié comme conçu ainsi (pas un bug caché), mais la conséquence UX exacte
  (les deux écrans peuvent afficher des CA "Predict" différents pour le même event selon l'appareil)
  n'a pas été testée en navigateur dans cette passe, seulement déduite de la lecture du code.
- **`Supplier.configurationIds`/`sectors`** (déjà noté zone grise dans `04_MENU_CATALOGUE.md`) —
  aucun impact direct trouvé sur Event Predict dans cette passe, mentionné seulement parce que la
  chaîne de disponibilité (`isMenuItemAvailableInSpace`) traverse `Supplier.sites`, pas ces deux
  champs.
