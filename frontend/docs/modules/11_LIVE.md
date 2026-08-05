# Live events — gestion temps réel (conception)

> **Statut : 🟢 Front (A→E) + backend (v1+v2) livrés, mergés dans `develop`. Reste : déploiement backend + question #34.**
> Toutes les greffes front sont écrites (bouton ◉ câblé sur `/live-status`, entrée Tools, route
> `space-live`, mode flux polling, **onglet Inventaire live E**) — détail §13. Le backend Live
> (`/spaces/:id/live-status`, `/live/inventory`, agrégation auto) est implémenté et documenté dans
> `backend/docs/api/LIVE_API_GUIDE.md`. **Reste** : (1) **déployer `develop` sur Render** — les
> endpoints Live renvoient 404 tant que ce n'est pas fait ; (2) question ouverte **#34** (◉ sur la
> Home sans naviguer). Cette page sera convertie en cartographie vérifiée une fois déployé.
>
> Domaine cartographie : **Live events** (nouveau). Owner : **Ulrich, fullstack** (backend temps réel/
> agrégation/spaces **et** front Analyse/Inventory) — pas de split front/back, décidé le 2026-07-23
> (voir §9). **Hors domaine Auth/RBAC (Emmanuel)** — le gating RBAC est un simple branchement (voir §9).
> Source : maquettes fournies le 2026-07-20 (2 captures : bouton Live sur la Home + entrée Tools).
> Rédigé le 2026-07-20.

---

## 1. Objectif

Quand un événement est **en cours** (des ventes arrivent en direct via **Weezevent** ou **Digifood**),
offrir un mode **Live** : une version *temps réel* de l'écran Analyse existant, qui se rafraîchit seule
pendant l'event, plus un **onglet Inventaire live** (niveaux de stock par shop / par item).

Le Live ne réinvente pas l'analyse — il **branche l'écran Analyse existant sur un flux** au lieu d'un
chargement ponctuel « All history ».

## 2. Points d'entrée UX (2)

1. **Carte d'espace sur la Home** (`/spaces`, `src/components/spaces/widgets/SpaceItem.vue`) : un bouton
   **◉ (rouge, « record »)** apparaît en haut à droite de la carte, **uniquement si l'espace a un event
   live**. À côté des icônes outils/éditer/supprimer existantes.
2. **Dropdown « Tools »** d'un espace — liste `toolboxItems` définie dans
   `src/components/analyse/filters/FilterPanel.vue:605-613`, navigation dans `onToolboxSelect()`
   (`:583-601`) : ajouter une entrée **« Live »** à la liste actuelle (Analyse, Predict, Event Predict,
   Pre-Inventory, Inventory, Logistic, Restock).
   ✅ **Ambiguïté résolue (vérifié 2026-07-23)** : `AnalyseView.vue:417` importe
   `analyse/filters/FilterPanel.vue` (1124 lignes, 7 entrées Tools, dernière modif 2026-07-20) — c'est
   le seul fichier vivant. `analyse/FilterPanel.vue` (707 lignes, 3 entrées Tools seulement, inchangé
   depuis le commit initial 2026-07-15) est mort/orphelin, à ignorer.

Les deux mènent à la même route Live de l'espace/event : **`/spaces/:id/live`** (route dédiée, tranché §10.3).

## 3. Contenu de l'écran Live

Base = l'écran Analyse (`src/components/analyse/AnalyseView.vue`) en mode flux :

- **Timeline temps réel** + **tous les KPI qui se rafraîchissent en direct** : Revenue, Per Cap,
  % Margin, **TX/min (transactions par minute)**, Event Revenue by shop, POS Performance.
- **Onglet Inventaire live** (nouveau) : niveau de stock **par Shop** (dépliable → détail des éléments
  stockables du shop) et **par Item** (dépliable → détail par shop pour chaque item), rafraîchi en direct.

## 4. Découpage des couches — le Live est full-stack, un seul owner

> Pas de split front/back par personne (décidé 2026-07-23, §9) — même owner sur les deux couches. La
> distinction ci-dessous reste utile pour l'ordre de dépendance (le front ne peut rien afficher tant que
> la couche backend correspondante n'existe pas), pas pour répartir le travail entre deux personnes.

| Couche | Responsabilité |
|---|---|
| **Backend** | Détecter « event live » ; exposer un flux temps réel (revenus/KPI + timeline + stock live) ; agréger l'inventaire par shop/item |
| **Frontend** | Bouton ◉ conditionnel, entrée Tools, route Live, écran Analyse en mode flux + onglet Inventaire live |

**Sans le flux backend, le front ne peut rien afficher de live.** La fondation est backend — à construire
en premier même en solo fullstack.

## 5. ✅ Décision n°1 (tranchée 2026-07-20) : le transport temps réel

**Polling pour le v1.** Aucun WebSocket/SSE/socket.io dans le repo (vérifié par grep) ; pas de raison
d'introduire cette complexité alors que le polling suffit à la fraîcheur réellement disponible côté
données (voir ci-dessous), et qu'aucune info du repo ne garantit le comportement du plan Render FREE
sur des connexions longues (spin-down, limites de connexions) — un risque à ne pas prendre sans
nécessité.

| Option | Coût | Remarque |
|---|---|---|
| **Polling** (le front re-fetch toutes les N s) | Faible | Réutilise les endpoints REST existants. **Retenu pour le v1.** |
| SSE (Server-Sent Events) | Moyen | Non retenu au v1 — à réévaluer en v3 (§11) si la fraîcheur du polling s'avère insuffisante en usage réel. |
| WebSocket | Élevé | Écarté — bidirectionnel, overkill pour de l'affichage seul. |

**⚠️ Correction d'une hypothèse fausse de la conception initiale** : contrairement à ce qui était
supposé ici (« l'agrégation est déjà périodique, donc la fraîcheur est de toute façon bornée »),
l'agrégation vers `SpaceRevenueMinuteAgg` **n'est jamais déclenchée automatiquement** — seulement à
la main via le wizard d'intégration (`aggregation.controller.ts` `POST /aggregation/process-events` /
`/synchronize`, gardés par `@RequirePermissions('menu.integration.fb')`). Aucun appelant automatique
(webhook ou cron) trouvé par grep. Conséquence directe :

- **`event-timeline`** (`spaces.service.ts:1045-1214`) lit **directement** `WeezeventTransaction` en
  SQL brut, sans cache, sans dépendre de cette agrégation — sa fraîcheur est déjà bornée uniquement
  par le webhook Weezevent (quasi instantané, `webhook.controller.ts:105-153` → resync immédiat via
  `setImmediate`) + le cron de fallback `EVERY_10_MINUTES` (`weezevent-cron.service.ts:30`). **Un
  simple polling de cet endpoint donne des données déjà fraîches, sans rien construire de neuf.**
  Reco : polling toutes les **15 s** pour la timeline / TX-par-minute (assez fin pour un ressenti
  temps réel, sans matraquer le backend).
- **`shop-details`** (KPI par shop, POS Performance) dépend en partie de `SpaceRevenueMinuteAgg` via
  la RPC `get_space_shop_details` (cachée 60 s, cf. BUG-92) — **peu importe le transport choisi, ces
  KPI resteront figés tant que rien ne déclenche l'agrégation automatiquement.**

