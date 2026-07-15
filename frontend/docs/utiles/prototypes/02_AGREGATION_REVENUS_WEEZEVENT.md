# Rapport détaillé — Agrégation des revenus / pipeline ventes

> Confrontation entre le prototype Supabase KV (2024) et `PEPITES_EXTRAITES.md` §3
> (SpaceRevenueMinuteAgg, formule revenue, étapes de progression, prévention resync).
>
> **Fichiers lus intégralement** : `aggregation_helper.tsx`, `aggregation_queue.tsx`,
> `event_revenue_helper.tsx`, `transaction-distribution.tsx`.
> **Fichiers lus par plages** dans `index.tsx` : lignes 1-260, 2985-4900, 5216-7660, 12287-12376.

**Précision préliminaire importante** : `aggregation_helper.tsx` et `aggregation_queue.tsx` ne
calculent PAS de revenu événement/shop — ils agrègent coût/prix moyen/marge au niveau
Category/Type du **catalogue Menu Item** (avec un système de dirty-tracking en mémoire + KV,
`processDirtyAggregations`). C'est un sous-système différent, sans rapport avec
Weezevent/`SpaceRevenueMinuteAgg`. Traité en section 4 de ce rapport.

## 1. Correspondances confirmées

- **Formule ligne-item comme socle du revenu**. `event_revenue_helper.tsx:82-89` fait
  `SUM(Total_HT)` groupé par `Long_ID` (transaction) — mathématiquement identique à sommer tout
  `Total_HT`, le groupement ne sert qu'au comptage de transactions. C'est l'ancêtre direct de la
  « recalculation par items » documentée en **PEPITES §3.2** (`SUM(unitPrice × qty − reduction)`),
  utilisée aujourd'hui pour la ventilation produit.
- **Fenêtre temporelle bornée par `eventEndDate`**. `index.tsx:6491-6494, 6653-6676, 6870-6876,
  6912-6918` : si `eventEndDate` existe et diffère de `eventDate`, la requête devient
  `[eventDate, eventEndDate]` et un `eventEndTime` filtre les transactions du dernier jour après
  l'heure de fin. C'est exactement la règle de **PEPITES §3.2** (« borner par `eventEndDate` …
  sinon les concerts finissant après minuit et festivals multi-jours perdent des transactions »).
