# Événements — Calendrier, taxonomie & équipes

> Domaine cartographie : **Événements**. Owner produit : Ulrich.
> Écrans : `/events` (liste + CRUD), `/event-types`, `/event-categories`, `/event-subcategories`
> (référentiels).
>
> Vérifié exhaustivement le 2026-07-15 : le modèle Prisma `Event`+taxonomie+`Team`, tous les
> contrôleurs backend (`events.controller.ts`, `predict-versions.controller.ts`), le service
> (`events.service.ts`, ligne à ligne), les 4 routes du router frontend, les 12 fichiers de
> `components/events/`, les stores Vuex du domaine, les 2 clients API (`event.api.js`,
> `team.api.js`) et leurs appelants réels (grep exhaustif, pas une supposition) ont été relus
> directement dans le code au moment de la rédaction. Objectif : qu'un dev ou un agent IA qui doit
> corriger un bug ici sache exactement où regarder et ce qu'il risque de casser ailleurs, sans
> relire tout le code.
>
> **Ce document remplace** l'ancien brouillon `docs/utiles/modules/07_EVENEMENTS_TEAMS.md` (format
> audit, correct mais partiel — il ne documentait pas la double modélisation Event/SalesEvent ni le
> champ `Event.spaceId` sans FK). Pour l'algorithme de scoring et `EventPredictVersion`, la
> référence qui fait foi reste
> [`01_EVENT_PREDICT_ALGORITHME.md`](01_EVENT_PREDICT_ALGORITHME.md) — ce présent document ne
> documente `EventPredictVersion` que sous l'angle "ce dont ce domaine a besoin de savoir", pas
> l'algorithme lui-même.

---

## Vue d'ensemble — comment les entités s'emboîtent

```
EventType ──< EventCategory (+hasHomeTeam) ──< EventSubcategory
   (tenantId nullable = référentiel global partagé entre tous les tenants)
        │                    │
        │                    └──< Team (scopé compétition, ou générique si aucun scope)
        ▼                                   │
      Event  ───────────────────────────────┘ visitingTeamId (FK) / homeTeamName (texte libre)
    spaceId, configurationId  (⚠ String simples, PAS de FK Prisma — voir Piège n°3)
        │
        ├──< EventPredictVersion   (scénario de prédiction — détaillé dans 01_EVENT_PREDICT_ALGORITHME.md)
        │
        └── (aucune relation Prisma) ──╌╌╌╌ ponté MANUELLEMENT, côté wizard uniquement, à ╌╌╌╌▶
                                              SalesEvent  (@@map("WeezeventEvent") — table réelle
                                              nommée "WeezeventEvent" en base, MAIS PAS le même
                                              modèle que Event ci-dessus — voir Piège n°1)
                                                 metadata Json : { doorsOpening, showTime, category,
                                                 eventType, team, visitingTeam, hasIntermission,
                                                 performer, openingAct, sponsor, dfEventId }
```

Deux généalogies totalement séparées portent le mot « événement » dans ce produit : le calendrier
métier (`Event` + sa taxonomie + `Team`, sujet de ce document) et l'événement de billetterie brut
synchronisé depuis Weezevent (`SalesEvent`, table `WeezeventEvent`, domaine Intégrations —
voir [`05_INTEGRATIONS_VENTES.md`](05_INTEGRATIONS_VENTES.md) pour son rôle dans le lac de
données). Le pont entre les deux n'existe que dans l'UI du wizard Data Integration, jamais en base.

---

## ⚠️ Piège n°1 : deux "Event" distincts, avec DEUX taxonomies qui portent les MÊMES noms de champs

C'est le piège architectural central de ce domaine — vérifié en lisant le code des deux côtés, pas
supposé à partir des noms.