**Prérequis backend bloquant révélé par cette analyse (à ajouter au chantier Live, pas dans la
conception initiale)** :
1. ✅ **Corrigé le 2026-07-23** (BUG-109, `backend/docs/bugs/109_aggregation_jamais_declenchee_automatiquement.md`) —
   `queueAggregationJob()` est maintenant déclenché automatiquement : (a) juste après le resync
   d'une transaction webhook (`webhook-event.handler.ts`, `triggerLiveAggregation`), scopé à l'event
   concerné ; (b) filet de sécurité `WeezeventCronService.triggerLiveAggregationSafetyNet()`
   (`@Cron(EVERY_5_MINUTES)`) qui rejoue l'agrégation de tout event encore dans sa fenêtre live ±3h,
   au cas où (a) aurait échoué ou manqué un event pas encore résolu. `shop-details` (POS Performance,
   KPI par shop) se met désormais à jour toute seule pendant un event live.
2. ✅ **Déjà corrigé** (vérifié en code le 2026-07-23, `backend/docs/bugs/19_queue_agregation_sans_retry.md`
   statut 🟢) — `queue.service.ts:271-284` ne hardcode plus `attempts: 1` ; la queue hérite désormais du
   défaut module `attempts: 3` + backoff exponentiel (`queue.module.ts:29-37`). Plus un prérequis, gardé
   ici pour mémoire.

## 6. Données & endpoints existants à réutiliser (ne pas repartir de zéro)

D'après [02_ANALYSE.md](02_ANALYSE.md) et [06_STOCK_INVENTAIRE.md](06_STOCK_INVENTAIRE.md) :

- **`GET /spaces/:id/event-timeline`** — déjà décrit comme *item-level, temps réel* : **le meilleur point
  d'ancrage** pour la timeline live.