- **Le piège « deux formules qui s'écrasent » se voit naître ici**. `index.tsx:3532-3572`
  (`calculate-revenue`) : deux chemins écrivent le même champ `event.event_revenue_HT` — les
  données « wizard » (`event-revenue-calculation:{spaceId}`) et un recalcul « legacy » direct sur
  `fnb_sales_raw` — avec une logique de synchro qui écrase l'un par l'autre si
  `event.event_revenue_HT !== wizardData.revenue`. C'est la préfiguration concrète du piège
  **PEPITES §3.2** (« deux services écrivaient la même table avec des formules différentes … le
  dernier écrasait l'autre silencieusement »), présenté dans le doc comme résolu.
- **Delete-then-recreate comme anti-pattern originel**. `index.tsx:5903-5922`
  (`sales/process-event-timeline`) supprime *tous* les `event-timeline:{eventId}` du space avant de
  tout recalculer. C'est précisément l'anti-pattern que **PEPITES §3.4 point 1** identifie comme
  « fix racine » (sync idempotent, jamais delete+insert) suite à l'incident du 2026-07-04 — le
  prototype est la preuve vivante du problème que la doc corrige.
- **Étapes de mapping = ancêtres des steps X/5**. `shop-element-mapping:`
  (`transaction-distribution.tsx:37-44`, `index.tsx:3887-3907`) et
  `menu-item-mapping:`/`menu-mappings:{spaceId}` (`index.tsx:6019-6037`) correspondent
  respectivement à **PEPITES §3.3** `step2_shops_mapped` et `step3_menu_mapped`. Les warnings
  runtime (`index.tsx:7044-7050`, « Complete Step 2/Step 3 ») montrent que le wizard structurait
  déjà le mapping en étapes numérotées avant la formalisation actuelle en `X/5`.
- **« Couvrir les dates ≠ avoir agrégé »**. `sales/get-unregistered-dates` (`index.tsx:7274-7506`)
  calcule exactement `unregisteredDates` par diff entre dates de vente brutes et dates d'Event
  DataFriday enregistrées — c'est le calcul qui gate le bouton de sync selon **PEPITES §3.3**
  (`unregisteredDates.length === 0`).
- **Absence de record = zéro implicite**. `calculate-single-shop-revenue` (`index.tsx:4497-4498`)
  ne crée une entrée que `if (totalRevenue > 0)` — aucun record pour un shop sans vente. C'est
  cohérent avec **PEPITES §3.1** (`dataPoints`/`0 pt = rien d'agrégé`).

## 2. Divergences

- **Aucune notion de `tx.amount` authoritative**. Le prototype n'a qu'une seule source : la ligne
  CSV `fnb_sales_raw.Total_HT`, importée telle quelle (pas de distinction TTC/HT calculée, pas de
  champ « montant panier » séparé des lignes). Le concept PEPITES §3.2 de « `tx.amount` = valeur
  authoritative du panier caisse, distincte de la recalculation item » **n'existe pas** dans ce
  prototype — il n'y avait qu'un seul niveau de granularité (la ligne produit), donc pas de risque
  de divergence ±1-2 %, mais aussi pas de garde-fou de cohérence entre deux niveaux. Clairement
  l'ancienne approche, remplacée par le modèle à deux niveaux actuel.
- **Fenêtre temporelle : nuance non reprise dans le doc actuel — événements multiples le même
  jour**. `index.tsx:6496-6556` calcule un `windowStart`/`windowEnd` pour des événements
  consécutifs le même jour dans le même space (ex. deux concerts) : le début de fenêtre du 2e
  événement = fin du 1er + 1 minute, et un événement multi-jour qui déborde sur le lendemain fixe
  le `windowStart` de l'événement suivant. **PEPITES §3.2 ne mentionne que le cas multi-jours**
  (`[eventDate, eventEndDate+1j[`), pas le cas « plusieurs événements le même jour partageant le
  même flux de caisse ». À vérifier si l'architecture `SpaceRevenueMinuteAgg` actuelle gère ce cas
  (bornage par minute devrait le permettre nativement, mais ce n'est documenté nulle part).
- **Modèle TVA/remise inexistant**. Aucune ligne du prototype ne traite de `vatRate` ni de
  remise/`reduction` — `Total_HT` est un champ pré-calculé du POS. Le riche modèle actuel (3 champs
  TVA distincts, remises ±1-2 %) n'a pas d'équivalent ici : divergence par absence totale, pas par
  contradiction.
- **Timeout dur à 50s (`index.tsx:123-147`)** expliquant l'architecture fragmentée en jobs +
  polling de progression (`finalization-progress:*`, `event-timeline-progress:*`) — contraste avec
  **PEPITES §3.3** qui note qu'aujourd'hui `POST /aggregation/synchronize` est un unique appel
  synchrone pouvant dépasser 60s. C'est une contrainte d'infra disparue, pas une règle métier
  perdue, mais elle explique pourquoi le prototype multipliait les endpoints de statut/progression.

## 3. Pépites nouvelles

- **Bug de clé de suppression « EMERGENCY: Clear ALL shop revenue »** (`index.tsx:4192-4253`). Le
  endpoint reconstruit la clé à supprimer via `shop-event-revenue:${record.eventId}:${record.shopName}`,
  alors que les deux endpoints d'écriture stockent respectivement sous
  `shop-event-revenue:{eventId}:{elementId}` (`index.tsx:4009-4011`) et
  `shop-event-revenue:{eventId}:{shopName}:{safeEventName}:{eventDate}` (`index.tsx:4517-4520`) —
  aucun des deux ne correspond à la clé reconstruite. Le endpoint juste au-dessus
  (`/shop-revenue/:location`, `index.tsx:4112-4190`) utilise correctement `row.key` (la vraie clé
  lue). Résultat : « EMERGENCY: Clear ALL » incrémente `totalDeleted` sans réellement supprimer les
  enregistrements → un outil de purge qui ment sur ce qu'il a fait. C'est une classe de bug (dérive
  de format de clé pour la même entité) pertinente à surveiller côté Prisma/FK aujourd'hui (thème
  proche de **PEPITES §3.4** mais un cas concret non documenté).
- **Dédoublonnage défensif d'événements par `eventName+eventDate`** (`index.tsx:4380-4396`,
  `calculate-single-shop-revenue`) : détection explicite de doublons manuels d'événements (même
  nom+date, IDs différents) pour éviter de compter deux fois le revenu shop. Edge case de saisie
  non mentionné dans le doc actuel.
- **Formules per-capita / moyenne panier / moyenne événement** :
  `perCapita = revenue / ticketsScanned` (`index.tsx:3015-3023, 3627-3631`),
  `averageSpendPerTransaction = revenue / transactionCount` (partout), et un `avgEvent` sauvegardé
  au niveau space (`index.tsx:3358-3400`). Aucune de ces trois métriques n'apparaît dans
  `PEPITES_EXTRAITES.md` — à vérifier si elles sont recalculées ailleurs aujourd'hui (Analyse ?) car
  elles semblent utiles et non capturées.
