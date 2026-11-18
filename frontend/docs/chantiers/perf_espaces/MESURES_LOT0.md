# Lot 0 : premières mesures (2026-11-13)

Complète [RAPPORT_PERF_ESPACES.md](RAPPORT_PERF_ESPACES.md). Premières durées mesurées, jusque-là toutes tirées des commentaires du code.

## Limites à lire d'abord

- **Base locale uniquement** (`datafriday_local`, Postgres sur la machine, sans pooler, sans réseau). Volume : 239 220 transactions, 617 653 lignes de transaction, 174 050 lignes SpaceRevenueMinuteItemAgg, 77 886 lignes SpaceBasketMinuteAgg, 34 espaces, 816 événements. Les temps de production seront plus élevés (latence Render + pooler 6543, volumes supérieurs). Les rapports de grandeur et les plans d'exécution restent valables.
- **Production : un seul point mesuré** (la consommation Logistique d'Auxerre, section 2bis), avec ton go du 2026-11-13, en lecture seule (`begin read only`, `set local statement_timeout`), via `DIRECT_URL` (session pooler 5432, une connexion), sans `SET` de session. Deux exécutions au total.
- **Aucune mesure navigateur** (pas de temps avant premier contenu utile, pas d'onglet Network) : demande un serveur de dev et un navigateur, voir « Reste à mesurer ».
- Toutes les requêtes ont tourné dans `begin read only` ou dans une transaction annulée par `rollback`. Aucune écriture durable.

## 1. RPC get_space_shop_details

Espace testé : Adidas Arena (340 événements, 16 379 lignes SpaceRevenueMinuteAgg, 11 121 lignes SpaceRevenueMinuteItemAgg).

| Cas | Durée | Taille JSON |
|---|---|---|
| Granulaire, page 1, limite 20 (1er appel) | 97 ms | 75 Ko |
| Granulaire, page 1, limite 20 (2e appel) | 27 ms | 75 Ko |
| Granulaire, page 2, limite 20 | 18 ms | 36 Ko |
| Granulaire, page 1, limite 100 | 16 ms | 75 Ko |
| Non granulaire, page 1, limite 20 | 13 ms | 36 Ko |
| Non granulaire, page 1, limite 100 | 13 ms | 36 Ko |

Constats :

1. **En local le RPC n'est pas le goulot** (13 à 97 ms). L'hypothèse du rapport (T1) n'est pas confirmée à cette échelle. Elle reste à vérifier sur les volumes de production.
2. Le mode granulaire double la taille et à peu près le temps par rapport au mode non granulaire.
3. Limite 20 et limite 100 donnent la même taille : sur cet espace, la limite ne borne pas la charge utile. À recouper en production.
4. **Le RPC crée des tables temporaires** (`CREATE TEMP TABLE ... ON COMMIT DROP`, par exemple `_shop_rev`). Conséquences : il ne s'exécute pas en `read only`, et il ne supporte qu'un appel par transaction. Une mesure sur la base de production en lecture seule n'est donc pas possible pour le RPC lui-même, seulement pour ses requêtes internes via EXPLAIN.

## 2. Consommation Logistique (salesByElementSince), version corrigée

**Correction (2026-11-13, même jour).** La première version de cette section annonçait 1 à 3 s en local et **6,55 s en production** pour Auxerre. Ces chiffres étaient faux : mes EXPLAIN filtraient les PdV par une sous-requête (`IN (select ...)`), alors que l'application envoie une **liste explicite d'identifiants**. Le planificateur choisit alors un autre plan, bien moins coûteux (parcours par PdV au lieu d'un parcours de toute la période du tenant). Les mesures ci-dessous reprennent la forme exacte de la requête de l'application.

Requête de `logistics.queries.ts`, utilisée par `/stock`, `/live/inventory` (toutes les 15 s) et la ventilation invité (30 s), sans cache avant ce chantier. La borne `since` est l'ancre (dernier reset Logistique, sinon premier mouvement), jamais `null` côté `stock-level.service.ts`.

Ancres réelles de production (2026-11-13) : Abbé Deschamps (Auxerre) 13/08 (92 jours), FC Bayonne 07/10 (37 jours), Jean Bouin 01/11 (12 jours), Aix Arena 05/11 (8 jours), La Beaujoire 13/11 (0 jour). Seul Auxerre a une ancre ancienne.

| Mesure (Auxerre, 24 PdV, ancre du 13/08) | Local | Production |
|---|---|---|
| Requête complète depuis l'ancre, **à chaud** | 105 à 150 ms | **214 ms** |
| Requête complète, **à froid** (blocs lus sur disque) | non reproduit | **2,55 s** (4 520 blocs lus) |
| Explosion des recettes (4 à 5 requêtes) | 6 à 9 ms | non mesurée |
| Tranche des 15 dernières minutes | 1,8 ms | **0,12 ms** |
| Tranche de 15 min en plein match (467 transactions) | 10,6 ms | non mesurée |

Constats :

1. **La consommation n'est pas le goulot de la règle des 3 s.** À chaud, elle coûte 0,2 s en production ; à froid, 2,5 s. Ce n'est qu'après une longue inactivité que le disque est relu.
2. Le plan en production est un parcours par PdV : `WeezeventLocationShopMapping_spaceElementId_idx` puis `WeezeventTransaction_tenantId_locationId_transactionDate_idx`, coût estimé 8 500 (contre 285 000 pour ma requête de test erronée).
3. Un tri écrit un peu sur disque (`temp written=702` blocs, environ 5 Mo) : mineur.
4. Ce qui pèse vraiment : **la répétition** (120 recalculs en 10 min pour 3 spectateurs sur un seul espace) et **le premier appel à froid**, pas la durée d'un appel à chaud.

## 2ter. Lot 2, étape 1 : consommation exacte et rapide (fait en local, non commité)

Branche `perf/logistic-consumption-cache`, worktree `../datafriday-perf-logistic-cache`, depuis develop (51e35da6).

Principe : le passé ne change pas, donc on ne le recalcule pas. Les ventes sont coupées en deux.

- **Base** : ventes de l'ancre jusqu'à il y a 10 min. Partie lourde, calculée une fois et gardée dans Redis. Si elle a plus de 5 min, elle est servie telle quelle et recalculée en arrière-plan (jamais bloquant).
- **Direct** : ventes des dernières minutes, calculées à chaque appel (1,5 ms en local sur 20 min).
- Résultat = base + direct, puis explosion en articles. Aucun retard : une vente enregistrée en base de données est comptée à l'appel suivant.

Fichiers : `sales-base-cache.service.ts` (Redis, rafraîchissement en arrière-plan), `space-consumption.service.ts` (base + direct), `sales-raw-merge.ts` (addition des lots), `recipe-explosion.service.ts` (`deriveSalesRaw` reçoit une borne haute `until` optionnelle), `stock-level.service.ts` (appelle le nouveau service).

Règles de sécurité :

- Clé Redis `logistics:salesbase:{tenant}:{espace}:{ancre}:{empreinte des PdV}` : un reset (nouvelle ancre) ou une configuration modifiée (PdV recréés) change la clé, donc recalcul immédiat.
- Le reset logistique lit en `fresh` (calcul complet sans cache), car il écrit des mouvements à partir de la consommation.
- Les autres écritures (`inventory-logistic-push`, `post-event-draft`) passent par `deriveEventConsumption`, hors cache.

Vérifications :

- Données réelles locales (Auxerre) : calcul complet 255 groupes = base 249 + direct 208 fusionnés, 0 manquant, 0 en trop.
- Tests : 5 + 8 + 5 nouveaux (fusion, base, service), `logistics.service.spec` 44/44, `inventory.service.spec` 60/60.

Limites à connaître :

- Le tout premier appel pour une ancre donnée est un calcul complet (2,55 s à froid, 0,2 s à chaud en production pour Auxerre), ainsi que le premier après plus d'une heure d'inactivité. Ensuite chaque lecture coûte 10 à 20 ms.
- Une vente enregistrée avec une date ancienne et arrivée plus de 10 min plus tard, ou une correction rétroactive (remboursement, re-mapping), n'apparaît qu'au prochain rafraîchissement de la base (5 min au plus).

### Gain réel : origine, cache 20 s (précédent), base + direct (actuel)

Banc d'essai avec les vrais services (SQL, explosion des recettes, Redis local) sur Auxerre, base locale. Séance simulée de 10 min : 3 spectateurs relisant toutes les 15 s, soit 120 lectures. Les coûts de production viennent des EXPLAIN de la section 2, la tranche directe et l'explosion viennent du banc local.

**Mesuré tel quel (local, 10 spectateurs à froid en même temps)**

| Version | Requêtes lourdes | Requêtes directes | Temps total |
|---|---|---|---|
| A origine | 10 | 0 | 315 ms |
| B cache 20 s | 1 | 0 | 120 ms |
| C base + direct | 1 | 10 | 128 ms |

**Modèle de séance, production (premier calcul à froid 2,55 s, suivants à chaud 214 ms)**

| Version | Calculs lourds | Lecture typique | Lectures > 1 s | Temps de base cumulé |
|---|---|---|---|---|
| A origine | 120 | 223 ms | 1 | 29,1 s |
| B cache 20 s (précédent) | 24 | 1 ms ou 223 ms | 1 | 7,7 s |
| C base + direct (actuel) | 1 + 2 en arrière-plan | 17 ms | 1 | 5,0 s |

Pire cas production (disque jamais en cache, chaque calcul à froid 2,55 s) : A 120 lectures lentes et 307 s de base cumulées, B 24 lectures lentes et 61 s, C 1 lecture lente et 9,7 s.

Lecture du gain :

- **Charge sur la base : 6 fois moindre qu'à l'origine** (29 s contre 5 s en 10 min pour un seul espace), 1,5 fois moindre que le cache 20 s.
- **Latence d'une lecture : 223 ms vers 17 ms** (13 fois plus rapide qu'à l'origine). Le cache 20 s donnait 1 ms sur un coup sur deux, mais 223 ms sur l'autre : c'est la lecture que l'utilisateur ressent.
- **Exactitude : le cache 20 s avait jusqu'à 20 s de retard, la version actuelle n'en a aucun.**
- Le gain en secondes par lecture est modeste (environ 0,2 s) : il ne suffit pas à lui seul à tenir la règle des 3 s.

À mesurer après déploiement : durée de `/live/inventory` et de `/logistics/:id/stock` pour Auxerre, appel froid puis appel chaud.

## 3. transaction-baskets (lecture pré-agrégée)

Plus gros événement local (FC Bayonne, 9 603 lignes) via la vraie requête `readBasketAggSql`, rejouée à la main :

- **9 603 lignes, 3 364 Ko de JSON** (359 octets par ligne), **340 ms de SQL**.
- Volume habituel : 2 400 à 5 000 lignes par événement, soit environ 1 à 1,8 Mo.
- Un lot de 6 événements peut donc peser 6 à 20 Mo. Cela confirme l'ordre de grandeur « environ 2 Mo par événement » du rapport.
- Le SQL n'est pas le problème (340 ms). Le poids vient du transfert, de la sérialisation JSON et du parsing côté navigateur. Piste : agréger côté serveur selon les filtres actifs, ou ne demander que les colonnes nécessaires.

## 4. /menu-components (liste Commandes)

Le plus gros tenant local n'a que 47 composants (612 lignes ComponentIngredient, 15 ComponentComponent). La charge utile est négligeable en local. Le coût de la boucle N+1 `GET /menu-components/:id` vient du **nombre de requêtes multiplié par la latence réseau**, pas du volume : non mesurable en local. À chiffrer avec l'onglet Network en production ou en recette.

## 5. Ce que la base de production consomme réellement (pg_stat_statements, 2026-11-13)

Lecture seule (`begin read only`, `statement_timeout` 20 s, rollback), via DIRECT_URL.

**Périmètre.** Compteurs remis à zéro le 2026-09-21 14:59 UTC (53 jours). 4 842 requêtes distinctes, 11,8 millions d'appels, **31 297 s** de temps d'exécution cumulé. Tout passe par le rôle `postgres` : la vue ne dit pas quel endpoint ou quel job a émis la requête. Le rattachement ci-dessous vient de la lecture du code, pas de la base.

| Famille | Appels | Temps cumulé | Part | Moyenne | Pire appel | Origine (code) |
|---|---|---|---|---|---|---|
| Timeline par événement (`WITH ev(...)`), 34 variantes selon le nombre d'événements | 6 207 | 7 209 s | 23 % | 101 ms à 26,6 s selon la variante | 87 s | `space-event-timeline.service.ts` et `cost-tracking-revenue.service.ts` |
| dont lecture sur 30 événements qui renvoie 15 à 22 lignes | 377 | 5 163 s | 16,5 % | 26,6 s (148 appels) et 5,4 s (229 appels) | 87 s | Probablement Cost tracking (seule lecture groupée par article sur ce CTE) |
| dont Analyse « summary » sur 30 événements (4 250 lignes) | 294 | 775 s | 2,5 % | 2,6 s | 13 s | `space-event-timeline.service.ts` |
| dont grain minute, 1 événement | 3 257 | 328 s | 1 % | 101 ms | 1,5 s | idem (courbe horaire) |
| `observedEventSpans` (étendue de chaque event) | 1 893 | 5 884 s | 18,8 % | 3,1 s | 30 s | `event-window.queries.ts`, déjà en cache 10 min par tenant |
| DELETE des 3 tables d'agrégats (item, minute, panier) | 3 × 1 640 | 4 454 s | 14,2 % | 0,6 à 1,2 s | 19 s | Reconstruction des agrégats, fond |
| Paniers (`SpaceBasketMinuteAgg`), 4 variantes | 6 978 | 2 120 s | 6,8 % | 129 ms, 262 ms, 1,7 s, 1,9 s | 96 s et 108 s | `basket-agg-read.sql.ts` (Analyse) |
| `dailyTransactionTotals` (volume par jour d'une intégration) | 67 | 1 286 s | 4,1 % | 19,2 s | 86 s | `integration-transaction-stats.queries.ts` (statut d'agrégation, cache 60 s) |
| `get_space_shop_details` (RPC) | 1 291 | 1 264 s | 4 % | 979 ms | 28 s | `spaces.queries.ts` (Analyse, espaces) |
| CA par espace (`space-revenue-summary.queries.ts`) | 311 | 493 s | 1,6 % | 1,6 s | 18,7 s | Liste des espaces, cache de blocs seulement 45 % |
| `SELECT DISTINCT merchantId, integrationId` | 119 | 219 s | 0,7 % | 1,8 s | 8 s | `distinct-merchants.queries.ts` |
| **Consommation Logistique (`salesByElementSince`)** | 9 250 | 361 s | **1,2 %** | 39 ms | 7 s | Section 2 |

**Ce que ça confirme.**

- La consommation Logistique pèse 1,2 % du temps de base. Le rétrogradage de la section 2 est confirmé par la production entière, pas seulement par un EXPLAIN.
- Le SQL de la timeline « summary » à 30 événements et celui de Cost tracking lisent la pré-agrégation par une fenêtre large : **92 107 blocs lus hors du cache de la base par appel** pour le plus lent (environ 740 Mo), 10 460 pour le suivant. Cela se produit à chaque échec de cache Redis, et la clé de cache de Cost tracking est la liste triée des événements : un événement de plus ou de moins et tout est recalculé.
- Les DELETE d'agrégats lisent presque tout sur disque (cache 6 à 11 %) et durent 0,6 à 1,2 s en moyenne. Ils ne sont pas dans le chemin d'une page, mais ils partagent le disque avec les lectures des pages.

**Ce que ça ne dit pas.**

- Combien de ces appels ont été déclenchés par un utilisateur, et combien par un job ou un échec de cache. La vue donne des appels et des durées, pas des endpoints.
- Combien de temps une page attend réellement : un appel à 26 s peut être masqué par le cache Redis dès la deuxième visite. Seule la capture réseau du navigateur le dit.
- La part de contention : les moyennes contiennent les attentes derrière les jobs de fond (écart type très haut : 15 s sur 26 s de moyenne, 12 s sur 1,9 s pour les paniers).
- `dealloc = 480` : les requêtes les moins fréquentes ont pu être évincées de la vue. Les requêtes du haut du classement ne sont pas concernées.

## 6. EXPLAIN (ANALYZE, BUFFERS) en production de la timeline sur 30 événements (2026-11-13)

Lecture seule (`begin read only`, `statement_timeout` 90 s, `work_mem` 32 Mo comme `queryWithWorkMem`), via DIRECT_URL. La requête est celle de `cost-tracking-revenue.service.ts` (CTE `eventTimelineWindowCtes`, regroupement par article). Les 30 identifiants, leurs fenêtres (`resolveEventTransactionWindow` réel), les PdV et le tenant sont les vrais, en littéraux. Les 30 derniers événements passés, hors conteneurs de saison, comme l'application.

| Espace | Lignes de l'espace dans la table | Plan choisi | Durée | Blocs lus hors cache | Lignes lues (`win`) |
|---|---|---|---|---|---|
| Abbé Deschamps | 116 593 | **B** : lecture de tout l'espace (index `integrationId`), 30 fenêtres testées en filtre, 1,7 M lignes rejetées | 2,0 s (`work_mem` 5 Mo), 1,5 s (32 Mo) | 6 785 | 97 475 |
| Aix arena | 131 462 | **B** (idem, 1,95 M lignes rejetées) | 1,45 s | 6 089 | 33 934 |
| Adidas arena | 712 442 | **A** : une lecture par événement (index `tenantId, spaceId, weezeventEventId, minute`) | 1,2 s, puis 0,37 s (cache chaud) | 4 007 | 41 392 |
| Adidas arena, 30 plus anciens | 712 442 | **A** | 0,76 s | 3 327 | 73 665 |
| Jean Bouin | 369 794 | **A** | 2,4 s | 11 180 | 222 127 |

**Ce que ça établit.**

- À froid-tiède, sur les quatre plus gros espaces, la lecture sur 30 événements coûte **0,4 à 2,4 s**. Elle ne reproduit **pas** les 26,6 s de moyenne ni les 92 107 blocs par appel de `pg_stat_statements`.
- **Le plan n'est pas stable.** Pour le même SQL, la base choisit tantôt une lecture par événement (plan A), tantôt la lecture de tout l'espace puis le filtre sur les 30 fenêtres (plan B). Le commentaire de `event-timeline-window.sql.ts` (« lecture par l'index tenantId, spaceId, minute event par event ») décrit un plan que la base ne prend plus ici : l'index à 885 Mo `(tenantId, spaceId, minute, ...)` n'est utilisé dans aucun des cinq essais. Le plan A passe par l'index `weezeventEventId` en filtrant `minute` sans préfixe sur l'événement.
- Le plan B coûte proportionnellement à la taille de l'espace, pas à celle des 30 événements. Sur Adidas arena (712 442 lignes, 6 fois Abbé Deschamps), un plan B ne se mesure pas ici (la base a pris le plan A) : l'extrapolation donnerait de l'ordre de 9 s à chaud, davantage à froid. **C'est une extrapolation, pas une mesure.**
- Une jointure `LATERAL` équivalente est aplatie par le planificateur et donne les mêmes plans (Abbé : plan B, 1,5 s ; Adidas : plan A, 0,37 s). Elle ne corrige pas l'instabilité.
- Les écarts de durée entre essais viennent surtout du cache (Adidas 1,2 s puis 0,37 s) et du `work_mem` (Abbé 2,0 s avec 5 Mo, déversement sur disque, contre 1,5 s avec 32 Mo).

**Ce qui n'est pas expliqué.** Les appels à 26 s de moyenne (148 appels, pire 87 s, écart type 15 s) viennent d'un espace, d'un lot d'événements ou d'un état de la base (cache froid, concurrence avec les jobs d'agrégation) que ces essais ne couvrent pas. La table et ses index pèsent 2,2 Go pour un `effective_cache_size` de 1,5 Go : une lecture à froid ou concurrente d'un job de fond lit forcément sur disque. Hypothèses non vérifiées : plan B sur un gros espace, ou lecture pendant un job d'agrégation.

## 7. Pourquoi la lecture sur 30 événements est lourde, et journalisation ajoutée (2026-11-13)

**Ce qui est lisible côté base.** Les journaux Postgres ne sont pas lisibles en SQL (Supabase, rôle sans super-utilisateur). `track_io_timing` est **coupé** : les colonnes de temps de lecture disque de `pg_stat_statements` valent 0, ce qui ne veut pas dire « pas d'attente disque ». `shared_buffers` = 512 Mo, `effective_cache_size` = 1,5 Go, alors que la table `SpaceRevenueMinuteItemAgg` et ses index pèsent 2,2 Go.

**La variante lente n'est jamais rapide.** Les 148 appels à 26,6 s de moyenne ont un meilleur cas à **3,0 s** (pire 86,9 s, 92 107 blocs lus par appel). Ce n'est donc pas seulement un cache froid : la requête est lourde en soi, et l'état de la base la fait passer de 3 s à 87 s. L'autre variante (229 appels) varie bien davantage (174 ms à 18 s).

**Mécanisme mesuré (section 6 et variantes ci-dessous).**

- Plan A : l'index `(tenantId, spaceId, weezeventEventId, minute)` n'est pas cherché par minute, il est relu **sur tout l'espace pour chacun des 30 événements** : 74 000 tampons touchés sur Adidas arena, 94 000 sur Jean Bouin. C'est l'ordre de grandeur des 92 107 blocs par appel de la production. Avec 512 Mo de tampons partagés, ces blocs sont relus en grande partie à chaque appel.
- Plan B : lecture de tout l'espace. Mesuré sur Adidas arena en retirant le filtre `tagId` (diagnostic) : **4,5 s et 32 793 blocs lus**, contre 1,2 s en plan A. Le plan B existe donc bien sur un gros espace.
- Hypothèse sur l'instabilité (non prouvée) : les bornes de fenêtre viennent d'un `VALUES`, la base ne peut pas les estimer et surestime les lignes de chaque fenêtre (estimé 552 à 304 681 lignes par fenêtre, réel 1 380). Elle évite donc l'index sur la minute. Indice : avec des bornes écrites en dur dans la requête, elle l'utilise (29 branches sur 30 à Adidas arena).
- La plupart des événements n'ont pas de `tagId` (30 sur 30 à Abbé Deschamps et à Aix, 29 sur 30 à Adidas, 4 sur 30 à Jean Bouin) : pour eux, seule la fenêtre de minutes borne la lecture.

**Réécriture testée, NON appliquée.** `win` en 30 branches `UNION ALL`, une par événement, bornes de fenêtre en dur (paramètres liés dans l'application). Même résultat en nombre de lignes lues dans les trois espaces (97 475, 41 392 et 222 127 : identique à la requête actuelle). Une exécution par cas, caches non contrôlés.

| Espace | Requête actuelle | 30 branches | Tampons touchés (actuel, puis 30 branches) |
|---|---|---|---|
| Abbé Deschamps | 1,5 s (32 Mo) | 1,1 s | 6,9 k, puis 20,2 k |
| Adidas arena | 1,2 s (0,37 s chaud) | 0,33 s | 74,2 k, puis 11,9 k |
| Jean Bouin | 2,4 s | 1,4 s | 94,3 k, puis 52,1 k |

Lecture prudente : gain de 1,7 à 3,7 fois en tiède, nombre de tampons divisé par 6 à Adidas et par 1,8 à Jean Bouin, mais plus élevé à Abbé Deschamps (plan B actuel déjà économe en tampons). Le gain sous cache froid (512 Mo de tampons) est probable mais **non mesuré**. Ce n'est pas un gain d'un ordre de grandeur : il reste l'agrégation de 100 000 à 220 000 lignes avec débordement sur disque. À décider avec l'équipe avant tout code.

**Journalisation ajoutée (branche `perf/slow-read-log`, non commitée, non déployée).**

- `backend/src/shared/utils/semaphore.ts` : le sémaphore des lectures lourdes (`analyse-batch`, 2 en vol, 32 en file, 60 s) mesure l'attente en file et l'exécution. Une lecture dont attente + exécution atteint **5 s** (variable d'environnement `SLOW_READ_LOG_MS`), ou refusée par la file (503), produit une ligne `[SlowRead] queue=analyse-batch outcome=ok totalMs=… waitMs=… runMs=… queuedAtStart=… inFlightAtStart=… rows=… read=… tenantId=… spaceId=… events=…`. Aucun effet sur la lecture ; si le journal lève, la lecture réussit quand même.
- Cinq lectures instrumentées : `event-timeline-summary`, `event-timeline-minute` (`space-event-timeline.service.ts`), `baskets-agg`, `baskets-raw` (`space-analyse-batch.service.ts`), `cost-tracking-revenue` (`cost-tracking-revenue.service.ts`). Les accès servis par le cache Redis ne passent pas par le sémaphore et ne sont donc pas vus ici.
- Tests : `semaphore.spec.ts` 10 sur 10 (nouveau), `spaces.service.spec.ts` 67 sur 67.
- Après déploiement, chercher `[SlowRead]` dans les journaux Render. Distinguer `waitMs` élevé (la file, donc la concurrence à 2) de `runMs` élevé (le SQL). Les journaux disent aussi quel espace et combien d'événements.
- Limite : seules les lectures de ce sémaphore sont vues. Le RPC `get_space_shop_details` (0,98 s de moyenne, 28 s au pire) et `observedEventSpans` n'y passent pas.

## 8. Capture navigateur : page Analyse, La Beaujoire (2026-11-13)

Script de `CAPTURE_RESEAU.md` collé dans la console, page `/spaces/cms81fuc10021kgsmjtuddi9d`. **Une seule capture ; état du cache navigateur non précisé ; tailles non disponibles (API sur un autre domaine, `ko` = 0) ; seuls les 25 appels les plus longs sont détaillés sur 35 ; les paramètres d'URL sont retirés.** Les caches serveur (Redis) semblent chauds : `event-timeline` 276 ms, `transaction-baskets` 483 ms.

| Mesure | Valeur |
|---|---|
| Appels API | 35 |
| Dernière réponse | **6 171 ms** |
| DOM interactif / chargement complet de la page | 263 ms / 1 900 ms |
| Premier appel API | 2 051 ms (`onboarding/status`, `notifications`) |
| Appel le plus long | 781 ms (`shop-details`) |
| Somme des durées des 25 appels détaillés | 8 496 ms |
| Temps où au moins un de ces 25 appels est en cours | 2 406 ms sur 6 171 ms |

**Lecture.**

- **Aucun appel ne dépasse 0,8 s.** Le SQL n'explique pas les 6,2 s de cette page, avec des caches serveur chauds. Même si tous les appels s'exécutaient en parallèle dès 2,05 s, la page serait prête vers 2,8 s.
- **Le temps est dans l'enchaînement, pas dans les appels.** Le réseau n'est actif que 2,4 s sur 6,2 s. Quatre vagues se suivent : 2,05 s (onboarding), 3,34 s (saisons, dimensions, préférences, valorisation de stock), 4,25 s (`shop-details`, `event-costs`, produits, `event-timeline`, paniers), 5,15 s (7 appels répétés), 5,9 s à 6,2 s (état du builder, articles des 2 configurations).
- **Cause de l'enchaînement la plus nette, vérifiée dans le code.** `AnalyseView.vue` (vers la ligne 2640) attend `supabase.auth.getSession()` puis `getUserPreferences()` (appel `/preferences` : **777 ms**, de 3 389 ms à 4 166 ms, sur la fonction Supabase) **avant** de lancer `analyse/loadSpace`. `shop-details`, que `useSpaceData.js` annonce « lancé immédiatement à t=0 », démarre donc à 4 248 ms, 82 ms après la fin des préférences. Le commentaire du code justifie cet ordre : le périmètre `filteredEvents` doit être bon dès le premier chargement des paquets.
- **Avant le premier appel API : 2,05 s.** C'est le démarrage de l'application (téléchargement et exécution du JavaScript, session, route). Non décomposé ici.
- **Un trou de 1,17 s** (de 2 177 ms à 3 343 ms) sans aucun des 25 appels détaillés. Les 10 appels courts non détaillés ont pu en couvrir une partie ; la cause n'est pas identifiée.
- **Appels répétés** : `product-menu` 5 fois (dont 4 en même temps à 5 151 ms, 325 à 384 ms chacun), `market-prices` 4 fois ou plus (594 ms, 394 ms, 355 ms, 173 ms). Les paramètres étant retirés, je ne peux pas dire s'ils sont identiques.

**Ce que ça change.** Pour cette page, avec des caches chauds, la lenteur est un problème de séquence côté frontend (Lot 1), pas de SQL. Les corrections de base de données (lecture sur 30 événements, consommation Logistique) ne l'amèneraient pas sous 3 s. Elles comptent pour les cas où le cache serveur est vide (premier accès, événement modifié), que cette capture n'exerce pas.

**Pistes à valider, non appliquées** (techniques, aucune règle métier) : ne pas faire attendre `loadSpace` derrière `/preferences` (lancer les deux et appliquer la préférence avant les paquets d'événements, comme le commentaire du code l'exige) ; dédoublonner les appels répétés ; décomposer les 2,05 s de démarrage.

## 9. Capture navigateur : page Commandes, La Beaujoire (2026-11-16, PARTIELLE)

**Trois captures ont été collées (Commandes, Analyse, Marie Marving) : elles sont identiques et inutilisables séparément.** Chacune annonce 214 appels et une dernière réponse à 35 024 592 ms (environ 9 h 40 après l'ouverture de l'onglet). Le journal de mesures du navigateur n'avait pas été vidé entre les essais : il garde les appels de toutes les pages visitées depuis l'ouverture, et sa taille par défaut (250 entrées) est presque atteinte, donc des appels récents peuvent manquer. Il contient aussi des flux `/live/stream` (connexions SSE ouvertes des heures, jusqu'à 3 206 979 ms) et des appels `/auth/v1/token`, qui ne sont pas des appels lents. Seule la vague la plus récente (Commandes) se lit à part, car ses temps de départ se regroupent autour de 35 019 950 ms.

**Ce qui est récupérable : une vague Commandes de 16 appels, parmi les 25 plus longs du tableau.** Les chiffres ci-dessous sont relatifs au premier appel (35 019 953 ms).

| Vague | Départ | Appels (durée en ms) | Fin |
|---|---|---|---|
| 1 | +0 à +2 ms, 8 appels en parallèle | `shop-details` 2 258, `spaces/:id` 1 397, `events` 1 224, `reconciliations` 1 195, `configurations` 1 138, `kitchens` 1 083, `restock-plans` 1 018, `storage-types` 952 | jusqu'à +2 259 ms |
| 2 | +1 419 à +1 444 ms, 7 appels | `menu-items` 838, `builder-v2 state` 691, `predict-versions/summary` 656, `suppliers` 635, `shops` 632, `product-menu` 620, `market-price-types` 617 | jusqu'à +2 257 ms |
| 3 | +3 095 ms, 1 appel | `logistics/stock` 967 | +4 062 ms |

- **Environ 4,6 s entre le premier appel et la dernière réponse du tableau.** Réseau actif de 0 à 2,26 s puis de 3,10 à 4,06 s ; **trou de 0,84 s** sans appel entre les deux (2 259 à 3 095 ms), cause non identifiée.
- **Le premier lot est bien parallèle, mais chaque appel simple dure environ 1 s.** `storage-types`, `kitchens`, `restock-plans`, `configurations`, `events` sont des lectures simples : dans la capture Analyse (section 8), des appels de même nature prenaient 100 à 300 ms. **Hypothèse non vérifiée** : quand une dizaine d'appels partent en même temps, ils se ralentissent mutuellement (limite de connexions du navigateur ou de l'API, ou saturation du pool de la base). À confirmer en mesurant le même appel seul puis en salve.
- **`logistics/stock` part seul, 1,7 s après la fin de la vague 2** : il attend quelque chose côté frontend. Cause non identifiée, à lire dans le code de la page Commandes.
- **`shop-details` (2,26 s) est l'appel qui ferme la vague 1.** Cohérent avec le RPC lent de la section 1 (979 ms de moyenne en production).

**Limites.** Seuls les 25 appels les plus longs sont dans la capture ; les appels courts ne sont pas là. Les chiffres relatifs viennent de mes calculs sur le tableau collé, pas d'une sortie du script. Il faut refaire la capture avec la version 2 du script (`CAPTURE_RESEAU.md`), qui vide le journal avant de naviguer.

## 10. Captures automatiques Playwright sur localhost (2026-11-16)

**Conditions, à lire d'abord.** Chrome piloté par Playwright (profil dédié, compte de test local), sur le serveur de dev de l'utilisateur (`localhost:8080`, build de développement non minifié) avec le backend local (`localhost:3001`) et la **base locale** (copie des données). Les durées absolues ne sont donc PAS celles de la production : le build de dev est plus lent au démarrage, la base locale est plus rapide qu'en production, et il n'y a pas de latence réseau vers Render. **Les nombres d'appels et leur enchaînement sont fiables** : la page Analyse de La Beaujoire donne 35 appels, comme la capture manuelle du 13/11. « Froid » = cache du navigateur désactivé ; le premier chargement froid inclut aussi la compilation du serveur de dev. Temps mesurés depuis le début de la navigation, hors flux `/live/stream` et `/auth/v1/token`. Résultats bruts : scratchpad de la session (`pw/out/resultats.json`), non versionnés.

| Page (La Beaujoire sauf mention) | Passe | Appels API | Premier appel | Dernière réponse | Erreurs |
|---|---|---|---|---|---|
| Commandes | froid | **180** | 0,46 s | 5,3 s | 87 |
| Commandes | chaud ×2 | **192** | 0,27 à 0,30 s | 9,7 s et 10,8 s | 59 |
| Event Predict | froid | 78 | 3,6 s | 12,7 s | 4 |
| Event Predict | chaud ×2 | 77 | 0,3 à 0,6 s | 4,6 s puis 3,2 s | 2 puis 12 |
| Analyse | froid | 35 | 2,7 s | 7,0 s | 0 |
| Analyse | chaud | 35 | 0,4 s | 3,0 s | 0 |
| Analyse, Marie Marving | froid | 39 | 1,2 s | 3,6 s | 0 |

**Constat principal : Commandes fait environ 190 appels par chargement.** Parmi eux, **66 appels `GET /space-menu/shop/:id` et 66 appels `GET /space-menu/shop/:id/items`**, tous à des adresses différentes (N+1 par point de vente ; la configuration de La Beaujoire compte 33 PdV à 38 selon le périmètre, donc la page charge l'assignation pour plusieurs configurations ou plusieurs passes : non démêlé). Event Predict en fait 33 de `/items` (un par PdV aussi). Le code des autres pages contient déjà des commentaires qui décrivent la correction de ce même N+1 (`useInventoryData.js` ligne 315, `SpaceMenuView.vue`) : Commandes et Event Predict ne l'ont pas encore. Autres répétitions : `ingredients` 7 fois, `product-menu` 5, `market-prices` 4, `menu-components` 3, `logistics/:id/stock` 3.

- **Erreurs HTTP 429 (trop de requêtes).** Elles touchent les appels par PdV : le limiteur du backend local a trois paliers par défaut (`backend/src/config/env.validation.ts`) : 20 requêtes par seconde, 300 par minute, 5 000 par heure (les variables `RATE_LIMIT_TTL` et `RATE_LIMIT_MAX` du `.env` ne sont pas lues par l'application ; **correction du 2026-11-16**, la première version de cette ligne parlait à tort de 100 par 60 s). Un chargement de Commandes en émet près de 190, ce qui franchit le palier à la minute et celui à la seconde. Les 429 obligent à réessayer, d'où le trou de 1,5 s vers 5,1 à 6,7 s en chaud et la dernière réponse à 9,7 à 10,8 s au lieu de 5,3 s. **Non vérifié : la valeur de la limite sur Render.** À lire avant de conclure que les utilisateurs de production les subissent.
- **Erreurs HTTP 500 sur `GET /menu-components`**, 2 par chargement de Commandes et d'Event Predict. **Cause trouvée le 2026-11-16 (section 13) : propre à la base locale, pas un bug de code.**
- **Event Predict à froid : 3,6 s avant le premier appel** (démarrage du bundle de dev, donc surestimé) puis 12,7 s ; à chaud 3,2 à 4,6 s.
- **Analyse** : cohérent avec la section 8. À chaud 3,0 s, à froid 7,0 s ; l'écart est surtout le démarrage (2,7 s avant le premier appel), pas le SQL.

**Ce que ça change.** Pour Commandes et Event Predict, la priorité est de supprimer le N+1 par PdV (un appel groupé pour tous les PdV de la configuration, comme déjà fait ailleurs) et de dédoublonner les appels répétés : 66 + 66 appels à l'identique de forme ne se rattrapent pas avec de la base de données. Il faut un endpoint groupé côté backend ou réutiliser l'existant (à vérifier dans le code avant de proposer).

## 11. Correctif N+1 de Commandes (2026-11-16, branche locale, non commitée)

Branche `perf/restock-shop-menu-batch`, worktree `datafriday-perf-restock-batch`. Frontend seul, aucun changement backend : les deux endpoints groupés existent déjà.

- `loadRestockShopAssignment` (`SpaceRestockView.vue`) chargeait, pour chaque PdV, `GET /space-menu/shop/:id` (recette complète, utilisée seulement pour les articles activés : id, nom, prix) puis `GET /space-menu/shop/:id/items` (disponibilité). Elle fait maintenant **2 appels par configuration** : `GET /space-menu/:spaceId/:configId/shop-items` (articles activés par PdV) et `GET /space-menu/space/:spaceId/items` (disponibilité de l'espace). Si le premier échoue ou revient vide, l'ancienne boucle par PdV s'exécute (repli identique à avant). Logique extraite dans `frontend/src/utils/restockShopAssignmentBatch.js`, pas dans la vue.
- **Équivalence vérifiée sur les données locales de La Beaujoire** (compte de test, configuration de 38 PdV, échantillon de 26 PdV dont 6 absents du lot) : 0 écart sur les articles activés et leur prix, et l'ensemble des articles non produisibles de tous les PdV est identique à celui de l'espace (2 et 2). Raison structurelle : le serveur calcule la disponibilité par espace, avec la même fonction, pour les deux endpoints.
- Détail conservé : `basePrice` nul devient 0, comme dans `GET /space-menu/shop/:id`, pour ne pas changer le score d'appariement par nom.
- Durées des deux appels groupés en local : 0,30 s et 0,10 s, contre 66 + 66 appels de 0,5 à 2 s avant.
- Test : `tests/unit/restockShopAssignmentBatch.spec.js`, 12 sur 12 (via `scripts/test-serial.sh`). Le script de la vue compile (analyseur de composant, sans build).
- **Commit `a4448cc9` sur la branche, mergé en local sur `develop` (`efe63afc`), non poussé.** Mesure après merge, même script Playwright, mêmes conditions que la section 10 (localhost, build de dev, base locale, La Beaujoire) :

| Commandes, La Beaujoire | Appels API | Dernière réponse | Erreurs 429 | Appels `/space-menu/shop/:id` |
|---|---|---|---|---|
| Avant, chaud (2 passes) | 192 | 9,7 s et 10,8 s | 59 | 66 + 66 |
| Après, chaud (2 passes) | 53 et 52 | 3,2 s et 3,0 s | 0 | 0 |
| Avant, froid | 180 | 5,3 s | 87 erreurs au total | 66 + 66 |
| Après, froid (1 passe) | 52 | 8,3 s | 0 | 0 |

  Les appels groupés apparaissent 2 fois chacun (une fois par configuration chargée, ce qui confirme que la page charge l'assignation pour deux configurations). **Réserve sur la passe froide : c'est le premier chargement après le merge, le serveur de dev a recompilé la page**, donc 8,3 s n'est pas comparable aux 5,3 s d'avant. **Correction : ce tableau « avant / après » n'est pas une comparaison propre.** Les 9,7 et 10,8 s d'avant venaient de passes lancées à 1,5 s d'intervalle, qui saturaient le limiteur (429 en cascade), et n'ont pas été reproduits ensuite. La mesure contrôlée suivante fait foi.

**Mesure contrôlée A/B, même code, même serveur, séries alternées (2026-11-16).** Mode « avant » : le script refuse l'appel groupé `shop-items`, donc la page retombe sur la boucle par PdV, c'est-à-dire l'ancien comportement. 65 s de pause entre les séries pour laisser retomber le limiteur. 2 séries de chaque (4 passes à chaud, 2 à froid).

| Commandes, La Beaujoire | Appels | Dernière réponse (médiane) | Détail | Erreurs 429 par passe | Erreurs 500 |
|---|---|---|---|---|---|
| Avant, chaud | 182 à 183 | **4,7 s** | 5,3 / 4,5 / 4,0 / 4,8 | 81 à 92 | 2 (`menu-components`) |
| Après, chaud | 52 | **2,9 s** | 3,0 / 2,9 / 3,1 / 2,8 | **0** | 2 (`menu-components`) |
| Avant, froid | 182 | 5,4 s | 5,7 / 5,0 | 74 à 79 | 2 |
| Après, froid | 52 | 4,1 s | 5,2 / 3,1 | 0 | 2 |

Gain réel mesuré : **3,5 fois moins d'appels, environ 40 % de temps en moins à chaud (4,7 s vers 2,9 s)**, et plus aucune erreur 429. À froid l'écart est du même sens mais seulement 2 passes, dont une à 5,2 s dominée par le démarrage du build de dev (premier appel à 1,25 s) : non démontré.

**Équivalence refaite sur 4 configurations de 2 espaces (La Beaujoire, Marie Marving)** : 32 PdV comparés (articles activés et prix), 0 écart, 0 erreur d'appel ; articles non produisibles de tous les PdV identiques à ceux de l'espace (2 et 2, et 55 et 55).
- **Reste sur Commandes** (52 appels) : `ingredients` 7 fois, `product-menu` 5, `market-prices` 4, `menu-components` 2 avec une erreur 500 à chaque fois, trou de 0,16 s au démarrage. Les 500 sur `/menu-components` ne dépendent pas de ce correctif : cause trouvée, voir section 13 (base locale en retard d'une migration ; les captures locales des sections 10 et 11 les contiennent, ces 2 appels étaient donc des erreurs rapides, et ils renvoient maintenant 43 composants).
- **Non traité** : appels répétés `ingredients`, `product-menu`, `market-prices`, `menu-components`, `logistics/stock`.

## 12. Correctif N+1 Event Predict (2026-11-16)

Même motif que Commandes : `loadShopMenuAssignment` appelait `GET /space-menu/shop/:id/items` une fois par PdV (33 appels pour La Beaujoire), 3 à la fois. Le correctif remplit le cache du store `shopMenuAvailability` en 2 appels groupés, puis laisse la boucle par PdV existante en repli.

- **Code** (branche `perf/event-predict-shop-menu-batch`, worktree `datafriday-perf-ep-batch`, **non commité, non mergé**) : `utils/shopMenuAvailabilityBatch.js` (nouveau), action `hydrateForShops` dans `store/modules/shopMenuAvailability.js`, un appel dans `EventPredictView.vue` avant la boucle par PdV. Spec `tests/unit/shopMenuAvailabilityBatch.spec.js` : 15 tests verts. La vue et le store compilent (analyse syntaxique, pas de build).
- **Les 2 appels** : `GET /space-menu/space/:spaceId/items` (articles de l'espace avec disponibilité serveur, même fonction que la réponse par PdV) et `GET /space-menu/:spaceId/:configId` (matrice PdV x article : clé présente = assigné, valeur = activé). Ligne reconstruite = article de l'espace + `enabled = (matrice[PdV][article] === true)` + `assigned = clé présente`.
- **Repli** : si un des deux appels échoue, ou si la matrice ou la liste d'articles revient vide (par exemple une configuration sans aucune assignation), le lot rend `false` et la boucle par PdV charge comme avant. Rien n'est écrit en cache dans ce cas.
- **Équivalence** (localhost, base locale, 0,8 s entre appels pour éviter les 429) : 5 configurations, 2 espaces, 159 PdV, 14 760 lignes, comparaison champ par champ de la ligne entière : **0 écart**. La comparaison n'est pas triviale : la matrice de La Beaujoire (config `cmshovpn...`) contient 661 articles activés et 139 assignés mais désactivés. Tous les PdV n'ont pas d'entrée dans la matrice (80 sur 159) : ceux-là sortent tout non assigné, identique à la réponse par PdV. Deux configurations de Marie Marving ont une matrice entièrement vide (0 entrée sur 38 et sur 29 PdV) : le lot rend `false` et la boucle par PdV prend le relais, le résultat reste correct.
- **Mesure HTTP de la partie données** (config La Beaujoire `cms88of4r00...`, 33 PdV, 4 tours par mode alternés, 65 s de pause, un tour de chauffe écarté, `scratchpad/pw/measure_ep.mjs`) :

| Mode | Appels | Reçu | Durée (médiane, min à max) | Appels refusés (429) |
|---|---|---|---|---|
| Avant : boucle par PdV, 3 à la fois | 33 | 554 Ko | 733 ms (713 à 845) | 13 par tour (52 sur 4 tours) |
| Après : 2 appels en parallèle | 2 | 37 Ko | 166 ms (141 à 188) | 0 |

- **Lecture honnête de ce tableau** : le mode « avant » est sous-estimé. Sur le serveur local, chaque appel répond en quelques dizaines de ms, donc les 33 appels partent en moins d'une seconde et dépassent le palier de 20 requêtes par seconde : 13 sont refusés à chaque tour, et ce temps de 733 ms inclut ces refus instantanés. Une boucle sans refus serait plus longue. Le palier n'est pas franchi quand les réponses sont lentes (10 appels par seconde à 300 ms par appel), donc **je ne sais pas si Render subit ces refus** (valeurs non vérifiées, `sync: false` dans `render.yaml`).
- **Effet de bord à connaître** : un appel par PdV refusé fait `fetchForShop` lever une erreur et la boucle écrit `items: []` pour ce PdV. Localement, avec le mode « avant », 13 PdV sur 33 auraient donc affiché un menu vide. Le lot supprime cette exposition.
- **Mesure navigateur** : faite après le merge local sur develop (commit `124caffe`, merge `05ceca07`, non poussé), voir section 14.

## 13. Erreur 500 sur GET /menu-components (2026-11-16)

- **Reproduit** avec le jeton du compte de test, quelle que soit la requête (`?limit=100`, sans paramètre, `?page=1&limit=10`) : 500 « Erreur interne du serveur », message générique.
- **Cause** : en rejouant la même requête Prisma (`findMany` avec `include`) sur la base locale, l'erreur est `P2021 : la table public.MenuComponentSeason n'existe pas`. La migration `20261103180000_menu_component_seasons` (saisons multi-choix des composants, en production depuis le 2026-11-03) n'était pas appliquée sur la base locale. Le code du backend est correct : `findAll` inclut `seasonLinks` depuis ce chantier.
- **Correction (base locale uniquement, aucun changement de code)** : exécution du seul SQL de cette migration (table neuve, idempotente, sans reprise de données) puis `prisma migrate resolve --applied`. Après : `GET /menu-components` rend 200 avec 43 composants et `seasonIds` présent (132 ms à froid, 14 ms ensuite grâce au cache Redis).
- **Pas de `migrate deploy`** : 3 migrations sont en attente en local, dont `20261102120000_shop_details_rpc_include_unmapped_locations` qui n'est pas suivie par git (travail en cours) ; je n'y ai pas touché. Restent en attente en local : cette dernière et `20261106100000_ventilation_deposit_checks` (les écrans de ventilation peuvent donc aussi renvoyer des 500 en local).
- **Production** : non vérifié. Le 500 vient d'une table manquante, donc il ne se produit en production que si la migration n'y a pas été appliquée ; la page Composants y fonctionne pour les utilisateurs, ce qui l'indique sans le prouver. Un `SELECT` sur `_prisma_migrations` en production le confirmerait (accord à donner).
- **Conséquence pour les mesures** : les captures locales des sections 10 et 11 comptaient ces 2 appels en erreur ; avec la table présente, ils rendent la liste complète (payload plus lourd, mais mis en cache 1 h côté serveur). Les temps de ces captures ne sont pas à comparer à un nouveau passage sans le noter. **Effet mesuré à la section 14 : la page fait désormais 43 appels `GET /menu-components/:id` que la liste en erreur lui épargnait.**

## 14. Mesure navigateur du correctif Event Predict (2026-11-16)

Protocole de la section 11 : même code (develop après merge `05ceca07`), serveur de dev et base locale, Chrome piloté par Playwright, compte de test. Mode « avant » : la route `GET /space-menu/space/:id/items` est refusée, donc le lot `hydrateForShops` échoue et la page retombe sur la boucle par PdV (preuve que le code tourne : les captures « avant » montrent l'échec de cette route puis les appels `/items`). Le mode « avant » compte 1 appel de plus que l'ancien code (la matrice part en parallèle). 65 s entre les passes, tour 1 avant puis après, tour 2 après puis avant, un passage de chauffe écarté (recompilation du serveur de dev). Chaque série fait une passe à froid (cache navigateur coupé) puis 2 passes à chaud. Résultats bruts : `scratchpad/pw/out/ab_ep_*.json`.

| Mode | Passe | Appels | Dernière réponse | Refus 429 sur `/space-menu/shop/:id/items` |
|---|---|---|---|---|
| Avant | chaud, série 1 | 116 | 5,6 s | 0 |
| Avant | chaud, série 1 | 112 | 4,2 s | 1 |
| Après | chaud, série 1 | 83 | 2,3 s | 0 |
| Après | chaud, série 1 | 89 | 2,2 s | 0 |
| Après | chaud, série 2 | 78 | 2,3 s | 0 |
| Après | chaud, série 2 | 89 | 2,3 s | 0 |
| Avant | froid, séries 1 et 2 | 116 et 116 | 4,8 s et 4,1 s | 7 et 10 |
| Après | froid, séries 1 et 2 | 83 et 83 | 4,7 s et 3,8 s | 0 |

- **À chaud : 4,9 s en médiane avant (4,2 et 5,6), 2,3 s après (2,2 à 2,3 sur 4 passes), soit environ 2,6 s de moins.** Les deux groupes ne se recouvrent pas (le plus rapide « avant » est à 4,2 s, le plus lent « après » à 2,3 s). Sous l'objectif de 3 s en local. Appels : 112 à 116 avant, 78 à 89 après (les 33 appels par PdV disparaissent, 2 appels groupés les remplacent).
- **À froid : gain non démontré.** 4,8 et 4,1 s avant, 4,7 et 3,8 s après : l'écart est dans la dispersion, avec 2 mesures par mode. Même constat que pour Commandes.
- **429 par PdV** : en mode « avant », 7 à 10 appels `/items` sur 33 sont refusés à froid (palier de 20 requêtes par seconde) et chaque PdV refusé reçoit une liste vide. Après le correctif, aucun.
- **Passes écartées** : la dernière passe de la série 2 « avant » n'a chargé que 9 appels (429 sur `/spaces/:id`, `/spaces/:id/configurations` et `/events` : la page n'a pas démarré, limiteur à la minute saturé par les passes précédentes). La première passe chaude de cette série a eu la liste `/menu-components` refusée (429), donc 73 appels sans la boucle ci-dessous, et 5,9 s malgré cela. Aucune des deux n'est comparable ; elles ne sont pas dans les médianes.
- **Nouveau constat, hors correctif : 43 appels `GET /menu-components/:id` à chaque chargement, dont 23 refusés (429), dans les deux modes.** La capture avant la réparation de la base (section 13) n'en contenait aucun (0 appel, la liste en erreur sautait la boucle) ; avec la liste qui répond, la page charge chaque composant un par un. C'est le N+1 décrit à la section 4. Il vaut un peu plus de la moitié des appels de la page et rien n'indique qu'il soit propre à la base locale : en production la liste répond, donc la boucle s'exécute. À traiter ensuite (un appel groupé ou un cache), après lecture de ce que fait la boucle quand un appel est refusé.
- **Reste sur Event Predict à chaud** (hors `/menu-components/:id`) : `ingredients` 7 appels et `product-menu` 5 appels ne sont PAS des doublons (aucune URL appelée deux fois : ce sont les pages d'un même catalogue, voir section 16). Doublons réels : `me` 2 fois et `predict-versions` 2 fois, hors chemin critique.
- **Limites** : localhost, build de développement, base locale (durées absolues non représentatives de la production) ; 2 passes chaudes « avant » valides contre 4 « après » ; aucune mesure en production. Ce qui est fiable : le nombre d'appels, la disparition des refus par PdV, l'ordre de grandeur du gain à chaud.

## 15. Correctif N+1 `GET /menu-components/:id` (2026-11-16)

Origine des 43 appels : `hydrateSubComponents` (`utils/componentCatalog.js`) lisait le détail de chaque composant sans recette, 5 à la fois, pour construire les `subComponents` de la feuille de course (appelé par `useSpaceData` et par `SpaceRestockView`). Il touche donc Event Predict et Commandes.

- **Piste écartée : reconstruire la recette depuis la liste.** `GET /menu-components` porte les mêmes relations (`ingredients`, `children`), mais la liste est en cache Redis 1 h et seuls `create`, `update` et `remove` l'invalident : `replaceIngredients` et `replaceChildren` (modification de la recette) ne le font pas, et un changement de fournisseur d'un prix de marché non plus. La feuille de course aurait pu afficher une recette ou un fournisseur périmé jusqu'à 1 h, alors que le détail est toujours lu en base. Ce trou d'invalidation existait déjà pour la page Composants. **Corrigé pour la recette** (commit 564359fc) : `replaceIngredients` et `replaceChildren` purgent maintenant la liste du tenant (`menu-components:<tenant>:*`), après le recalcul des coûts pour qu'une lecture concurrente ne remette pas un coût périmé en cache (3 tests, `menu-components.list-cache.spec.ts`). **Reste ouvert** : la modification d'un Ingredient ou d'un MarketPrice (nom, fournisseur) ne purge toujours pas cette liste, donc le fournisseur imbriqué peut y rester périmé jusqu'à 1 h. La route `by-ids` n'est pas concernée, elle ne passe pas par le cache.
- **Retenu : route groupée sans cache.** Backend, branche `perf/menu-components-batch-details` (worktree `datafriday-perf-menu-components-batch`), commit e76cf38b, mergée en local sur develop (4c0c4e8e), **non poussée** : `GET /menu-components/by-ids?ids=a,b,c` (100 ids au maximum), même `include` et même filtre d'accès par espace que `findAll` et `findOne`, passe par `findMany` en une requête, sans cache. Un id inconnu, supprimé, d'un autre tenant ou hors périmètre est absent de la réponse (le détail répondait 404 ou 403). Logique pure dans `services/menu-component-by-ids.ts` (découpage de la liste, filtre), méthode `findByIds` dans le service, route déclarée avant `:id`.
- **Frontend** : `getMenuComponentsByIds` (`menu.api.js`), `utils/componentDetailBatch.js` (lots de 50, échec toléré par lot), `hydrateSubComponents` lit par lots puis relit un par un seulement les ids des lots en échec. Un id absent d'un lot réussi n'est pas relu. **Ordre de déploiement sans risque** : si le frontend part avant le backend, la route `by-ids` est lue comme un identifiant, répond 404, le lot échoue et la boucle par composant reprend comme avant.
- **Tests** : backend 14 sur 14 (`menu-components.by-ids.spec.ts` : découpage, plafond, filtre d'accès, requête unique sans cache, validation de l'URL) ; frontend 16 sur 16 (`componentDetailBatch.spec.js`, y compris « même résultat par lot et par composant ») ; `bomPlanningComponentExplosion.spec.js` 17 sur 17 inchangé.
- **Équivalence sur la base locale** (le vrai service, `findByIds` contre `findOne`, un spec temporaire supprimé ensuite) : 106 composants, 6 tenants, 105 avec ingrédients, 15 avec composants enfants, **0 écart** ; un id d'un autre tenant ou inconnu est bien absent.
- **Mesure navigateur (2026-11-16, Event Predict, La Beaujoire, localhost, backend redémarré sur 4c0c4e8e)**. Route vérifiée avant : 200 avec 43 composants sur 43, 400 pour des ids invalides. Même code des deux côtés ; « avant » = route `by-ids` refusée par Playwright, la page retombe sur la boucle par composant (il compte 1 appel refusé de plus que l'ancien code). Ordre : chauffe, avant, après, après, avant, 65 s entre les passes, 2 passes chaudes par série (scripts `ab_mc.sh`, `summarize_mc.py`).

  | | Appels | `/menu-components/:id` | Refus 429 sur composants | Dernière réponse à chaud |
  |---|---|---|---|---|
  | Avant (`by-ids` refusé) | 80 à 84 | 43 | 24 (23 refus + l'appel `by-ids` refusé) | 3443, 2952, 2259, 3122 ms (moyenne 2944) |
  | Après | 40 à 47 | 0 (1 appel `by-ids`) | 0 | 1788, 1829, 2148, 1907 ms (moyenne 1918) |

  Le compte colle : 43 appels par composant supprimés, 1 appel groupé ajouté. Gain à chaud d'environ 1,0 s (35 %) sur la dernière réponse, en plus de la suppression des 23 refus qui laissaient des composants sans recette dans la feuille de course. **À froid : non concluant** (4085 et 2419 ms avant, 2290 et 5154 ms après, variation plus grande que l'écart). Un 429 isolé sur `/ingredients` dans une passe « après » à froid, sans lien avec ce correctif. **Limites** : localhost, build de développement, base locale, 2 passes chaudes valides par série ; les durées absolues ne valent pas pour la production, le nombre d'appels et la disparition des refus oui. Reste à mesurer Commandes (même fonction `hydrateSubComponents`, non capturée avec ce correctif).

## 16. Event Predict et Analyse après les correctifs (2026-11-16, localhost)

- **« Appels répétés » d'Event Predict : fausse piste.** `ingredients` ×7 et `product-menu` ×5 sont des pages (`fetchAllPaginated`, `getProductMappings` à 200 par page) d'un seul chargement de catalogue, avec des URL toutes différentes. Les vrais doublons sont `me` (2 ms) et `predict-versions` (127 ms, termine avant la fin de page) : aucun gain sur la fin du chargement, rien à corriger pour ça.
- **Chaîne critique d'Event Predict à chaud (1788 ms)** : démarrage de l'application (300 ms), contexte de l'espace (432 ms), catalogues dont la pagination de `product-menu` en 2 niveaux (550 à 885 ms), démarrage de la vue (955 ms), puis `event-timeline` (1104 à 1788 ms, 684 ms), dernier appel et seul à dépasser 300 ms. Sonde « `product-menu` refusé » : la vue démarre plus tard (1600 à 3295 ms), probablement parce que le client réessaie l'appel refusé ; **non concluante**, aucune conclusion sur le rôle de `product-menu`.
- **Analyse, capture du jour** (3 passes sur 2 espaces) : La Beaujoire, 35 appels, **2647 ms à chaud** (cible de 3 s tenue en local), 7627 ms à froid ; Marie Marving à froid 6312 ms, 39 appels. Sur Marie Marving à froid : un vide de 1 s après le démarrage, `shop-details` à 2945 ms (lecture lourde), puis une chaîne de 700 ms qui n'attend que sa fin (`builder-v2/state` à 5612 ms, `configurations/:id` ×3, `shops`, `shop-items`), dernière réponse à 6312 ms. `/preferences` : 498 ms, il se termine à 2224 ms et `loadSpace` ne démarre qu'à 2667 ms, donc le délai n'est pas entièrement dû aux préférences ici. **Pistes non appliquées** : détacher la chaîne de fin de `shop-details`, lancer `/preferences` en parallèle de `loadSpace` (en conservant la règle « préférence appliquée avant les paquets d'événements »), EXPLAIN en production du RPC `get_space_shop_details`.

## 17. RPC get_space_shop_details en production : EXPLAIN des requêtes internes (2026-11-16)

Cadre : lecture seule (`begin read only`, `set local statement_timeout`), `DIRECT_URL` du fichier production en lecture seule, accord d'Ulrich du jour. Définition lue dans `pg_proc` (fonction en production). Le RPC ne tourne pas en lecture seule (tables temporaires), donc seules ses requêtes internes sont mesurées, avec les listes d'ids explicites (configurations, PdV, locations) calculées comme dans la fonction. Un seul tenant concerné (`cmrpf3ukw0001bdu2h6rz0vbz`). **Limites** : une mesure par cas, premier passage en partie à froid, listes d'ids en littéral alors que la fonction les passe en variables PL/pgSQL (le plan peut différer), charge de la base non contrôlée.

| Espace | Locations | A : événements de l'espace (1er passage / chaud) | B : agrégat par minute (1er passage / chaud) | A réécrite (A2) |
|---|---|---|---|---|
| Adidas arena | 39 | **5 228 ms** / 312 ms | 2 396 ms / 775 ms | **3,6 ms** |
| Jean Bouin | 152 | 2 485 ms / 182 ms | 1 101 ms / 436 ms | 10,2 ms |
| Marie Marving | 70 | 1 033 ms / non rejoué | 249 ms / non rejoué | 4,7 ms |
| La Beaujoire | 63 | 55 ms | 28 ms | 3,4 ms |

- **Requête A (`_space_event_ids`) : le point chaud.** Le tenant n'a que 24 `WeezeventEvent`. Pour chacun, le plan parcourt tout l'index `WeezeventTransaction_tenantId_locationId_status_eventId_idx` sur les locations de l'espace, uniquement pour fabriquer un `DISTINCT` : 579 481 entrées d'index lues pour rendre 1 événement (Adidas arena), 260 589 pour 5 (Jean Bouin), 77 712 pour 3 (Marie Marving). Le coût suit le nombre de transactions de l'espace, pas le nombre d'événements.
- **Réécriture A2, à résultat identique** : `SELECT we.id, we."startDate" FROM "WeezeventEvent" we WHERE we."tenantId" = ? AND EXISTS (SELECT 1 FROM "WeezeventTransaction" t WHERE t."tenantId" = ? AND t."eventId" = we.id AND t.status = 'V' AND t."locationId" = ANY(locs)) AND NOT EXISTS (<filtre EventSalesSource inchangé>)`. Chaque événement s'arrête à sa première transaction trouvée. **Comparée à l'originale en production sur les 4 espaces : 0 ligne de différence dans les deux sens** (3, 1, 5 et 1 événements). Buffers touchés : 1 800 à 4 600 contre 20 000 à 48 000. L'identifiant `we.id` est une clé primaire, donc le `DISTINCT` n'a pas d'effet.
- **Effet attendu sur le RPC** (A + B, le reste est négligeable) : Adidas arena de 7,6 s à environ 2,4 s à froid et de 1,1 s à 0,8 s à chaud ; Jean Bouin de 3,6 s à 1,1 s à froid et de 0,6 s à 0,45 s à chaud ; Marie Marving de 1,3 s à 0,25 s. La Beaujoire ne change pas (80 ms). Cohérent avec la moyenne de 979 ms et le pire appel de 28 s de `pg_stat_statements` : la lenteur est à froid et sur les gros espaces.
- **Requête B (`_gran`) : le reste du coût.** Lecture de 246 942 lignes de `SpaceRevenueMinuteAgg` (Adidas arena) pour 2 540 groupes, 775 ms même à chaud, avec écriture temporaire sur disque (`temp written` 622 blocs). Elle est exécutée même en mode non granulaire (elle sert aussi au CA par PdV). Pas de réécriture proposée ici : elle demande de choisir entre un agrégat plus fin ou une pré-agrégation, à étudier.
- **Non fait** : aucune migration créée. Le correctif est un `CREATE OR REPLACE FUNCTION` ; la migration `20261102120000_shop_details_rpc_include_unmapped_locations` (non suivie par git, qui modifie la même fonction) devra être tranchée avant, sinon l'une écrase l'autre.

## 18. Démarrage d'Analyse : résultat du correctif (2026-11-16, localhost)

Code : branche `perf/analyse-startup-sequence` (85614888), mergée en local dans develop (c1d8e825), rien de poussé. Deux passes « avant » (ancien code) puis deux passes « après » (serveur de dev rechargé, marqueur `ALL_CONFIGS_CTX_AFTER_PHASE1_MS = 0` vérifié dans le chunk servi), 65 s d'écart, 3 captures par passe (La Beaujoire à froid et à chaud, Marie Marving à froid). Ce n'est pas un A/B à code égal : l'état du cache serveur varie. Preuve du bruit : sur le MÊME ancien code, Marie Marving à froid donne 6312, 3558 puis 2819 ms de dernière réponse.

- **Ce qui est confirmé** : les 109 appels de chaque capture sont en 200 (aucun 429) ; 35 appels (La Beaujoire) et 39 (Marie Marving), comme avant ; `event-timeline` et les paniers n'ont qu'un seul lot (pas de second lot de rafraîchissement). `/preferences` et `shop-details` se chevauchent : l'écart entre le début de `/preferences` et le début de `shop-details` passe de 314 à 509 ms à 105 à 222 ms (passes à chaud et Marie Marving). `shop-details` finit plus tôt, mesuré depuis le début de `/preferences` : 1778 à 1011 ms et 1057 à 302 ms sur Marie Marving, 389 à 227 ms et 327 à 124 ms sur La Beaujoire à chaud.
- **Gain sur le total : faible.** Dernière réponse mesurée depuis le début de `/preferences` (retire le bruit du démarrage de l'application), six passes : 2 871 / 2 261 / 2 222 / 1 379 / 2 447 / 1 805 ms avant, 2 912 / 2 036 / 1 718 / 1 339 / 1 883 / 1 848 ms après. Moyenne 2 164 à 1 956 ms (environ -10 %), écarts de -564 à +43 ms. Le gain net est sur La Beaujoire à chaud (chaîne finale 1,2 à 2,0 s après le début de `/preferences` avant, 0,5 à 1,5 s après : le repli à 3 s et l'attente de la fin de `shop-details` ont disparu). Sur Marie Marving à froid, l'estimation de 6312 à environ 5000 ms n'est PAS confirmée : 2819 à 2779 ms sur la passe comparable.
- **Pourquoi le gain est faible : `shop-details` n'était pas le chemin critique.** Dans l'ancien code, les catalogues (`menu-items`, `product-types`, `product-menu`) démarrent 65 ms après le début de `shop-details`, jamais après sa fin. Le chemin critique est : début de `loadSpace`, catalogues (pagination de `product-menu` sur 2 niveaux, 426 ms pour la première page puis 450 à 670 ms pour les 4 pages suivantes en parallèle, environ 1,1 s), puis la chaîne finale (`configurations/:id` ×3, `shops`, `shop-items`, 250 ms) qui part dès la fin de ce lot. C'est le même goulot que la chaîne critique d'Event Predict (section 16).
- **Défaut de ma propre attente** : `waitForPreferencesReady` est placée avant le lancement des catalogues (`useSpaceData.js`), donc ils démarrent à la fin de `/preferences` (Marie Marving : 1360 ms, catalogues à 1405 ms) alors que l'espace, les configurations et `shop-details` étaient prêts à 1233 ms. Coût mesuré : 0 à 130 ms. Le déplacer après le lancement des catalogues demande de retarder leur callback jusqu'au retour de la phase 1 (course sur `shopGranularData`), donc non fait.
- **Non vérifié** : le cas d'une période par défaut différente de celle du client (second rafraîchissement unique attendu), le log `[perf] reconcile`, le lien profond `?config=`. Les captures n'ont tourné qu'avec la préférence par défaut.
- **Prochain levier** : la pagination de `product-menu` (2 niveaux) et `menu-items` (867 ms), communs à Analyse et Event Predict, pas la séquence de démarrage.
- **Migration RPC (étape 2), contrainte découverte** : la migration non suivie `20261102120000_shop_details_rpc_include_unmapped_locations` (créée le 10/11, jamais commitée) n'est PAS déjà en production : sa fonction diffère de celle de production par 78 lignes de diff. Elle ajoute les caisses Weezevent non rattachées à un PdV dans le CA par PdV d'Analyse (4 223,81 EUR manquants pour SFP La Rochelle le 31/10/2026) et modifie aussi la requête A (`_space_event_ids`). Elle porte la mention « EXPLAIN à faire par le central avant application ». La réécriture A2 validée à la section 17 l'a été sur la définition de production : elle doit être refaite et revalidée sur la version de cette migration.

## 19. Audit de la migration non suivie `20261102120000_shop_details_rpc_include_unmapped_locations` (2026-11-16)

Cadre : production en lecture seule (`begin read only`, `DIRECT_URL`), base locale en transaction annulée (rien n'a été modifié, vérifié ensuite : 1136 mappings, fonction non migrée). Le diff de 78 lignes avec la fonction de production correspond exactement aux 3 changements annoncés dans son en-tête (aucun autre).

- **Utilité : confirmée.** CA HT des agrégats `SpaceRevenueMinuteAgg` sur des caisses sans aucun mapping, donc absent du CA par PdV d'Analyse : Aix arena 21 669,56 EUR (2,1 %, 6 caisses TACT du 14/11 et BIGOUDENE du 15/11), La Beaujoire 10 300,78 EUR (2,0 %, 2 caisses du 17 au 30/10), Jean Bouin 550,06 EUR (0,016 %, 2 caisses). Adidas arena, Marie Marving et Abbé Deschamps : aucun écart.
- **Effet visible, comparé au rollup `Event.revenue`** : Aix arena 14/11 (Tact) Analyse 497,99 EUR contre 21 992,49 EUR de rollup (97,7 % manquant) ; Aix arena 15/11 (PAUC/PSG) 9 317,55 contre 9 492,61 ; La Beaujoire 17/10 (Nantes-Dunkerque) 56 843,32 contre 61 049,48 (-6,9 %) ; La Beaujoire 30/10 (Nantes-Clermont) 67 156,70 contre 73 251,32 (-8,3 %). Avec la migration, la somme égale le rollup au centime sur les quatre.
- **Le cas cité dans la migration est déjà résolu en production** : SFP-La Rochelle 31/10 (Jean Bouin), caisse BUVETTE D (BODEGA), 4 223,81 EUR : la caisse a été rattachée depuis, la somme des agrégats (133 122,33 EUR) égale déjà le rollup. Le défaut reste actuel : il touche Aix arena depuis le 14/11.
- **Correction** : la migration s'applique sans erreur sur la base locale (fonction locale identique à celle de production). Adidas arena : sortie identique sur les 5 blocs (`shops`, `shopGranularData`, `events`, `menuItemCostMap`, `meta`). Caisse sans mapping simulée (BUVETTE E, Jean Bouin) : l'ancienne fonction émet 0 ligne, la migration 2 lignes pour 12 085,59 EUR, égal à la somme des agrégats ; `shopId` = id de la location, `shopName` = nom Weezevent, `shopType` vide ; les autres blocs ne changent pas.
- **Performance (production, EXPLAIN, état chaud, exécutions alternées)** : requête A (`_space_event_ids`) neutre, plans identiques, 0 à 5 % de lignes lues en plus. Requête B (`_gran`) : Adidas arena 390 -> 265 ms (-32 %, balayage bitmap de l'espace au lieu d'un accès aléatoire par index), Jean Bouin 118 -> 120 ms, Aix arena 42 à 61 -> 101 à 107 ms, La Beaujoire 23 -> 36 à 52 ms (+15 à +60 ms sur les petits espaces, le `OR` empêche d'utiliser `ANY(locations)` comme condition d'index). Le point chaud A (DISTINCT) n'est PAS corrigé par la migration ; la réécriture EXISTS reste valable sur sa liste élargie : 3 à 9 ms contre 48 à 312 ms à chaud. Non mesuré : l'exécution à froid de la migration (le cache ne peut pas être vidé en production) et la fonction entière (tables temporaires).
- **Effet de bord à connaître** : Event Predict additionne le `revenue` de toutes les lignes granulaires par événement passé (`caByPastEvent`, sans filtre sur les PdV du plan). Le CA historique d'Aix arena et de La Beaujoire montera donc au niveau du rollup : plus juste, mais les entrées des prédictions de ces espaces changent. Restock lit aussi cette sortie (non examiné en détail).
- **Verdict** : utile, correcte, sans coût de performance notable. À déployer. Recommandation : intégrer la réécriture EXISTS dans cette migration avant son premier commit (elle n'est pas déployée, donc modifiable) plutôt que d'empiler une seconde migration qui recopierait 355 lignes.
- **Commitée 4e7102d9 et mergée EN LOCAL dans develop 62f45dcc (17/11, go d'Ulrich « go pour tous »), NON poussée, NON déployée** : branche `perf/shop-details-rpc-unmapped`, worktree `datafriday-perf-shop-details-rpc` (depuis develop b9592e68), fichier `backend/prisma/migrations/20261116120000_shop_details_rpc_include_unmapped_locations/migration.sql`. C'est la migration d'origine plus la forme EXISTS : le seul changement de corps est le bloc `_space_event_ids`, l'en-tête documente les 4 changements, les chiffres de production et le retour arrière. Renommée en 20261116 car 20261103180000 et 20261106100000 sont déjà appliquées en production (lu dans `_prisma_migrations` ; la 20261102120000 ne l'est pas) : l'ancien horodatage serait hors ordre. Le fichier d'origine non suivi du checkout principal est intact (empreinte f117f1738fc9). Aucune autre branche ne redéfinit la fonction.
- **Vérifications faites sur la version préparée** : équivalence des deux formes de la requête A, sur la liste de locations de la migration, en production et en lecture seule, sur les 6 espaces : 0 événement de différence dans les deux sens (1, 5, 3, 1, 2 et 7 événements) ; `WeezeventEvent.id` est bien une clé primaire. Base locale en transaction annulée, 5 blocs de sortie identiques à la fonction actuelle (Adidas arena) et à la migration d'origine (Adidas arena, Jean Bouin, Jean Bouin avec une caisse sans mapping simulée) ; la base locale est restée intacte (1136 mappings, fonction non migrée).
- **Au déploiement** : Render exécute `npx prisma migrate deploy` avant `node dist/main` (migration appliquée toute seule). Aucun changement de code backend ni frontend. Le RPC est caché 60 s côté Redis : l'effet apparaît en moins d'une minute, sans purge. À contrôler ensuite dans Analyse : Aix arena 14/11 (Tact) doit afficher 21 992,49 EUR par PdV au lieu de 497,99, La Beaujoire 30/10 (Nantes-Clermont) 73 251,32 au lieu de 67 156,70. Retour arrière : rejouer le `CREATE OR REPLACE` de `20261016120000_shop_details_rpc_exclude_declared_sources`.
- **Original retiré (17/11, accord d'Ulrich)** : l'ancien `20261102120000_...` non suivi n'est plus dans le checkout principal (sinon deux migrations auraient redéfini la même fonction). Il est conservé, empreinte f117f1738fc9 inchangée, dans le scratchpad de la session : `sauvegarde_migration_20261102120000/`. La base locale ne porte PAS la migration (le serveur de dev ne migre pas) : `pnpm db:deploy` (garde-fou `db-guard`) l'appliquerait. Pas de push ni de déploiement sans go explicite.

## 20. Chargement de `mappings/product-menu` : mesure et mode « paires » (2026-11-17)

**Constat (production en lecture seule, captures navigateur de la section 18).**
- Plus gros tenant : 1333 mappings, environ 2,1 Ko par ligne en JSON (mapping 357 o, article de menu 787 o, produit 1004 o, prix 0), soit environ 2,8 Mo. Le front lit 200 lignes par page : une page 1 seule, puis 4 pages en parallèle, soit 7 requêtes pour ce tenant.
- La requête sur la table est triviale : 0,6 ms pour la page, 0,2 ms pour le comptage (index `tenantId`, 39 buffers). Le coût vient du reste de la route : trois lectures liées par les `include`, la TVA du tenant, l'enrichissement des prix et la sérialisation. Mesuré navigateur : 150 à 700 ms par requête, 0,9 à 1,5 s pour la chaîne complète.
- Ce que ces données servent à `useSpaceData` : seulement `{ weezeventProductId, menuItemId }` (lus dans `analyseDimensions.js` et `EventPredictView.vue`, les coûts viennent de `menuItems`).
- Pourquoi cela compte : dans la vague 2a, `product-menu` finit à 2613 ms sur la capture de référence alors que les autres catalogues finissent avant 1850 ms, et `configurations/:id` démarre 26 ms après. Quand le RPC est en cache (60 s), il retarde donc la suite de la chaîne d'environ 0,7 à 0,8 s. Quand le RPC est froid (plusieurs secondes sur les gros espaces), c'est lui le facteur limitant et le gain sera nul.

**Correctif (branche `perf/product-menu-pairs`, non commité à la rédaction).**
- Backend : `GET /mappings/product-menu?view=pairs` renvoie `{ weezeventProductId, menuItemId }` en un seul SELECT de deux colonnes, sans comptage, sans relations, sans enrichissement, plafonné à 20 000 lignes (`meta.truncated` si atteint). Même filtre (tenant, intégration, location) que le mode normal, construit par une fonction partagée dans `mappings.queries.ts`. Sans `view`, comportement inchangé.
- Frontend : `getProductMappings(locationId, { pairsOnly })`. Un vieux backend qui ignore `view` et pagine, ou un résultat tronqué, retombent sur la pagination complète : jamais de données partielles. Seul l'appel de `useSpaceData` l'utilise ; `StepMapMenuItems.vue` et `MenuItemView.vue` gardent la forme complète.
- Tests : 5 backend et 6 frontend passent, `useSpaceDataWaves.spec.js` (6) sans régression.

**Gain attendu, non mesuré.** De 0,9 à 1,5 s à environ 0,1 à 0,25 s pour ce chargement (une requête, un aller-retour base, environ 100 Ko), et 5 à 8 requêtes en moins par chargement d'espace. À confirmer en navigateur après redémarrage du backend local avec la branche.

## 21. Mode paires de `product-menu` : résultat navigateur (2026-11-17, localhost)

Méthode : même code, même serveur (backend redémarré avec le merge 4a016989), alternance sans/avec, un passage de chauffe non compté puis 2 passes sans, 2 passes avec, 65 s entre passes (limiteur local). « Sans » = Playwright retire `view=pairs` de la requête, donc le front retombe sur la pagination d'avant. Script `ab_pm.sh` et mode `BLOCK_BATCH=pairs` du harnais, hors dépôt.

| Espace (page Analyse) | Passes | Chargement terminé | Dernière réponse | Appels | `product-menu` |
|---|---|---|---|---|---|
| La Beaujoire, sans | 4 | 4528 ms en moyenne (3666 à 5442) | 3065 ms | 35 | 5 requêtes, chaîne de 0,8 à 1,6 s |
| La Beaujoire, avec | 4 | 3378 ms en moyenne (2883 à 3912) | 1979 ms | 31 | 1 requête, 0,1 à 0,2 s |

- Gain La Beaujoire : environ 1,15 s sur le chargement terminé (25 %) et 1,1 s sur la dernière réponse. Les 4 paires sans/avec vont dans le même sens. 4 appels en moins par page, comme attendu.
- Marie Marving : **non concluant.** Une seule passe « avec » exploitable (6646 ms), bornée par le RPC `shop-details` froid (fin à 4,6 s, contre 1,8 s et 3,8 s sur les deux passes « sans »). Le RPC varie plus d'une passe à l'autre que le mode paires ne change quoi que ce soit. Une passe « avec » s'est arrêtée après 5 appels (échec du harnais, sans erreur remontée) et est écartée.
- Réserve : 4 passes par mode, écart-type large (plusieurs centaines de ms). Le gain sur la chaîne `product-menu` elle-même est net (5 requêtes de 0,6 à 1,6 s contre 1 requête de 0,06 à 0,2 s), le gain sur la page entière est du bon ordre mais pas mesuré avec précision.
- Les passes « avec » montrent aussi un RPC `shop-details` plus tôt sur La Beaujoire (fin à 0,7 à 1,4 s contre 1,0 à 2,4 s). Constaté, pas expliqué : moins de requêtes simultanées sur la base est une piste, non vérifiée.

## Reste à mesurer

| Mesure | Ce qu'il faut |
|---|---|
| Origine des appels à 26 s de la timeline sur 30 événements | Mécanisme établi (section 7) : lecture lourde en soi (meilleur appel 3 s), 74 000 à 94 000 tampons touchés pour 512 Mo de tampons partagés. Reste à savoir quel espace les produit : attendre les lignes `[SlowRead]` après déploiement de la branche `perf/slow-read-log`. |
| Fréquence réelle des échecs de cache de Cost tracking et de la timeline | Compter les appels par jour sur la période récente, pas sur 53 jours (Cost tracking n'existe en production que depuis le 2026-10-23). |
| EXPLAIN en production des requêtes internes du RPC `get_space_shop_details` | **Fait le 2026-11-16, section 17.** Cause trouvée (requête A) et réécriture à résultat identique mesurée ; reste la requête B (agrégat par minute) et le déploiement. |
| Temps avant premier contenu utile par page, à froid et à chaud | Serveur de dev lancé par toi, puis onglet Network (ou capture HAR) sur Analyse, Commandes, Event Predict, Inventaire. |
| Nombre et poids des requêtes au chargement de chaque page | Même capture HAR. |
| `/live/inventory` : taille et durée | Dépend du point 2 (consommation) ; à mesurer après un éventuel cache. |

## Ce que ces mesures changent au plan

- **Consommation Logistique : rétrogradée.** Elle coûte 0,2 s à chaud en production, pas 6,5 s. La branche réduit la charge de la base et supprime les lectures périmées, mais elle ne règle pas les pages lentes. À ne pas présenter comme le gain principal.
- **RPC shop-details** : mesuré en production le 2026-11-16 (section 17). Une requête interne lit des centaines de milliers d'entrées d'index pour rendre 1 à 5 lignes ; une réécriture à résultat identique la ramène à quelques ms. Pas de refonte, un remplacement ciblé.
- **Paniers** : travail côté transfert (poids), pas côté SQL.
- **pg_stat_statements (section 5) : fait.** La consommation Logistique pèse 1,2 % du temps de base, confirmé. Les plus gros consommateurs côté lecture sont la timeline par événement sur 30 événements (23 % avec ses variantes, dont 16,5 % pour la lecture probablement émise par Cost tracking) et les paniers (6,8 %).
- **Lecture timeline / Cost tracking sur 30 événements : EXPLAIN fait (section 6).** 0,4 à 2,4 s sur les quatre plus gros espaces, donc les 26,6 s de moyenne ne sont pas reproduits. Ce qui est établi : le plan est instable (lecture par événement ou lecture de tout l'espace selon l'espace) et le commentaire du code sur l'index par minute ne décrit plus le plan réel. Mécanisme et réécriture testée en section 7 (30 branches, 1,7 à 3,7 fois plus rapide en tiède, non appliquée). Journalisation des lectures de plus de 5 s prête sur la branche `perf/slow-read-log`, à déployer pour savoir quel espace produit les appels lents.
- **Le travail de fond pèse lourd** (DELETE d'agrégats 14 %, `observedEventSpans` 19 %) et partage le disque avec les pages. À traiter comme cause possible de lenteur des lectures, pas comme chantier séparé.
- **Capture navigateur, Analyse (section 8) : faite.** 6,2 s jusqu'à la dernière réponse, aucun appel au-dessus de 0,8 s, réseau actif 2,4 s sur 6,2 s : problème de séquence frontend (préférences bloquantes 777 ms, 2,05 s de démarrage, vagues successives, appels répétés), pas de SQL. **Le Lot 1 (frontend) passe devant les lots base de données pour les pages déjà en cache.** Restent à capturer : Commandes (propre), Event Predict, Analyse à froid (cache serveur vide).
- **Capture navigateur, Commandes (section 9) : partielle.** Environ 4,6 s ; première vague de 8 appels en parallèle mais chacun autour de 1 s (hypothèse de ralentissement par salve, non vérifiée), `shop-details` 2,26 s, `logistics/stock` lancé seul 3,1 s après le départ. Les trois captures collées étaient des copies du même journal : refaire avec la version 2 du script.
- Lot 1 (frontend) inchangé, mais ses gains ne seront chiffrables qu'avec la capture navigateur.