| | `Event` (ce domaine, calendrier métier) | `SalesEvent` / table `WeezeventEvent` (domaine Intégrations) |
|---|---|---|
| Modèle Prisma | `schema.prisma:2169-2229`, id `uuid` | `schema.prisma:853-896`, id `cuid`, `@@map("WeezeventEvent")` |
| Origine | Créé manuellement (`/events`, `EventFormDrawer`) ou en masse depuis le wizard | Synchronisé automatiquement depuis l'API Weezevent (billetterie réelle) |
| Taxonomie type/catégorie | FK typées `eventTypeId`/`eventCategoryId`/`eventSubcategoryId` vers `EventType`/`EventCategory`/`EventSubcategory` | Champ texte libre `metadata.category` ∈ `['sport','musique','festival','conference','autre']` (liste **codée en dur** dans `EnrichEventDialog.vue:31`, aucun rapport avec la table `EventCategory`) |
| Équipe | FK typée `visitingTeamId` → `Team` (catalogue), `homeTeamName` texte libre | `metadata.team`/`metadata.visitingTeam` — **texte libre**, aucun lien vers le catalogue `Team` |
| "eventType" | FK vers `EventType` (Sport/Concert/MICE…) | `metadata.eventType` ∈ `['home','away','neutral']` — **sens totalement différent** (position domicile/extérieur/neutre, pas une catégorie d'événement) |
| Enrichi par | `EventFormDrawer.vue`, `EventDetailsEditor.vue` (via Event Predict) | `EnrichEventDialog.vue` (wizard Data Integration, étape 4 `StepProcessTimeline.vue`) |
| Consommé par le moteur de prédiction | **Oui** — `predictiveAnalytics.js` lit `eventCategoryId`/`visitingTeamId`/etc. de CE modèle | **Non, jamais** — aucun consommateur du moteur de scoring ne lit `SalesEvent.metadata` |

**Le pont entre les deux** : `StepProcessTimeline.vue` (wizard, étape 4) est le seul endroit du
code qui relie les deux tables, via un champ `metadata.dfEventId` (String, stocké dans le JSON
`SalesEvent.metadata`, **pas une FK Prisma**) :
- Création manuelle d'un `Event` depuis un `SalesEvent` non couvert
  (`CreateEventDialog.vue`, monté par le wizard) : **copie bien** la taxonomie
  (`eventTypeId`/`eventCategoryId`/`eventSubcategoryId`, tickets, sessions) vers le nouvel `Event`
  — `CreateEventDialog.vue:499-514`.
- Création en masse (`bulkCreateEvents`, `StepProcessTimeline.vue:1173-1211`) : ne copie que
  `name`/`eventDate`/`eventStartDate`/`eventEndDate`/`spaceId` (`:1184-1190`) — **aucune taxonomie,
  aucune équipe, aucune donnée d'enrichissement n'est reportée**, même si l'utilisateur avait
  rempli `EnrichEventDialog` sur le `SalesEvent` source avant le bulk-create.
- `updateWeezeventEventMetadata(spaceId, weezEventId, { dfEventId: newEvent.id })`
  (`StepProcessTimeline.vue:1194`) enregistre le lien, mais **`dfEventId` n'est lu nulle part
  ailleurs dans le code** (grep exhaustif `dfEventId` sur `api-datafriday-staging/src` et
  `datafriday-web/src` : les seules occurrences sont dans `StepProcessTimeline.vue` lui-même) — il
  ne sert qu'à l'état local du wizard (afficher "déjà importé", éviter les doublons au bulk-create
  suivant), pas de contrat consommé ailleurs.

**Conséquence pratique** : si tu dois corriger un bug de taxonomie/équipe sur un événement, vérifie
d'abord lequel des deux modèles est en cause — un événement qui semble avoir une "catégorie" ou une
"équipe" fausse peut être un `SalesEvent.metadata` (enrichissement wizard, texte libre, jamais lu
par la prédiction) et non l'`Event` réellement utilisé par Event Predict/Analyse. Les deux se
ressemblent dans l'UI du wizard mais n'ont **aucune intégrité référentielle** entre eux au-delà de
`dfEventId`, lui-même non consommé.

---

## ⚠️ Piège n°2 : le gating "Home/Visiting Team" ne respecte la règle prévue dans aucun des deux écrans vivants

Le modèle est conforme au design d'origine (`EventCategory.hasHomeTeam Boolean @default(false)`,
`schema.prisma:2113`) : l'intention est d'afficher la section équipes seulement pour les
catégories sportives. Vérifié dans le code réel des deux écrans qui éditent un `Event` :

- **`EventFormDrawer.vue`** (écran `/events`, création/édition manuelle) : la section équipes
  (`homeTeamName`/`visitingTeamId`) est gatée par `v-if="newEvent.eventCategoryId"`
  (`EventFormDrawer.vue:207,237,272`) — **dès qu'une catégorie quelconque est choisie**, sport ou
  non. `hasHomeTeam` n'est jamais lu dans ce fichier (grep confirmé).
- **`EventDetailsEditor.vue`** (édition depuis Event Predict) : la section "Teams" (`:145-190`)
  s'affiche **sans aucune condition** (aucun `v-if` sur le bloc). Le composant calcule bien
  `isSportType` (`:617`, `eventTypeName.toLowerCase() === 'sport'`) mais **ne l'utilise dans aucun
  template** (grep confirmé : une seule occurrence du mot dans tout le fichier, sa propre
  déclaration). `hasHomeTeam` n'y est jamais référencé non plus.

`hasHomeTeam` n'est donc pas un champ mort : il est bien **saisi et affiché** dans les écrans de
gestion de taxonomie (`EventsCategorieListView.vue:70,152`, `EventCategoryDialog.vue`,
`TaxonomyImportDrawer.vue`) — mais son unique raison d'être fonctionnelle prévue (piloter
l'affichage du bloc équipes sur la fiche `Event`) n'est appliquée **nulle part**. **Statut :
documenté, non corrigé** (persistant depuis au moins le 2026-07-15, réutilisé à l'identique par
cette passe).

---

## ⚠️ Piège n°3 : `Event.spaceId`/`Event.configurationId` sont des String, pas des FK Prisma

Contrairement à la quasi-totalité des autres tables du produit qui référencent `Space`/`Config`
(`SpaceMenuItem`, `MenuAssignment`, `ElementPerformance`…, toutes avec une vraie relation
`@relation` et souvent `onDelete: Cascade`), `Event.spaceId`/`Event.configurationId`
(`schema.prisma:2173-2174`) sont des colonnes texte **sans relation Prisma déclarée** — confirmé en
relisant le modèle en entier (aucune ligne `space Space @relation(...)` dans le bloc `Event`).