- **`GET /spaces/:id/shop-details`** — shop-level pré-agrégé (KPI par shop / POS Performance).
- Modèles d'agrégats : `SpaceRevenueMinuteAgg` (minute × dimension), `SpaceProductRevenueDailyAgg`.
- Source du « live » : webhooks **Weezevent/Digifood** → `IntegrationWebhookEvent` → agrégation (backend
  `IntegrationsModule` + queue d'agrégation).
- Stock : les modèles/endpoints d'inventaire du domaine Stock (par shop/item) — à agréger « live ».

## 7. Contrats API proposés

> Esquisse, non contractuelle sauf mention « tranché ».

- **« Cet espace a-t-il un event live ? »** — ✅ **définition tranchée 2026-07-20** (question #20),
  calculée comme **« au moins une vente réelle (`WeezeventTransaction`/équivalent Digifood) ingérée
  dans les 30 dernières minutes, pour les shops mappés à cet event, dans la fenêtre
  `[eventStartDate, eventEndDate]` de l'`Event` »** — même logique de jointure par fenêtre de dates que
  `event-timeline` (`spaces.service.ts:1094-1112`), + une marge de garde (ex. ne pas considérer live
  avant `eventStartDate` ni plus de quelques heures après `eventEndDate`) pour éviter qu'une vente de
  test pré-event ou un règlement tardif post-event déclenche un faux live.
  ⚠️ **Précision 2026-07-23** : cette section mentionnait jusqu'ici un champ `liveEvent` sur la liste
  des spaces « ou » l'endpoint dédié, comme si c'était équivalent — ce n'est **pas** le cas.
  L'implémentation backend a tranché pour un **endpoint dédié uniquement**,
  `GET /spaces/:id/live-status` (`LIVE_API_GUIDE.md` §1.2), précisément parce qu'un champ calculé à la
  volée aurait cassé soit le cache Redis 60s de la liste (`SPACES_CACHE_TTL`), soit sa fraîcheur. Un
  webhook ne peut pas non plus s'y substituer côté front : Weezevent/Digifood n'appellent que le
  backend (`webhook.controller.ts`), jamais le navigateur — sans canal push (SSE/WebSocket, écarté au
  v1, §5), le front ne peut qu'aller *chercher* ce signal (pull), pas le recevoir passivement.
  Conséquence directe sur la greffe A (bouton ◉ sur la Home) : voir zone grise §10.6, **encore
  ouverte**.
  - **Ne pas** utiliser `IntegrationWebhookEvent.createdAt` comme signal direct : **BUG-26**
    (`backend/docs/bugs/26_dedup_webhook_event_inoperante.md`) montre que `externalDeliveryId` n'est
    jamais renseigné côté Weezevent, donc la dédup webhook est inopérante — un simple retry Weezevent
    créerait un nouveau timestamp sans vente réelle, faisant passer l'event à tort pour « live ».
    Le signal doit porter sur la donnée métier (vente ingérée), pas sur l'audit brut du webhook.
  - Seuil de 30 min choisi comme défaut raisonnable (couvre les creux normaux entre ventes pendant un
    event — changement de set, pause) ; ajustable si l'usage réel montre un besoin différent.
  - `Event.status` (`schema.prisma:2221`, texte libre, jamais écrit par le pipeline d'agrégation)
    n'est **pas** une source utilisable pour ce signal.
  - ⚠️ **Révision 2026-07-27** (Ulrich) : la définition ci-dessus exigeait implicitement qu'un
    `Event` DataFriday soit **déjà créé** avec une fenêtre `[eventStartDate, eventEndDate+grâce]`
    couvrant l'instant présent — sans ça, `getLiveStatus` retournait `isLive:false`
    inconditionnellement, même si de vraies ventes arrivaient (cas : event non saisi à l'avance).
    Assoupli : si **aucun** Event ne couvre l'instant présent, une vente réelle seule dans la
    fenêtre glissante de 30 min suffit désormais à ancrer le live (`eventId:null` dans ce cas,
    le contrat `{isLive,eventId,since}` autorise déjà `eventId` non-corrélé à `isLive`). Quand un
    Event existe et couvre l'instant présent, comportement inchangé (fenêtre bornée par
    `eventStartDate`, garde-fou anti-vente-de-test-pré-event toujours actif dans ce cas).
    Implémenté dans `spaces.service.ts` `getLiveStatus`.
- **Flux analytics live** — polling de `event-timeline` (déjà quasi temps réel, voir §5) et de
  `shop-details` (sous réserve du prérequis d'agrégation automatique, §5) ; pas de canal SSE au v1
  (§5).
- **Inventaire live** : ✅ **tranché le 2026-07-23** (question #22) — `GET /spaces/:id/live/inventory`
  → arbre shop → items stockables ET item → shops (index inversé), réutilisant tel quel le calcul
  déjà en production du module Logistic (`LogisticsService.getStock`, combinaison `StockLevel` +
  décrément par vente en temps réel) avec la granularité par défaut (`readyForSale`, comme le
  Réarmement — pas l'override Space Inventory de la question #13). Détail :
  `api-datafriday-staging/docs/api/LIVE_API_GUIDE.md` §3.

## 8. Découpage en tâches

> Fullstack, un seul owner (§9) — l'ordre ci-dessous reste la dépendance réelle (backend avant front),
> pas une répartition entre deux personnes.

**Backend — fondation**
1. Câbler le déclenchement automatique de l'agrégation (§5, prérequis 1 — toujours ouvert).
2. Définir et exposer le signal « event live » (§7).
3. Choisir le transport (§5, déjà tranché : polling) et exposer le flux analytics.
4. Exposer l'agrégat inventaire live par shop/item (bloqué par #22, §10.4).

**Frontend — consommation** (points d'insertion vérifiés le 2026-07-20, cible FilterPanel reconfirmée le 2026-07-23)
5. Bouton ◉ conditionnel dans `SpaceItem.vue` (nouveau, hors `.si-actions` qui est hover-only ; affiché
   si `space.liveEvent`) → `router.push('/spaces/:id/live')`.
6. Entrée « Live » dans `analyse/filters/FilterPanel.vue:605-613` (`toolboxItems`) + `onToolboxSelect()`
   (`:583-601`) + `livePath` computed (sur le modèle de `restockPath:571-574`) ; route enfant
   `space-live` dans `router/index.js` après `space-restock` (`meta.permission`).
7. Mode flux de `AnalyseView.vue` : relancer les loaders existants (`useAnalyseTimeline:529`,
   `useAnalyseItemRecords:549`, `useSpaceData`) sur un intervalle + badge « ● LIVE » ; nettoyer à l'unmount.
8. Onglet Inventaire live (seule nouvelle UI) : réutiliser `useInventoryData.js` + arbre shop/item dépliable
   (bloqué par #22, comme la tâche backend 4).

## 8bis. Points d'insertion front — vérifiés contre le code le 2026-07-20

> Poids : 🟢 léger (greffe) · 🟡 moyen · 🔴 nouvelle UI à construire.

| # | Greffe | Fichier & ancrage | Nature | Poids | Prérequis backend |
|---|---|---|---|---|---|
| A | Bouton ◉ live | `SpaceItem.vue` — nouvel élément dans `.si-img`, **hors** `.si-actions` (hover-only, `:14-24`) ; condition d'affichage **encore à trancher** (§10.6) → `router.push('/spaces/:id/live')` | Ajout | 🟡 | ⚠️ pas de champ sur la liste (décidé contre, §7) — nécessite soit un appel `live-status` par carte (polling Home), soit un report de l'affordance après entrée dans l'espace, voir §10.6 |
| B | Entrée « Live » dans Tools | `analyse/filters/FilterPanel.vue` — `toolboxItems` `:605-613`, handler `onToolboxSelect():583-601`, + `livePath` computed (près de `restockPath:571-574`) | Ajout | 🟢 | — |
| C | Route `space-live` | `router/index.js` — route enfant après `space-restock` (`:184`), `meta:{ permission, keepAlive }` ; guard permission déjà en place (`:460`) | Ajout | 🟢 | code de permission (voir §9) |
| D | Mode « flux » de l'Analyse | `analyse/AnalyseView.vue` — relancer `useAnalyseTimeline:529` / `useAnalyseItemRecords:549` / `useSpaceData` sur intervalle + badge « ● LIVE », nettoyage à l'unmount | Modif comportement | 🟡 | endpoint(s) de flux ou cible de polling |
| E | Onglet Inventaire live | nouveau composant — réutilise `useInventoryData.js`, arbre dépliable Shop → items / Item → shops | **Nouvelle UI** | 🔴 | ✅ disponible : `GET /spaces/:id/live/inventory` |

✅ **Dette résolue (greffe B, vérifié 2026-07-23)** : `AnalyseView.vue:417` importe bien
`analyse/filters/FilterPanel.vue` — c'est la cible de greffe. `analyse/FilterPanel.vue` est mort/orphelin,
ne pas y toucher.

### Prérequis backend (sans eux, A / D / E n'affichent rien)

1. 🟢 **Signal « event live »** — `GET /spaces/:id/live-status` implémenté et testé. ⚠️ Suffit pour
   D/E (l'utilisateur est déjà dans l'espace) mais **pas** pour la greffe A telle que décrite plus
   haut (bouton ◉ sur la Home, avant navigation) — voir la zone grise encore ouverte, §10.6.
2. 🟢 **Flux analytics live** — polling (§5) ; déclenchement automatique de l'agrégation câblé
   (BUG-109) : `shop-details` n'est plus figé.
3. 🟢 **Agrégat inventaire live** par shop/item — `GET /spaces/:id/live/inventory` implémenté et
   testé (§10.4, question #22), réutilise `LogisticsService.getStock`.

## 9. Ownership & RBAC (branchement, pas un chantier)

- Module **hors Auth/RBAC** : côté gating, il suffit d'exposer la route/entrée Tools derrière un code
  de permission existant. Voir [../utiles/RBAC_SYSTEM.md](../utiles/RBAC_SYSTEM.md).
- ✅ **Découverte 2026-07-20** : le code `front.fb.live` **existe déjà** dans
  `backend/src/core/rbac/permission-catalog.ts:61` (`SYSTEM_PERMISSIONS`), présent depuis le commit
  initial du repo (2026-07-15, `8bf2429`) — **5 jours avant cette conception**. Déjà assigné par
  défaut aux rôles système « Analyste F&B » et « Achat F&B » (ADMIN l'a aussi via `ALL_CODES`). Le
  catalogue est idempotent et auto-appliqué (`ensureSystemPermissionCatalog()`, seed +
  `OnboardingService` au clonage de rôle) : **le code existe déjà en base pour tout tenant déjà
  onboardé — aucune migration ni backfill à écrire.** Il y a même une affordance front déjà câblée
  dessus : `frontend/src/components/BurgerMenu.vue:65-67` (`v-if="can('front.fb.live')"`,
  `@click="handleMenuClick('live')"`). ⚠️ **Précision 2026-07-23** : contrairement à ce que
  supposait la version précédente de cette page, `BurgerMenu` **est** monté dans l'app (via
  `AppHeader`, présent sur la quasi-totalité des vues) — l'entrée de menu est donc déjà visible aux
  utilisateurs autorisés, juste sans destination câblée (`handleMenuClick('live')` ne fait rien
  aujourd'hui). À brancher sur la route `space-live` une fois créée (greffe C).
- Le point ouvert n'est donc **plus** « quel code de permission » mais uniquement : réutiliser
  `front.fb.live` tel quel (recommandé, déjà en place), ou l'étendre à d'autres rôles si besoin —
  décision produit, pas technique.
- ✅ **Ownership tranché le 2026-07-23** : pas de split front/back — **un seul owner fullstack**
  (Ulrich) sur tout le module Live, backend et front. La distinction Backend/Frontend des §4/§8 sert
  uniquement à ordonner le travail (fondation backend avant consommation front), plus à répartir entre
  personnes.

## 10. Zones grises

1. ✅ **Transport temps réel** : **polling**, tranché §5.
2. ✅ **Définition de « event live »** : signal basé sur la vente réelle, pas le webhook brut, tranché §7.
3. ✅ **Route** : **route dédiée** `/spaces/:id/live` (nom `space-live`), pas un paramètre `?live=1`.
   Raison : Live comprend un **nouvel onglet Inventaire** (§3), qui n'est pas un simple mode
   d'affichage de l'écran Analyse existant — contrairement à Predict/Event Predict qui, eux, sont de
   vraies variantes de la même vue et justifient à eux le pattern `?toolbox=` déjà en place
   (`AnalyseView.vue:1230-1254`). Le précédent le plus proche est `space-inventory`/`space-restock`
   (route dédiée + `meta.keepAlive: true`), pas le mode query-param. Implique :
   - Route enfant `space-live` dans `router/index.js`, après `space-restock` (comme prévu §8bis greffe
     C), avec `meta: { title: 'Live', keepAlive: true, permission: 'front.fb.live' }` — permission déjà
     cataloguée, voir §9.
   - `keepAlive: true` à poser explicitement (contrairement au mode query-param sur `space-analyse`,
     qui n'en a pas besoin car son component ne remonte jamais sur changement de query — clé sur
     `route.path`, `DashboardView.vue:288-299`).
   - Ne pas ajouter `space-live` à `SPACE_SCREENS` (`router/guards.js:108-114`, utilisé par
     `spaceEntryGuard` pour choisir le 1er écran d'un rôle) sauf si un rôle porte `front.fb.live` sans
     autre permission d'espace — à date, les deux rôles qui l'ont (« Analyste F&B », « Achat F&B », §9)
     ont vraisemblablement d'autres accès ; à vérifier si un rôle plus restreint est créé plus tard.
4. ✅ **Inventaire live** : **combinaison** (mouvements Restock + décrément par vente en temps réel),
   réutilisation telle quelle du calcul déjà en production du module Logistic, granularité par défaut
   (`readyForSale`, comme le Réarmement) — tranché le 2026-07-23, question #22.
5. ✅ **Cardinalité event/espace** : **un seul event live par espace** à un instant T. Le bouton ◉ et
   l'écran Live ciblent donc toujours un event unique — pas de sélecteur multi-event à construire (pas
   d'impact sur A/B/C/D ni sur l'onglet Inventaire E, qui restent scopés à l'espace).
6. 🔴 **Encore ouverte (2026-07-23)** — **Signal ◉ sur la Home, sans navigation** (greffe A) :
   `GET /spaces/:id/live-status` est un endpoint dédié, pas un champ sur `GET /spaces` (§7) — donc
   `SpaceItem.vue` ne peut pas lire `space.liveEvent` comme le supposait la v1 de cette page. Aucun
   canal push disponible pour éviter l'appel explicite (pas de SSE/WebSocket au v1, §5 ; les webhooks
   Weezevent/Digifood n'atteignent que le backend, jamais le navigateur). Deux options posées, ni
   l'une ni l'autre tranchée :
   - **(a)** Polling `live-status` par carte affichée sur la Home (ex. 60s, tant que la Home est
     montée) — préserve l'intention UX du point d'entrée #1 (§2) au prix de N appels/60s (N = spaces
     affichés ; audience déjà limitée par `front.fb.live`).
   - **(b)** Le bouton ◉ n'apparaît qu'une fois l'utilisateur entré dans l'espace (ex. dans
     `AnalyseView.vue`) — zéro coût réseau ajouté sur la Home, mais la carte ne sert plus de raccourci
     direct vers un event live.
   - Une 3e piste (reconsidérer SSE/WebSocket pour pousser ce signal) impliquerait de rouvrir la
     décision transport déjà tranchée §5 — hors périmètre de ce chantier sauf décision explicite
     contraire.
   Tracké : [../QUESTIONS_A_BERTRAND.md](../QUESTIONS_A_BERTRAND.md), question #34. **Bloque
   uniquement la greffe A** — B/C/D/E peuvent démarrer sans attendre cette décision.

> Réponses 1-3 tranchées le 2026-07-20 par Ulrich (owner backend), sur la base d'une recherche
> approfondie du code réel (webhook/queue d'agrégation, modèle `Event`, catalogue RBAC, router front) ;
> réponses 4 et 5 tranchées le 2026-07-23 par l'utilisateur — détail dans
> [../QUESTIONS_A_BERTRAND.md](../QUESTIONS_A_BERTRAND.md), questions #19-#23 (toutes résolues).
> **Point 6 reste ouvert** — bloque uniquement la greffe A (§8bis), pas le reste du module.

## 11. Phasage proposé

> Indicatif — à confirmer une fois le transport (§5) tranché.

- **v1 — « Live analytics » (le minimum utile)** : signal event-live (backend) + bouton ◉ (A) + entrée
  Tools & route (B, C) + mode flux de l'Analyse par **polling** (D). Livre l'écran live sans nouvelle UI
  lourde. C'est le socle démontrable.
- **v2 — « Live inventory »** : agrégat inventaire live (backend) + onglet arbre shop/item (E). La seule
  vraie nouvelle interface ; peut suivre v1 sans le bloquer.
- **v3 (optionnel)** : passage du polling à SSE/WebSocket si la fraîcheur du polling s'avère insuffisante.

## 12. À valider par le lead avant démarrage

> Le module ne démarre pas tant que ces points ne sont pas actés. Rien n'est implémenté à ce stade.

- [x] **Transport temps réel** (§5) — **tranché : polling v1**. 🟢 Prérequis backend additionnel
      **corrigé le 2026-07-23** (backend BUG-109) : déclenchement automatique de l'agrégation câblé
      (post-webhook + cron de secours) — `shop-details` se met désormais à jour toute seule. Détail
      côté backend : `api-datafriday-staging/docs/api/LIVE_API_GUIDE.md` §1-§2,
      `docs/bugs/109_aggregation_jamais_declenchee_automatiquement.md`.
- [x] **Définition de « event live »** (§10.2 / §7) — **tranchée** : vente réelle < 30 min dans la
      fenêtre event, pas le webhook brut.
- [x] **Forme de la route** (§10.3) — **tranchée : route dédiée `space-live`**, `keepAlive: true`.
- [x] **Source du stock live** (§10.4) et périmètre de l'onglet inventaire — **tranché le
      2026-07-23** : combinaison, réutilisation du calcul Logistic, granularité par défaut.
- [x] **Cardinalité event/espace** (§10.5) — **tranchée le 2026-07-23 : un seul event live par espace.**
- [x] **Permission RBAC** de la route (§9) — **`front.fb.live` existe déjà** dans le catalogue, aucun
      seed/backfill à faire.
- [x] **Ownership** (§9) — **tranché le 2026-07-23 : fullstack, un seul owner (Ulrich)**, pas de split
      front/back.
- [x] **Phasage** (§11) — v1 analytics d'abord, v2 inventaire.
- [ ] **Signal ◉ sur la Home sans navigation** (§10.6, greffe A) — **encore ouvert (2026-07-23)** :
      polling `live-status` par carte, ou affordance reportée après entrée dans l'espace. Question #34.

**Le backend du module Live (v1 + v2) est entièrement livré** (signal `GET /spaces/:id/live-status`,
agrégation auto, `event-timeline`/`shop-details` fiables pour du live, `GET /spaces/:id/live/inventory`
— `api-datafriday-staging/docs/api/LIVE_API_GUIDE.md`). **Le front peut démarrer les greffes B/C/D/E
sans blocage.** Seule la greffe A (bouton ◉ sur la Home) reste bloquée le temps de trancher §10.6 —
implémenter B/C/D/E en premier, ou trancher §10.6 avant d'écrire A, plutôt que de deviner.

## 13. État d'avancement (2026-07-23)

**Front v1 « Live analytics » — livré** (greffes vérifiées contre le code actuel ; points d'insertion
§8bis re-confirmés) :

| Greffe | Fichier | Statut |
|---|---|---|
| **A** — bouton ◉ | `spaces/widgets/SpaceItem.vue` (`.si-img`, appel `GET /spaces/:id/live-status` au montage, gardé par `front.fb.live`) | ✅ **livré** — câblé sur le **vrai signal** (endpoint dédié `live-status`, PAS un champ `liveEvent` — §7/§10.6) ; ◉ + tooltip « live depuis X min » via `since` |
| **B** — entrée « Live » Tools | `analyse/filters/FilterPanel.vue` (`toolboxItems` + `onToolboxSelect` + `livePath`) + clé i18n `anToolLive` | ✅ livré (c'est bien `filters/FilterPanel.vue` qui est importé par `AnalyseView`, pas le doublon racine) |
| **C** — route `space-live` | `router/index.js` après `space-restock` → rend `AnalyseView`, `meta:{ title:'Live', keepAlive:true, permission:'front.fb.live' }` | ✅ livré — **non** ajoutée à `SPACE_SCREENS` (§10.3) |
| **D** — mode flux | `analyse/AnalyseView.vue` : `isLive` (route), badge ● LIVE, polling 15 s de la timeline **et** du snapshot shop-details (`refreshLiveShopSnapshot`, corrigé 2026-08-04 — voir §14), cleanup `onActivated/onDeactivated/onBeforeUnmount` | ✅ livré |
| **E** — onglet Inventaire | `analyse/panels/LiveInventoryPanel.vue` + onglets « Analyse/Inventaire » dans `AnalyseView` ; API `getSpaceLiveInventory` | ✅ **livré (v2)** — arbre dépliable Shop→items / Item→shops sur `GET /spaces/:id/live/inventory`, « restant » = level − consumption (repack), colonne Consommé, polling 15 s, dark mode (#22/#23 tranchées) |

**Limites v1 assumées (fidèles à §5)** — ce qui n'est PAS rafraîchi en live et pourquoi :

- ✅ **Corrigé depuis, contrairement à ce que disait cette section jusqu'au 2026-08-04** :
  `useAnalyseItemRecords` expose bien un `refresh()` (`AbortController` + `bypassCache: true`,
  `useAnalyseItemRecords.js:114-145`), appelé à chaque tick par `livePoll()`
  (`AnalyseView.vue:1681`, via `refreshItemRecords()`). Les records article sont donc rafraîchis en
  live comme le reste.
- **Effectivement live au v1** : la **timeline / TX-min** (`event-timeline` via `loadTimelineForEvents`),
  seule source déjà quasi temps réel (§5), rafraîchie quand la timeline est ouverte, **et** `loadSpace`/
  `shop-details` (KPI par shop, POS Performance, `menuItemCostMap` pour la marge), désormais sur le
  même intervalle 15s (voir révision 2026-07-29 : ancien throttle 45s corrigé, faisait dériver la
  marge affichée jusqu'à 30s derrière le CA), **et** les records article (`useAnalyseItemRecords`,
  correction ci-dessus) **et** les paniers (`refreshBaskets()`, cache session propre `_basketCache`).

### ✅ Dette de perf trouvée ET corrigée le 2026-08-04 — `liveShopDetailsPoll()` relançait tout le bootstrap de l'espace

Jusqu'au 2026-08-04, chaque tick de 15 s appelait `store.dispatch('analyse/loadSpace', { spaceId,
isLive })` dans le seul but de rafraîchir `shop-details` (KPI par shop, marge). Mais `loadSpace`
dispatchait `useSpaceDataFetch` → `fetchSpaceData`, **le chargeur complet de l'espace** :
`getSpace`, `getSpaceConfigurations`, `getSpaceShopDetails`, puis en fond `getAllMenuItems`,
`getSpaceShopGranular` (heavy join), `getProductTypes/Categories`, `getWeezeventProducts`,
`getProductMappings`, `getIngredients`, pagination complète de `/menu-components` (+ fetch de
détail par composant manquant sa recette), `getAllPackagingTypes`. Le cache 15 min (`CACHE_TTL`)
ne bloquait jamais ce dispatch : il décidait seulement si l'appel était *attendu* (chargement
initial) ou lancé *fire-and-forget* en fond (revalidation), pas s'il avait lieu — donc même avec
un cache frais, le bootstrap complet repartait à chaque tick. Un onglet Live laissé ouvert 10 min
déclenchait ~40 exécutions complètes de ce fan-out pour ne réellement changer que le CA par shop.
**Corrigé** : `liveShopDetailsPoll()` dispatche désormais `analyse/refreshLiveShopSnapshot`, un
chemin dédié à 2 requêtes réseau. Détail de l'implémentation : §14 ci-dessous.

**Reste à faire** : le front (A→E) **et** le backend (v1+v2, cf. `backend/docs/api/LIVE_API_GUIDE.md`)
sont **livrés et mergés dans `develop`**. Reste : (1) **déploiement backend** sur Render (endpoints
Live en 404 tant que `develop` n'est pas déployé) ; (2) **question #34** — ◉ sur la Home sans
naviguer (aujourd'hui : `live-status` par carte, N requêtes — décision perf à acter) ; (3)
finitions optionnelles (« Restant » sur lignes repliées, TTL cache events 2 min en mode Live —
réponse Q8). Double-header de `space-live` corrigé (BUG-234).

⚠️ **Précision 2026-08-04 sur le filtrage par permission du toolbox** : la doc laissait entendre (via
BUG-243-01) que l'entrée « Live » manquait dans 4 des 5 listes `toolboxItems` dupliquées. Vérifié
en code : ce n'est plus le cas — `SpaceRestockView.vue`, `SpaceInventoryView.vue`,
`SpaceLogisticView.vue` et `useEventPredictHeaderNav.js` ont tous une entrée `live` avec
`permission: 'front.fb.live'`. Le trou réel, toujours ouvert, est localisé et plus large que
documenté : `analyse/filters/FilterPanel.vue:631-640` (`toolboxItems` du dropdown Outils
d'**Analyse**, y compris l'écran Live lui-même) n'a **aucune** clé `permission` sur ses 8 entrées —
un utilisateur sans le droit voit toutes les entrées et se fait rediriger silencieusement par le
guard router au clic, plutôt que de ne pas les voir. Pas de fuite de données (le guard bloque bien
la navigation), mais UX confuse. La cause structurelle (duplication de `toolboxItems` sur 6
fichiers) reste non traitée.

## 14. Snapshot live découplé du bootstrap catalogue — ✅ implémenté 2026-08-04

> Investigation + implémentation le 2026-08-04. Objectif atteint : `liveShopDetailsPoll()` ne
> rafraîchit plus que ce qui change réellement pendant un event (ventes), sans rejouer le
> chargement catalogue de l'espace (menu items, ingrédients, packaging, produits/mappings
> Weezevent) à chaque tick de 15 s.

**Diagnostic précis** : `fetchSpaceData` (`useSpaceData.js:69`) a deux vagues avec des durées de
vie très différentes — phase 1 (`space`, `configurations`, `getSpaceShopDetails`, `events`) et
phase 2a/2b (`getAllMenuItems`, `getSpaceShopGranular`, `getProductTypes/Categories`,
`getWeezeventProducts`, `getProductMappings`, puis `getIngredients`, pagination
`/menu-components` + fan-out détail, `getAllPackagingTypes`). Or c'est **`shopGranularData`**
(peuplé par `getSpaceShopGranular` en phase 2a, pas par le `shops` de la phase 1) qui alimente
tous les KPI par shop, « Event Revenue by shop » et « POS Performance »
(`analyse.js:526,888,1573,1590` — tout lit `state.shopGranularData`). Le `details.shops` de la
phase 1 n'est même stocké nulle part (vérifié : aucun commit ne le lit). Ce qui doit vraiment
tourner toutes les 15 s se réduit donc à **deux endpoints** : `getSpaceShopGranular` (KPI/shop) et
`getSpaceShopDetails` (`menuItemCostMap` + `summary`, pour la marge) — pas aux ~10 autres appels
catalogue du bootstrap complet, qui ne changent pas pendant un event (un menu/ingrédient/packaging
n'est pas édité en plein service).

**Contrainte à respecter** : `getSpaceShopGranular` renvoie des lignes brutes ; elles doivent être
enrichies via `enrichGranularMenuDimensions(rows, menuItems, productTypes, productCategories,
weezeventProducts, weezeventProductMappings)` avant d'être exploitables. Ces 5 catalogues sont
déjà en store (`state.menuItems`, `state.productTypesList`/`productCategoriesList` via
`SET_TAXONOMY`, `state.weezeventProducts`, `state.weezeventProductMappings`) depuis le bootstrap
initial (non-live, au premier `loadSpace`) — pas besoin de les refetch, seulement de les relire.

**Implémentation (respecte le pattern `.vue → composable → store action → api` de ce repo, SOLID)** :

1. **SRP** — `fetchLiveShopSnapshot(spaceId, { menuItems, productTypes, productCategories,
   weezeventProducts, weezeventProductMappings })`, nouvelle fonction pure dans
   `useSpaceData.js` (fin de fichier) : appelle en parallèle *seulement* `getSpaceShopGranular` +
   `getSpaceShopDetails`. La normalisation `revenue`/`enrichGranularMenuDimensions`, auparavant
   écrite en dur dans `loadEnrichment`, a été extraite en helper module-privé
   `normalizeAndEnrichGranular()` (juste après `normalizeList`) — réutilisé par les DEUX chemins
   (bootstrap complet et snapshot live) pour qu'ils ne puissent jamais diverger. Ne dépend d'aucun
   store (les 5 catalogues sont injectés par l'appelant) : reste testable en isolation, cohérent
   avec le reste de `useSpaceData.js` qui n'importe pas Vuex.
2. **Nouvelle action de store dédiée** `analyse/refreshLiveShopSnapshot({ spaceId })`
   (`store/modules/analyse.js`, juste après `useSpaceDataFetch`) : lit les 5 catalogues depuis
   `state`, appelle la fonction ci-dessus, puis commit **seulement** `SET_SHOP_GRANULAR`,
   `SET_MENU_ITEM_COST_MAP` (merge, même logique que `useSpaceDataFetch`) et `SET_SUMMARY`. Ne
   touche ni `SET_SPACE`, ni `SET_CONFIGURATIONS`, ni `SET_EVENTS`, ni les catalogues
   (`SET_MENU_ITEMS`, `SET_INGREDIENTS`, `SET_COMPONENTS`, `SET_WEEZEVENT_PRODUCTS`,
   `SET_WEEZEVENT_PRODUCT_MAPPINGS`) — c'est précisément ce périmètre réduit qui élimine le
   fan-out. **OCP** : `loadSpace`/`useSpaceDataFetch` sont **inchangées**, tous leurs autres
   appelants (chargement initial d'Analyse/Restock/Inventory/Logistic/EventPredict) continuent de
   fonctionner à l'identique — c'est un nouveau chemin ajouté, pas une modification de l'existant.
3. **`AnalyseView.vue::liveShopDetailsPoll()`** dispatche désormais
   `analyse/refreshLiveShopSnapshot` au lieu de `analyse/loadSpace`. Le premier chargement de la
   page (mount, `ensureAuthAndLoad`) continue de passer par `loadSpace` classique — le catalogue
   complet est bien chargé une fois ; seuls les ticks *suivants* de 15 s deviennent légers.
4. **Garde de concurrence** — corrigée aussi sur `LiveInventoryPanel` (point 🟠 #3 de l'audit
   2026-08-04, même trou) : jeton de requête monotone (`liveShopSnapshotRequestId` au niveau
   module dans `analyse.js`, `_invReqId` en data locale dans `LiveInventoryPanel.vue`) — une
   réponse qui arrive après une plus récente est ignorée sans être commitée. Pas
   d'`AbortController` : `getSpaceShopGranular`/`getSpaceShopDetails`/`getSpaceLiveInventory` ne
   portent pas de signal réseau annulable à ce jour ; le jeton suffit à empêcher l'écrasement par
   une réponse périmée, seul risque réel identifié.
5. **Non traité par cette conception, à trancher séparément si besoin** : le catalogue (menu
   items/prix/ingrédients) peut en théorie changer pendant un event long (correction de prix en
   plein service). Si ça s'avère un besoin réel, un resync catalogue complet à intervalle plus
   long (ex. 5 min, séparé du timer 15 s) serait la bonne réponse — pas construit tant qu'aucun
   besoin concret ne le confirme.

**Effet mesuré** : le tick live passe de ~10-12 requêtes (dont une pagination `/menu-components`
+ fan-out détail par composant) à **2 requêtes**, sans changer le résultat visible à l'écran (les
mêmes données alimentaient déjà KPI/marge/Revenue by shop) — élimine la charge DB inutile
identifiée au point 🔴 de §13, à charge auparavant multipliée par le nombre d'onglets/utilisateurs
restant sur `/spaces/:id/live` pendant un event. Suites `analyseStore.spec.js` (40 tests) et
`useSpaceDataWaves.spec.js` vertes après implémentation ; pas de test dédié au nouveau chemin
`refreshLiveShopSnapshot`/`fetchLiveShopSnapshot` à ce stade (à ajouter si ce module reçoit
d'autres évolutions).

### 🔴→✅ Régression trouvée et corrigée le 2026-08-05 — un nouvel event n'apparaissait jamais sans recharger la page

Le découplage ci-dessus a été fait un peu trop strict : `refreshLiveShopSnapshot` ne rafraîchissait
QUE `shopGranularData`/`menuItemCostMap`/`summary` — plus jamais `state.analyse.events`. Or
`applyLiveScope()` (`AnalyseView.vue`) résout bien un `eventId` frais à chaque tick (il appelle
`/live-status` directement, indépendamment du store), mais `filteredEvents`
(`store/modules/analyse.js:829`) part de `state.events` et filtre par `selectedEventIds` — un event
qui n'existe pas encore dans `state.events` au moment du premier chargement de la page (ex. un event
QA créé par `ensureTodaySalesEvent` pendant que Live était déjà ouvert) ne pouvait donc **jamais**
apparaître tant que la page restait ouverte : `filteredEvents` retombait à `[]`, écran Live
complètement vide malgré un vrai signal live détecté côté backend (vérifié : `getLiveStatus`
recalculé à la main renvoyait bien `isLive:true`, données saines en base — la régression était
strictement frontend).

**Corrigé** : `fetchLiveShopSnapshot` (`useSpaceData.js`) ajoute un 3e appel léger, `getEvents({
spaceId, limit: 200, excludeSimulated: false })` — une seule requête liste, pas le catalogue, donc
sans réintroduire la dette de perf du point ci-dessus. `excludeSimulated:false` : ce chemin ne
tourne qu'en mode Live, où voir son propre trafic de test (QA) est le but recherché, même règle que
`fetchSpaceData` en mode live (§7). `refreshLiveShopSnapshot` commit `SET_EVENTS` seulement si le
fetch a réussi (`events !== null` — sentinelle qui distingue « échec réseau, garder l'ancienne
liste » de « l'espace n'a vraiment aucun event », les deux donnant `[]` après normalisation sinon).
Tests ajoutés : `useSpaceDataWaves.spec.js` (2 tests, dont le cas d'échec réseau).

## 15. Stock Live initialisé depuis Event Predict — ✅ implémenté 2026-08-05

> Jusqu'ici, le stock de l'onglet Inventaire live (§3, §7) ne pouvait être initialisé que par un
> reset manuel du module Logistic (comptage physique). L'utilisateur a demandé que le stock de
> départ d'un event live soit celui **prédit/configuré dans Event Predict** (onglet Stock Up), les
> mouvements (ventes en temps réel, transferts, resets ultérieurs) continuant à s'appliquer
> par-dessus exactement comme aujourd'hui.

**Déclenchement : manuel uniquement** (décision produit) — un bouton « Initialiser depuis Event
Predict » dans la toolbar de `LiveInventoryPanel.vue`, avec confirmation (`v-dialog`). Aucune
écriture stock automatique au passage en live : le staff peut avoir déjà fait un comptage manuel
juste avant, une écriture silencieuse l'aurait écrasé sans prévenir.

**Aucun changement backend** — la feature réutilise TEL QUEL le mécanisme de reset Logistic déjà en
production :

```
bouton confirmé
  → useLiveStockInit.initFromEventPredict(spaceId, eventId, eventName)
  → GET /events/:eventId/predict-versions (listEventPredictVersions, déjà existant)
  → sélection de la version isDefault (sinon la 1re) — même priorité que
    SpaceRestockView.activeVersionForEvent (`:3119-3134`)
  → configuration = store.state.analyse.configurations.find(c => c.id === event.configurationId)
    (même lookup qu'EventPredictView.vue:1962-1977)
  → buildStockRequirements({ configuration, menuItems, components, predictedRecords,
    selectedMenuItems: version.menuConfig, quantityAdjustments, manualQuantities })
    (utils/stockPlanning.js — fonction pure déjà utilisée par Restock)
  → conversion en lignes ResetLineDto (countedLoose = totalQuantity, countedPacked = 0)
  → store.dispatch('logistics/reset', { spaceId, eventId, eventName, lines })
    (action Vuex déjà existante → POST /logistics/:spaceId/reset, LogisticsService.reset())
```

`StockLevel` n'a pas de notion d'event (`logistics.service.ts` — c'est `StockReconciliation.createdAt`
qui sert d'ancre pour dériver la consommation, cf. §14) : créer une réconciliation avec les
quantités Event Predict fait mécaniquement de ce moment la nouvelle ancre, exactement comme un
reset manuel — seule la provenance des quantités change. Zéro migration de schéma.

**`buildStockRequirements()` étendue** (`utils/stockPlanning.js`) avec un paramètre optionnel
`manualQuantities` (défaut `{}`, rétrocompatible — comportement de Restock inchangé, vérifié par
`stockPlanningUnavailable.spec.js`/`stockPlanningSharedComponent.spec.js` toujours verts). Reprend
la sémantique de `EventPredictStockUpSection.getAdjustedQuantity()` : pour un item à prédiction 0,
la quantité manuelle sert de **base**, mise à l'échelle par le même slider % que la prédiction —
pas un simple override du résultat final. Live et Restock partagent désormais le même calcul
complet, au lieu d'une 3e implémentation dupliquée.

**Fichiers** : `composables/useLiveStockInit.js` (nouveau, orchestration pure) ;
`utils/stockPlanning.js` (`buildStockRequirements` étendue) ;
`components/analyse/panels/LiveInventoryPanel.vue` (bouton + dialog + prop `eventId`/`eventName`,
émet `notify` pour le snackbar du parent) ; `components/analyse/AnalyseView.vue` (`liveEventId`/
`liveEventName` computed, dérivés du scope déjà posé par `applyLiveScope()` — aucun nouvel appel
réseau ; handler `onLiveInventoryNotify`). i18n : clés `anLiveInvInit*`
(`i18n/translations.js`).

**Tests** : `tests/unit/stockPlanningManualQuantities.spec.js` (nouveau, 4 tests) et
`tests/unit/useLiveStockInit.spec.js` (nouveau, 5 tests, store/API mockés).

**Limite connue** : la sélection de version ne retient QUE la version par défaut (`isDefault`) ou
la 1re — pas de sélecteur de scénario côté Live (contrairement à Restock qui propose un choix). Si
un besoin de choisir un scénario spécifique depuis Live émerge, revoir cette limite à ce moment-là.

## 16. Panneau de filtres (gauche) — sections sans effet ou trompeuses en Live — ✅ corrigé 2026-08-05

> `FilterPanel.vue` n'avait aucune logique conditionnelle sur le mode Live — panneau strictement
> identique à l'Analyse classique. Or plusieurs sections y sont soit écrasées automatiquement, soit
> calculées sur un périmètre qui n'a pas de sens en Live (un seul event, toujours).

**Trois défauts distincts identifiés (audit + vérification code) :**

1. **Configuration / Événements / Dates** — `applyLiveScope()` (`AnalyseView.vue`) écrase ces 3
   filtres à *chaque tick* (15s). Éditables en apparence, tout changement utilisateur y tient au
   mieux 15s avant de revenir tout seul.
2. **Filtres avancés** (catégorie/type d'event, équipes, sponsor, entracte...) — filtres au niveau
   **event**, alors qu'un seul event est jamais en scope en Live. Contrairement au point 1, **rien
   ne les réinitialise automatiquement** : un choix qui ne matche pas l'event live exclut cet event
   de `filteredEvents` (`analyse.js:829-846`) et vide tout l'écran, silencieusement, durablement.
3. **Affluence** (curseur de plage billets vendus/scannés) — pire cas trouvé : `attendanceBounds`
   (`analyse.js:1298-1317`) calcule ses bornes sur `state.events` **sans aucun scope**, pas même
   `analysableEvents` — les chiffres affichés (ex. 0-55 000) viennent de tout l'historique de
   l'espace, aucun rapport avec l'event live. Un curseur de PLAGE n'a de toute façon pas de sens sur
   un seul event (min=max, rien à régler).
4. **Types de PDV / Zones / Points de vente** — leurs compteurs (`optionsBaseRecords`,
   `analyse.js`) étaient scopés à `analysableEvents` (tout l'historique analysable de l'espace),
   pas à l'event live — un stand ayant vendu 25 fois sur toute la saison affichait "25" au lieu du
   nombre de ventes de l'event en cours. Contrairement aux points 1-3, ces filtres restent
   pertinents en Live (suivre un shop précis en direct) — **corrigés pour se scoper**, pas masqués.

**Corrigé** :
- Masqué en Live (`FilterPanel.vue`, prop `isLive`) : Configuration, Événements, Dates, Filtres
  avancés, Affluence. Restent visibles et fonctionnels : Points de vente, Types de PDV, Zones,
  Articles du menu, Type & Catégorie.
- Nouveau `state.isLiveRoute` (`analyse.js`), posé par un `watch(isLive, ...)` dans
  `AnalyseView.vue` (pas juste au montage — suit `route.name` en continu, y compris sous
  `keepAlive` où le composant ne démonte jamais entre Live et Analyse classique). `optionsBaseRecords`
  bascule sa base de `analysableEvents` vers `filteredEvents` (déjà réduit au seul event live par
  `applyLiveScope`) quand `isLiveRoute` est vrai — comportement Analyse/Predict/EventPredict
  inchangé (vérifié par test dédié).
- **Articles du menu / Type & Catégorie** : vérifiés déjà corrects — sourcés de
  `soldItemOptions` → `useAnalyseItemRecords(filteredEvents)`, donc déjà scopés au seul event live,
  aucun changement nécessaire.

**Tests** : 2 nouveaux dans `analyseStore.spec.js` (scope Live vs scope Analyse inchangé).

---

### Révisions

- **2026-08-05** — Panneau de filtres Live (§16) : Configuration/Événements/Dates/Filtres
  avancés/Affluence masqués en Live (auto-réécrasés ou trompeurs — Affluence calculait ses bornes
  sur tout l'historique de l'espace, aucun scope). Types de PDV/Zones/Points de vente corrigés pour
  se scoper au seul event live (`state.isLiveRoute` → `optionsBaseRecords`) au lieu de tout
  l'historique analysable — affichaient des compteurs de saison entière. 2 tests ajoutés.
- **2026-08-05** — Stock Live initialisé depuis Event Predict (§15) : bouton manuel dans
  `LiveInventoryPanel.vue`, réutilise le reset Logistic générique existant (aucun changement
  backend/schéma) + `buildStockRequirements()` (Restock) désormais partagée avec Live via un
  nouveau paramètre `manualQuantities` (rétrocompatible). Nouveau composable
  `useLiveStockInit.js`. 9 nouveaux tests unitaires.
- **2026-08-04** — Audit détaillé de la page Live (code réel vs doc), puis correction. Deux
  imprécisions de cette page corrigées : `useAnalyseItemRecords` a bien un `refresh()` (§13,
  contrairement à ce qui était écrit) et l'entrée « Live » est bien présente dans les 4 autres
  listes `toolboxItems` (le trou réel, plus large, est l'absence totale de filtrage `permission`
  sur `FilterPanel.vue`, toujours ouvert, §13). Dette de perf **nouvelle et non documentée
  jusqu'ici** trouvée puis **corrigée le jour même** : `liveShopDetailsPoll()` relançait tout le
  bootstrap catalogue de l'espace (menu items, ingrédients, packaging, produits/mappings
  Weezevent, pagination `/menu-components`) à chaque tick de 15 s au lieu de ne rafraîchir que les
  2 endpoints réellement volatils pendant un event. Correction SOLID implémentée (§14) :
  `fetchLiveShopSnapshot()` (nouvelle fonction pure, `useSpaceData.js`) + `normalizeAndEnrichGranular()`
  extraite en helper partagé avec `loadEnrichment` (évite toute divergence entre bootstrap et
  live) + nouvelle action `analyse/refreshLiveShopSnapshot` à périmètre de commit réduit
  (`SET_SHOP_GRANULAR`/`SET_MENU_ITEM_COST_MAP`/`SET_SUMMARY` uniquement) + garde de concurrence
  par jeton de requête, appliquée aussi à `LiveInventoryPanel.vue` (même trou trouvé en audit).
  Le tick live passe de ~10-12 requêtes à 2, sans changer une seule donnée affichée. Suites
  `analyseStore.spec.js` (40 tests) et `useSpaceDataWaves.spec.js` vertes après implémentation.
- **2026-07-29** — Bug signalé « synchro des prix trop lente en Live » : le `menuItemCostMap` (utilisé
  pour le calcul de marge) n'était rafraîchi que toutes les 45s (`liveShopDetailsPoll`) pendant que le
  CA l'était toutes les 15s (`livePoll`) — la marge affichée pouvait donc dériver jusqu'à 30s derrière
  le CA. Corrigé : `liveShopDetailsPoll()` (donc `loadSpace`) est maintenant appelé depuis `livePoll()`
  sur le même intervalle unique de 15s ; le second timer (`liveShopDetailsTimer`) est supprimé.
- **2026-07-20** — Création (conception initiale d'après maquettes). Points d'insertion front vérifiés
  contre le code réel (§8bis) ; §2/§8 corrigés (`FilterPanel.vue`, pas `navigation.js`).
- **2026-07-23** — Front v1 « Live analytics » implémenté (greffes A/B/C/D, §13) : bouton ◉
  (`SpaceItem.vue`), entrée Tools + route `space-live`, mode flux `AnalyseView` (badge ● LIVE +
  polling 15 s de la timeline + cleanup keepAlive). Points d'insertion re-vérifiés (c'est
  `analyse/filters/FilterPanel.vue` qui est importé, pas le doublon). Limites v1 consignées §13
  (shop-details/KPI non pollés — reset filtres + agrégation backend non auto ; item-records en cache).
  Statut passé 🔵→🟡. Reste : fondation backend (Ulrich) + onglet Inventaire E (v2).
- **2026-07-20** — Questions #19-#21 tranchées par Ulrich après recherche approfondie du code backend
  réel (webhook/queue d'agrégation, modèle `Event`, catalogue RBAC, router front) : transport = polling
  (§5, avec correction d'une hypothèse fausse sur la fraîcheur de l'agrégation + prérequis backend
  révélé), définition « event live » = vente réelle < 30 min (§7), route dédiée `space-live` (§10.3).
  Découverte notable : `front.fb.live` existe déjà dans le catalogue RBAC depuis avant cette conception
  (§9) — aucun seed/backfill à faire.
- **2026-07-23** — Question #23 (cardinalité event/espace) tranchée par l'utilisateur : un seul event
  live par espace (§10.5, §12). Ownership tranché : fullstack, un seul owner (Ulrich), pas de split
  front/back (§4, §8, §9). Vérification en code : BUG-19 déjà corrigé (§5, plus un prérequis) ; le
  déclenchement automatique de l'agrégation, lui, était **encore manquant** à ce stade (§5,
  prérequis 1) ; ambiguïté `FilterPanel.vue` résolue — `analyse/filters/FilterPanel.vue` est la seule
  cible vivante (§2, §8bis) ; `BurgerMenu.vue` est bien monté dans l'app, contrairement à ce qui était
  supposé (§9). Seul point encore bloquant avant code à ce stade : #22 (source du stock live) et le
  prérequis d'agrégation auto.
- **2026-07-23 (suite)** — Socle backend du v1 implémenté : BUG-108 (`deletedAt` sur
  `getEventTimelineBatch`) et BUG-109 (déclenchement auto de l'agrégation, post-webhook + cron de
  secours) corrigés ; signal `GET /spaces/:id/live-status` implémenté et testé (§1, §7, §12). Détail
  complet côté backend : `api-datafriday-staging/docs/api/LIVE_API_GUIDE.md`. Seul point encore
  bloquant avant code : #22 (source du stock live), et uniquement pour le v2/onglet Inventaire — le
  v1 front peut démarrer.
- **2026-07-23 (suite 2)** — Question #22 (source du stock live) tranchée par l'utilisateur : combinaison,
  réutilisation telle quelle du calcul déjà en production du module Logistic
  (`LogisticsService.getStock`, `StockLevel` + `deriveSalesRaw`/`explodeSalesToConsumption`),
  granularité par défaut (`readyForSale`, comme le Réarmement — pas l'override Space Inventory de la
  question #13). Au passage, BUG-110 trouvé et corrigé : `deriveSalesRaw` avait le même trou que
  BUG-108 (pas de filtre `deletedAt`). Implémentation backend de `GET /spaces/:id/live/inventory` en
  cours (§8bis greffe E). **Plus aucun point bloquant avant code, v1 comme v2.**
- **2026-07-23 (suite 3)** — Démarrage effectif du front (Claude) : incohérence trouvée entre §7/§8bis
  et l'implémentation backend réelle — ces sections décrivaient encore la greffe A comme lisant un
  champ `space.liveEvent` sur `GET /spaces`, alors que le backend a tranché pour un endpoint dédié
  uniquement (`GET /spaces/:id/live-status`, `LIVE_API_GUIDE.md` §1.2), précisément pour ne pas casser
  le cache 60s de la liste. §7 et le tableau §8bis (ligne A) corrigés en conséquence. Nouvelle zone
  grise **encore ouverte** ajoutée (§10.6, question #34 dans `QUESTIONS_A_BERTRAND.md`) : comment le
  bouton ◉ de la Home obtient ce signal sans navigation, sachant qu'aucun canal push n'existe (pas de
  SSE/WebSocket au v1 ; les webhooks Weezevent/Digifood n'atteignent que le backend, jamais le
  navigateur) — deux options posées (polling `live-status` par carte, ou ◉ visible seulement après
  entrée dans l'espace), aucune tranchée. **Ne bloque que la greffe A** — B/C/D/E peuvent démarrer.