- **`transaction-distribution.tsx` — analyse de composition de panier, absente du doc actuel**.
  Pour chaque transaction (`Long_ID`), le prototype construit l'ensemble des `type` de menu item
  achetés ensemble, trie et joint en une clé « combinaison » (ex. `"Beverage + Food"`), puis compte
  les occurrences par shop et par date (`transaction-distribution.tsx:150-236`). Décision
  explicite : **si aucun Event DataFriday n'est enregistré pour le space, rien n'est traité** — pas
  de fallback sur toutes les dates brutes (« No, for now let's stick to events » ligne 94-96) : la
  distribution par type dépend strictement des events enregistrés, contrairement à
  `get-unregistered-dates` qui lui les découvre. Cette analyse de panier (mix Food/Beverage par
  transaction) n'a pas d'équivalent documenté dans l'architecture `SpaceRevenueMinuteAgg` actuelle —
  qui agrège à la minute et perd potentiellement le détail « quels items étaient dans le même
  panier ». **Point ouvert à trancher** : cette granularité existe-t-elle encore côté
  `WeezeventTransaction`/items aujourd'hui, ou a-t-elle été perdue au passage à l'agrégation par
  minute ?
- **Item non mappé → bucket `'Uncategorized'` explicite** (`transaction-distribution.tsx:69-75,
  194`), distinct du fallback par `shopType` documenté en **PEPITES §1.5** (Event Predict) — même
  problème (item non identifié), traitement différent (bucket générique vs. repli
  `shopType`-based). Utile pour comparer les deux stratégies si le sujet ressort.
- **Bug mort actif dans `sales/process-event-timeline`** : `index.tsx:6060-6061` référence
  `formatDateKey(...)` et `dateToEventId[...]`, deux identifiants jamais définis dans ce fichier
  (recherche confirmée : occurrence unique). C'est un reliquat de debug ad hoc (tracking spécifique
  « Budweiser » pour l'événement « L'entourloop », visible dans tout le bloc
  `🍺 BUDWEISER TRACKING` lignes 6024-6321) qui provoque un `ReferenceError` — donc un crash 500 —
  dès qu'une ligne de vente avec `itemName`+`placedDate` est traitée, c'est-à-dire quasi
  systématiquement. Ce endpoint bulk était donc cassé en pratique pour tous les spaces au moment de
  l'archivage. Illustre bien pourquoi ce prototype a été abandonné — à ne pas reproduire (code de
  debug ad hoc laissé dans un chemin partagé).
- **Retry avec réduction de chunk size sur timeout Postgres** (`index.tsx:161-194`, code `57014`)
  et **montée progressive du chunk size en cas de succès consécutifs** (`index.tsx:236-240`) —
  pattern de résilience réseau qui n'a pas d'équivalent documenté, potentiellement utile si des
  timeouts similaires réapparaissent côté Prisma/pooler (cf. mémo `project_db_connection_pooler_config`).

## 4. Mort / hors-sujet

- **`aggregation_helper.tsx` + `aggregation_queue.tsx` en entier** : agrégation coût/prix
  moyen/marge par Category/Type de menu item, avec dirty-tracker en mémoire par instance d'edge
  function (`aggregation_queue.tsx:15-20` — problématique en soi, un tracker en mémoire ne survit
  pas au cold-start serverless). Aucun rapport avec le revenu événement/shop ; thème proche mais
  distinct de **PEPITES §1.4** (chaîne prix/coût/marge), sans rien y ajouter d'utile — le modèle
  actuel (`MenuItemPricingService`) a une architecture totalement différente. (Le contenu de
  cette agrégation, en tant que fonctionnalité, est repris comme pépite dans le rapport taxonomie
  — voir 03_TAXONOMIE_CATALOGUE.md.)
- **Tout le modèle `fnb_sales_raw` / CSV Odoo (`Location`, `Shop`, `Item`, `Long_ID`,
  `Placed_at_date/time`, `Total_HT`)** : table Postgres brute alimentée par import manuel, aucune
  notion de `WeezeventTransaction`/`WeezeventProduct`. Structure de données entièrement remplacée.
- **Cache manuel `sales-summary-cache:{spaceId}` avec TTL 60 min et invalidation via routes
  dédiées** (`index.tsx:5339-5373, 5516-5557`) : mécanisme de cache KV ad hoc, sans rapport avec
  l'architecture actuelle basée sur agrégats en base.
- **Endpoints de nettoyage/legacy** (`shop-revenue-legacy-cleanup`, formats de clés
  `shop-revenue-total:*`/`shop-revenue-event:*`, `index.tsx:4255-4315`) : dette technique propre au
  KV store, sans valeur pour la doc actuelle.
- **`location-space-mapping` / `space-sales-locations`** (mapping shop-string ↔ space,
  `index.tsx:4814-4899`) : remplacé par `WeezeventLocationSpaceMapping` typé relationnellement.