**Conséquence vérifiée** : `SpacesService.remove()` (`spaces.service.ts:415-427`) fait un simple
`prisma.space.delete({ where: { id } })` — aucune requête de ce service ne touche la table `Event`.
Supprimer un espace laisse donc tous ses `Event` en base avec un `spaceId` qui ne pointe plus vers
rien (ni cascade, ni erreur, ni nettoyage). Ces événements orphelins restent visibles dans l'écran
`/events` (liste tenant-wide, non filtrée par espace vivant) et dans un futur `GET /events` filtré
par cet ancien `spaceId` (silencieusement vide côté Analyse/Predict, sans erreur). **Statut :
comportement vérifié, jamais traité comme un bug par le produit à ce jour — à documenter comme
risque plutôt qu'à "corriger" sans arbitrage produit** (voir Zones grises).

Autre conséquence du même choix de modélisation : ni `create()` ni `update()`
(`events.service.ts:98-126,156-184`) ne vérifient que le `spaceId`/`configurationId` fourni
appartient réellement au tenant courant — contrairement à `resolveEventTeamFields` qui, lui, valide
bien que `visitingTeamId` appartient au tenant (`findOwnedTeamOrThrow`). Un `spaceId` d'un autre
tenant serait accepté tel quel (pas d'exploitation confirmée, la donnée resterait simplement
invisible puisque tous les écrans consommateurs filtrent par `tenantId` ET `spaceId` ensemble).

---

## `Event` — le calendrier des événements métier

**Qu'est-ce que c'est** : un événement (match, concert, salon) rattaché à un espace, avec ses
métadonnées de billetterie/déroulement. Source des events "passés" (comparables) et de l'event
"futur" (cible) pour Event Predict, et unité d'agrégation pour les KPI de la page Analyse.

**Où vit le code** :
- Modèle : `api-datafriday-staging/prisma/schema.prisma:2169-2229`.
- Service/contrôleur : `src/features/events/events.service.ts` / `events.controller.ts`
  (`@Controller('events')`).
- Client API front : `src/api/endpoints/event.api.js` (fichier réel nommé `event.api.js` malgré le
  commentaire d'en-tête `// src/api/endpoints/events.api.js` — vestige d'un renommage, sans
  conséquence puisque tous les imports du code utilisent le bon chemin de fichier).
- Store Vuex : `src/store/modules/events.js` (cache TTL **15 min**, aligné le 2026-07-18 sur la
  convention du reste de l'app — [BUG-147](../bugs/147_events_store_ttl_5min_incoherent.md),
  décision confirmée définitive le 2026-07-24 ; le futur module Live aura son propre mécanisme de
  fraîcheur ~2 min, indépendant de ce TTL ; `fetchEvents()` **tenant-wide, sans
  scoping spaceId** — cohérent avec son unique consommateur, l'écran `/events`).
- Écrans dédiés à la gestion (hors Event Predict) : `components/events/views/EventsListView.vue`,
  drawers `components/events/drawers/EventFormDrawer.vue` (création/édition complète),
  `CsvImportDrawer.vue` (import en masse depuis CSV, appelle `createEvent` en boucle), dialogs
  `EventCategoryDialog.vue`/`EventSubcategoryDialog.vue`/`EventTypeDialog.vue` (création inline de
  taxonomie sans quitter le formulaire), `EventDeleteDialog.vue`.
- Éditeur alternatif : `components/EventDetailsEditor.vue`, monté par `EventPredictView.vue`
  (édition des métadonnées d'un event directement depuis l'écran de prédiction — même API
  `event.api.js`, pas un chemin d'écriture distinct).

**Toutes les routes backend** (`events.controller.ts`) :

| Route | Permission | Rôle |
|---|---|---|
| `POST /events` | `menu.events.manage` | Créer un event |
| `GET /events` (`?page&limit&spaceId`) | — (authentifié) | Liste paginée, filtrable par espace |
| `GET /events/:id` | — (authentifié) | Détail |
| `PATCH /events/:id` | `menu.events.manage` | Édition partielle |
| `DELETE /events/:id` | `menu.events.manage` | Suppression (aucun nettoyage en cascade — voir Piège n°3) |

**Note de sécurité factuelle** (vérifiée, identique au constat déjà fait pour `EventPredictVersion`
dans `01_EVENT_PREDICT_ALGORITHME.md`) : `GET /events`/`GET /events/:id` n'exigent que
`JwtDatabaseGuard` (utilisateur authentifié du tenant), aucune permission. Le vrai gate d'accès à
l'écran `/events` est **posé côté frontend uniquement** (`meta.permission: 'menu.events.manage'`
dans le router — voir plus bas), et réutilise une permission d'ÉCRITURE comme permission de
LECTURE d'écran : un utilisateur sans cette permission ne verra pas `/events` dans l'UI, mais un
appel direct à `GET /events` avec son JWT fonctionnerait.

**Champs clés et leur sens métier** :

| Champ | Sens |
|---|---|
| `spaceId`/`configurationId` | Rattachement à un espace/une configuration — **String simples, pas de FK** (voir Piège n°3). `configurationId` alimente le gate "Configuration" (+100 pts) du moteur de scoring (détaillé dans `01_EVENT_PREDICT_ALGORITHME.md`). |
| `eventTypeId`/`eventCategoryId`/`eventSubcategoryId` | FK vers la taxonomie hiérarchique (Sport → Football → Ligue 1). Résolues côté moteur par **nom**, pas par id (voir doc Predict). |
| `location`/`spaceName` | Champs texte libres, dénormalisés — `spaceName` duplique le nom de l'espace au moment de la création (utile si l'espace est renommé/supprimé ensuite, cohérent avec l'absence de FK du Piège n°3). |
| `sessions` | `String?` en base (JSON sérialisé côté service, `JSON.stringify(dto.sessions)` — `events.service.ts:112,170`), **jamais re-parsé côté backend**. Le point de passage unique qui le parse avant tout usage est `EventPredictView.normalizeEvent()` — détaillé dans `01_EVENT_PREDICT_ALGORITHME.md`, qui documente aussi le piège de lecture directe (`event.sessions?.[0]?.showTime` lirait le premier caractère de la string). `EventFormDrawer.vue`/`CreateEventDialog.vue` envoient directement un tableau d'objets `{doorsOpening, showTime}` au `POST`, laissant le service faire le `JSON.stringify`. |
| `numberOfSessions` | Nombre de séances/représentations (1 à 10 dans l'UI de création). Distinct de `sessions.length` : rien ne garantit dans le service que les deux restent synchronisés (aucune validation croisée trouvée dans `events.service.ts`). |
| `hasOpeningAct`/`hasIntermission` | Déroulement (1re partie / entracte) — affichage uniquement, aucun consommateur du moteur de scoring trouvé pour `hasIntermission` au-delà de l'affichage (contrairement à `subcategory`/`visitingTeam` qui sont scorés). |
| `homeTeamName` | Texte libre — **volontairement pas de FK catalogue**. Décision commentée dans le moteur (`predictiveAnalytics.js:240-243`, cité dans `01_EVENT_PREDICT_ALGORITHME.md`) : seule l'équipe visiteuse est scorée par similarité, pour ne pas biaiser tous les matchs d'un même espace "à domicile" vers le même score. |
| `visitingTeamId`/`visitingTeamName` | FK vers `Team` + nom dénormalisé. `visitingTeamId: null` explicite désassigne les deux (`resolveEventTeamFields`, `events.service.ts:75-96`). Le nom est **recalculé côté serveur** dès qu'une FK est posée — le nom envoyé par le client n'est pris en repli que si aucune FK n'est fournie. |
| `ticketsSold`/`ticketsScanned` | Affluence vendue vs scannée aux portes. Le moteur résout `ticketsScanned ?? ticketsSold` (voir doc Predict) — non dupliqué ici. |
| `revenue`/`transactionCount`/`avgSpendPerTx`/`perCapita`/`calculatedAt` | Présentés par le commentaire du schéma comme des champs "calculés" — **vérifié qu'aucun code de ce backend ne les écrit jamais** (grep exhaustif `calculatedAt`/`avgSpendPerTx`/écriture de `revenue` sur `Event` : zéro résultat en dehors des déclarations DTO/Prisma). Voir Bugs actifs — un endpoint les LIT en supposant qu'ils sont peuplés. |
| `status` | Texte libre. Le commentaire du schéma suggère `"success"`/`"pending"`, mais `events.service.ts:116` pose `dto.status || 'draft'` par défaut à la création — une 3ᵉ valeur non documentée par le commentaire du modèle. |

**Ce qui dépend d'`Event` (impact si tu le modifies)** :
- **Event Predict** (`01_EVENT_PREDICT_ALGORITHME.md`) : lit `eventTypeId`/`eventCategoryId`/
  `eventSubcategoryId`/`visitingTeamId`/`homeTeamName`/`ticketsSold`/`ticketsScanned`/`sessions`
  pour le scoring et l'affichage. **Ne passe pas par `event.api.js` en pratique** : la source
  réelle de la liste d'events dans `EventPredictView.vue` est `store.state.analyse.events`
  (peuplé par `useSpaceData.js`, domaine Analyse), le fallback `getEvents()` REST direct
  (`allEvents`, `EventPredictView.vue:3350-3373`) étant **toujours court-circuité à `[]`** en
  pratique (commentaire explicite dans le code : événements "viennent du STORE… pas de l'Edge
  Function"). **Nuance qui affine `01_EVENT_PREDICT_ALGORITHME.md`** (qui présente `event.api.js`
  comme consommé "directement" par `EventPredictView.vue` — vrai seulement pour `createEvent`/
  `updateEvent`/les 3 taxonomies, pas pour la lecture de la liste elle-même).
- **Analyse** (`analyse.service.ts:79-104`, `GET /analyse/kpis/events`) : agrège `revenue`/
  `transactionCount` de tous les `Event` du tenant — voir Bugs actifs, ce total est
  structurellement toujours 0.
- **Data Integration wizard, étape 4** (`StepProcessTimeline.vue`) : crée/relie des `Event` en
  masse depuis les `SalesEvent` Weezevent — voir Piège n°1.
- **Réarmement** (`SpaceRestockView.vue`) : consomme `EventPredictVersion` (donc indirectement
  `Event` via son `eventId`), détaillé dans `01_EVENT_PREDICT_ALGORITHME.md`.

---

## `EventType` / `EventCategory` / `EventSubcategory` — taxonomie du calendrier

**Où vit le code** : modèles `schema.prisma:2093-2146`. Hiérarchie stricte
`EventType → EventCategory (+hasHomeTeam) → EventSubcategory`. `tenantId` **nullable sur les
trois** : toutes les requêtes de lecture (`events.service.ts:194-224,282-286,315-320`) utilisent
`OR: [{tenantId}, {tenantId: null}]` — un référentiel `tenantId=null` est un socle **global partagé
entre tous les tenants**, en plus des référentiels propres à chaque tenant. Les écrans de création
(`createEventType`/`createEventCategory`/`createEventSubcategory`) posent toujours le `tenantId` du
créateur — aucun chemin ne permet de créer une entrée globale (`tenantId=null`) depuis l'UI ; ces
entrées n'existent qu'en seed/donnée d'amorçage.

**Toutes les routes backend** (contrôleurs séparés dans `events.controller.ts`, un `@Controller`
par palier) :

| Route | Permission | Rôle |
|---|---|---|
| `GET /event-types` | — (authentifié) | Liste, avec `categories` imbriquées |
| `POST/PATCH/DELETE /event-types` | `menu.events.manage` | CRUD |
| `GET /event-categories` | — (authentifié) | Liste, avec `subcategories` imbriquées |
| `POST/PATCH/DELETE /event-categories` | `menu.events.manage` | CRUD ; `PATCH` valide que le nouvel `eventTypeId` reste accessible au tenant (400 sinon, `events.service.ts:236-259`) |
| `GET /event-subcategories` | — (authentifié) | Liste plate |
| `POST/PATCH/DELETE /event-subcategories` | `menu.events.manage` | CRUD ; body accepte `eventCategoryId` **ou** `categoryId` (alias, `events.service.ts:291,350`) — le frontend utilise les deux noms selon l'écran, voir Zones grises |

**Champs clés** : `EventCategory.hasHomeTeam` (Boolean, défaut `false`) — pilote en intention
l'affichage du bloc équipes sur la fiche `Event`, mais aucun écran vivant ne le lit pour ça
aujourd'hui (Piège n°2).

**Où sont-ils gérés** : `components/events/views/EventsTypeListView.vue` (`/event-types`),
`EventsCategorieListView.vue` (`/event-categories`), `EventsSubcategorieListView.vue`
(`/event-subcategories`) — noms de fichiers avec la graphie "Categorie"/"Subcategorie" (sans
tréma/accent, cohérent entre le fichier et le nom de composant enregistré dans le router, donc pas
une faute qui casse quoi que ce soit). Chacun utilise `components/events/drawers/
TaxonomyImportDrawer.vue` (import CSV en masse, un seul composant paramétré par `entity`
`type`/`category`/`subcategory` — pas de duplication ici, contrairement au piège n°1).

---

## `Team` — catalogue d'équipes, scopé compétition

**Où vit le code** : modèle `schema.prisma:2149-2166` ; logique dans `events.service.ts:395-508`
(section `TEAMS`) ; contrôleur `TeamsController` (`@Controller('teams')`, même fichier
`events.controller.ts`).

**Toutes les routes backend** :

| Route | Permission | Rôle |
|---|---|---|
| `GET /teams` (`?eventCategoryId&eventSubcategoryId`) | — (authentifié) | Équipes de la compétition demandée + équipes génériques (scope null des deux côtés) |
| `POST /teams` | `menu.events.manage` | Créer (409 si nom déjà pris pour le même scope catégorie+sous-catégorie, insensible à la casse) |
| `PATCH /teams/:id` | `menu.events.manage` | Mettre à jour — renommer **repropage** le nouveau nom sur tous les `Event.visitingTeamName` qui la référencent (`events.service.ts:491-497`) |
| `DELETE /teams/:id` | `menu.events.manage` | Supprimer — `onDelete: SetNull` sur `Event.visitingTeamId`, `visitingTeamName` volontairement conservé comme repli d'affichage |

**Champs clés** : `eventCategoryId`/`eventSubcategoryId` **tous deux optionnels** — une équipe avec
les deux à `null` est générique (visible pour toute compétition). Le scoping catégorie/sous-
catégorie est validé à la création/mise à jour (`assertAccessibleTeamScope`,
`events.service.ts:402-431`) : les deux doivent être accessibles au tenant (possédées ou globales)
et cohérentes entre elles (`subcategory.eventCategoryId === scope.eventCategoryId`).

**Pas d'écran de gestion dédié** — aucune route `/teams` côté frontend (absente du router,
confirmé). Les équipes se créent **à la volée**, inline, depuis les deux seuls formulaires qui
éditent un `Event` : `EventFormDrawer.vue` (`/events`) et `EventDetailsEditor.vue` (Event Predict) —
tous deux via un dialog de création (`openCreateTeamDialog`) plutôt qu'un écran de liste. C'est un
choix cohérent avec le fait que le catalogue d'équipes n'a de sens que rattaché à la saisie d'un
événement.

**Commentaire obsolète confirmé** (déjà signalé dans `01_EVENT_PREDICT_ALGORITHME.md`, revérifié
ici) : `team.api.js:4-8` affirme que le backend n'expose pas encore `/teams` et dégrade
silencieusement un 404 en `[]` — faux depuis que `TeamsController` est déployé (routes ci-dessus
bien vivantes). Le code de repli reste inoffensif (juste mort en pratique, un 404 réel
retournerait toujours `[]`), mais le commentaire induirait en erreur un futur lecteur qui croirait
le catalogue non fiable.

---

## `EventPredictVersion` — ce que ce domaine a besoin d'en savoir

Modèle `schema.prisma:2551-2576`, `eventId` pointant vers `Event.id` (String, sans FK Prisma
déclarée non plus — même absence de contrainte que `spaceId`/`configurationId` sur `Event` lui-
même). Documentation complète (champs, routes, moteur de scoring, persistance à double couche
API+localStorage) dans [`01_EVENT_PREDICT_ALGORITHME.md`](01_EVENT_PREDICT_ALGORITHME.md). Pour ce
domaine, retenir uniquement : supprimer un `Event` (`DELETE /events/:id`, aucun nettoyage en
cascade vérifié dans `events.service.ts:186-189`) laisse ses `EventPredictVersion` orphelines en
base — même famille de risque que le Piège n°3, non traité non plus à ce jour.

---

## Router frontend & permissions

Vérifié `router/index.js:190-213` :

| Route | Composant | Permission | Remarque |
|---|---|---|---|
| `/events` | `EventsListView.vue` | `menu.events.manage` | Seule route du domaine gatée — réutilise une permission d'écriture backend comme gate d'écran |
| `/event-types` | `EventsTypeListView.vue` | **aucune** | Accessible à tout utilisateur authentifié |
| `/event-categories` | `EventsCategorieListView.vue` | **aucune** | idem |
| `/event-subcategories` | `EventsSubcategorieListView.vue` | **aucune** | idem |

Les trois écrans de taxonomie n'ont aucun garde-fou client-side non plus (grep `can(`/`permission`
sur les 3 fichiers : zéro résultat) — les boutons créer/éditer/supprimer sont toujours affichés,
même à un utilisateur sans `menu.events.manage` ; ce dernier essuierait un 403 backend au clic.
Cohérent avec le constat plus large déjà documenté pour d'autres domaines : la lecture des
référentiels de taxonomie n'est presque jamais gatée dans ce produit (voir `04_MENU_CATALOGUE.md`,
taxonomies Menu/Component/MarketPrice — même schéma).

---

## Client API — qui appelle quoi

| Fichier | Statut | Consommateurs confirmés |
|---|---|---|
| `src/api/endpoints/event.api.js` | **Vivant** pour `Event` (create/get/update/delete) et les 3 taxonomies | `store/modules/events.js`, `EventsListView.vue`, `EventFormDrawer.vue`, `CsvImportDrawer.vue`, `CreateEventDialog.vue` (wizard), `EventPredictView.vue` (create/update + taxonomies, PAS la lecture de liste — voir plus haut) |
| `src/api/endpoints/event.api.js` — section "EVENT REVENUE"/"SPONSORS" | **Mort, hors-scope** | `calculateEventRevenue`, `getEventRevenueSummary`, `calculateUnregisteredEventRevenue`, `saveEventRevenueCalculation`, `getEventRevenueCalculation`, `getEventSponsors` — grep exhaustif sur `datafriday-web/src` : **zéro appelant** en dehors de leur propre déclaration. Les routes backend qu'elles ciblent (`/events/calculate-single-event-revenue`, `/event-revenue/location/:location`…) n'existent d'ailleurs pas dans `events.controller.ts` — code mort des deux côtés, vestige d'une ancienne API (Edge Function Supabase, cf. commentaires d'en-tête similaires ailleurs dans le domaine) |
| `src/api/endpoints/team.api.js` | **Vivant** | `EventDetailsEditor.vue`, `EventPredictView.vue`, `EventFormDrawer.vue` — pas d'écran de gestion dédié, création inline uniquement |
| `src/api/endpoints/space.api.js` (fonctions `getWeezeventEventsForSpace`/`updateWeezeventEventMetadata`/`syncWeezeventEventAttendees`) | **Vivant, mais scope = `SalesEvent`, PAS `Event`** | `StepProcessTimeline.vue` uniquement (wizard, étape 4) — voir Piège n°1, à ne pas confondre avec le domaine documenté ici |

**Piège vérifié** : `src/utils/eventApi.js` (monolithe legacy distinct de `event.api.js`, nom très
proche) est importé par `EventPredictView.vue:1167` (`import * as eventApi from
"../utils/eventApi"`) mais **aucun appel `eventApi.*` n'existe dans les 9192 lignes du fichier**
(grep exhaustif, déjà documenté dans `01_EVENT_PREDICT_ALGORITHME.md`) — import mort, ne pas le
prendre comme un second client vivant pour `Event`. Le fichier `eventApi.js` lui-même ne contient
que des données de seed mock (dont le `hasHomeTeam: true/false` codé en dur cité au Piège n°2, à ne
pas confondre avec le vrai champ `EventCategory.hasHomeTeam` persistant).

---

## Tableau récapitulatif — bugs et risques actifs de ce domaine (2026-07-15, non corrigés)

| # | Sujet | Détail | Fichiers |
|---|---|---|---|
| 1 | **Gating "Team" incohérent, deux écrans, deux comportements différents, aucun ne respecte `hasHomeTeam`** | `EventFormDrawer.vue` gate sur "une catégorie est choisie" (n'importe laquelle) ; `EventDetailsEditor.vue` n'a aucun gate du tout, `isSportType` calculé mais jamais utilisé | `EventFormDrawer.vue:207,237,272` ; `EventDetailsEditor.vue:145-190,617` |
| 2 | **`Event.revenue`/`transactionCount`/`avgSpendPerTx`/`perCapita`/`calculatedAt` ne sont jamais écrits** | `GET /analyse/kpis/events` (`analyse.service.ts:79-104`) additionne ces champs en supposant qu'ils sont peuplés → retourne structurellement `totalRevenue=0`/`avgRevenue=0`/`totalTransactions=0` pour tout tenant. Nuance : zéro composant frontend n'appelle `getAnalyseKpisEvents` (grep exhaustif) — ce n'est donc pas un widget visible cassé aujourd'hui, mais un pipeline mort-à-la-source si jamais câblé | `events.service.ts` (aucune écriture de ces champs) ; `analyse.service.ts:79-104` ; `analyse.api.js:44-49` (zéro appelant) |
| 3 | **Bulk-create du wizard ne reporte pas la taxonomie/l'enrichissement vers l'`Event` créé** | La création manuelle (`CreateEventDialog.vue`) copie eventType/category/subcategory/tickets ; la création en masse (`bulkCreateEvents`) ne copie que nom/dates/spaceId — un `SalesEvent` enrichi via `EnrichEventDialog` (catégorie/équipes/performer) perd cette information si l'événement est ensuite créé via le bulk plutôt qu'un par un | `StepProcessTimeline.vue:1173-1211` vs `CreateEventDialog.vue:499-514` |
| 4 | **`Event.spaceId`/`configurationId` sans FK Prisma → orphelins possibles à la suppression d'un espace** | `SpacesService.remove()` ne touche jamais la table `Event` ; aucune vérification d'appartenance tenant sur `spaceId`/`configurationId` à la création/édition d'un event | `spaces.service.ts:415-427` ; `events.service.ts:98-126,156-184` |
| 5 | **Commentaire obsolète dans `team.api.js`** | Affirme que `/teams` n'existe pas encore côté backend — faux, `TeamsController` est déployé et fonctionnel | `team.api.js:4-8` |

---

## Audit complémentaire du 2026-07-17 — bugs corrigés

Un second passage exhaustif (frontend `/events`, `/event-types`, `/event-categories`,
`/event-subcategories` + backend module Events, taxonomies, Teams, couche API
`predict-versions.*`) a mis au jour et corrigé 25 bugs supplémentaires (15 confirmés + 4
diagnostiqués côté frontend BUG-130 à 148 ; 10 confirmés + 3 diagnostiqués côté backend BUG-65 à
76), en plus des 5 déjà listés ci-dessus. Le plus sérieux : une faille cross-tenant P0 sur
`PredictVersionsService.setDefault` (aucun scoping tenant sur l'update — n'importe quel tenant
pouvait forcer la version par défaut d'un autre), corrigée et couverte par des tests (ce module
n'en avait aucun avant). Détail complet dans `docs/bugs/00_INDEX.md` (#130-148) et
`../../../api-datafriday-staging/docs/bugs/00_INDEX.md` (#65-76) — non reproduit ici pour éviter la
duplication. Quatre décisions produit restent en attente (voir fiches ⚪ Diagnostiqué #70, #75, #76
côté backend et #145-148 côté frontend), notamment : que faire des colonnes CSV events
`performerName`/`sponsor`/`openingActName`/`allSessions`, proposées au mapping d'import mais sans
aucun champ `Event` correspondant (BUG-136).

## Code mort de ce domaine (preuve : recherche exhaustive des appelants)

Un sous-arbre entier de l'ancien portage React du module Événements a été neutralisé plutôt que
corrigé, atteignable uniquement via `appCopy.vue` — lui-même **jamais importé nulle part**
(`grep -rln "appCopy" datafriday-web/src` : zéro résultat, y compris pour son propre nom en tant
que texte importé ailleurs). Chaîne complète, vérifiée fichier par fichier :

```
appCopy.vue  (orphelin — 0 importeur, absent du router)
 └─▶ ConsolidatedEventsView.vue
      ├─▶ EventsListPanel.vue        ─▶ EventsView.vue        ─▶ EventsImportWizard.vue, team.api.js (import mort)
      ├─▶ EventCategoriesPanel.vue   ─▶ EventCategoriesView.vue
      ├─▶ EventTypesPanel.vue        ─▶ EventTypesView.vue
      └─▶ EventSubcategoriesPanel.vue─▶ EventSubCategoriesView.vue
```

Les 4 vues `Events*View.vue`/`Event*CategoriesView.vue` de ce sous-arbre importent toutes
`CSVMappingDialog.vue` — lui-même **sans aucun importeur vivant** (ses 5 importeurs au total sont
tous morts : ces 3 vues + `HRSuppliersView.vue`/`StaffPositionsView.vue`, voir plus bas). Le vrai
import CSV du domaine (`CsvImportDrawer.vue`/`TaxonomyImportDrawer.vue`, écrans vivants) n'en
dépend pas — logique entièrement dupliquée avec `parseCSV` (`src/utils/csv.js`) en interne.

**`removeDuplicateCategories`** (dédup silencieuse de catégories au chargement) existe encore dans
`EventCategoriesView.vue:392` (appelée en `mounted()`), mais ce fichier n'est jamais routé — la
vraie route `/event-categories` utilise `EventsCategorieListView.vue`, qui ne contient aucune
logique de dédup. **Absent en prod aujourd'hui.**

**Module Staff/HR : porté visuellement, jamais raccordé à un backend** — trouvé dans le même
sous-arbre `appCopy.vue` (branche parallèle, pas la même que ci-dessus mais même racine morte) :
`ConsolidatedHRView.vue` → `HRSuppliersView.vue`/`StaffPositionsView.vue`, tous deux s'appuyant sur
`src/utils/hrApi.js` (131 lignes, **exclusivement `localStorage.getItem/setItem`**, zéro appel
réseau confirmé). Aucun module backend Staff/HR n'existe (`find -iname '*staff*'` côté
`api-datafriday-staging/src` ne retourne rien de pertinent). `MenuSuppliersView.vue` référence
aussi `hrApi.js`/`HRSuppliersView.vue` mais n'a lui-même **aucun importeur** dans tout le repo —
mort par transitivité également. Ce sous-arbre n'appartient pas au domaine "Événements" au sens de
la cartographie (pas de modèle Prisma dédié), mais partage sa racine morte `appCopy.vue` — mentionné
ici pour qu'un futur nettoyage du fichier orphelin sache qu'il emporte aussi cette branche.

---

## Zones grises restantes (points réellement non tranchés, pas des angles morts)

Chaque point ci-dessous a été activement vérifié dans le code ; ce sont des décisions produit non
encore prises, pas des questions laissées de côté.

- **`Event.spaceId`/`configurationId` sans FK** (Piège n°3) : accepter définitivement l'absence
  d'intégrité référentielle (cohérent avec le choix déjà fait de dénormaliser `spaceName` "au cas
  où"), ou introduire une vraie relation Prisma + `onDelete` explicite (cascade ou `SetNull`) le
  jour où la suppression d'espaces devient une opération courante. Actuellement personne n'a
  signalé d'incident lié à des events orphelins — risque dormant, pas un incident vécu.
- **`dfEventId` (lien `SalesEvent` ↔ `Event`) non consommé au-delà du wizard lui-même** :
  décision à prendre — soit ce lien mérite d'être exploité ailleurs (par ex. pour recharger
  automatiquement l'enrichissement Weezevent sur la fiche `Event`, ce qui fermerait aussi le Piège
  n°3 du bulk-create), soit son rôle reste durablement "état local du wizard uniquement" et le nom
  du champ (qui suggère un contrat plus large) devrait être documenté comme tel pour ne pas induire
  en erreur un futur lecteur.
- **`eventCategoryId` vs `categoryId` comme alias de body** sur `POST/PATCH /event-subcategories`
  (`events.service.ts:291,350`) : les deux noms sont acceptés côté backend, mais aucune trace dans
  ce backend n'explique pourquoi (pas de changelog, pas de commentaire) — vérifié qu'au moins un
  écran (`CreateEventDialog.vue`, wizard) envoie `categoryId` alors que `EventFormDrawer.vue`
  (écran `/events`) envoie `eventCategoryId` ; à trancher si l'un des deux doit être déprécié.
- **`numberOfSessions` vs `sessions.length`** : aucune validation croisée trouvée dans
  `events.service.ts` garantissant que les deux restent cohérents après une édition partielle
  (`PATCH` qui ne toucherait qu'un des deux champs). Pas de bug observé/reproduit à ce jour, juste
  une absence de garde-fou constatée.
- **`status` "draft" par défaut, non documenté par le commentaire du schéma** (qui ne cite que
  `"success"`/`"pending"`) : à clarifier si `"draft"` est une 3ᵉ valeur officielle du cycle de vie
  ou un oubli de mise à jour du commentaire du modèle.
