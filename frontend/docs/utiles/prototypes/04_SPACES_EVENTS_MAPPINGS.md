# Rapport détaillé — Spaces, configurations, events, teams, mappings

> Confrontation entre le prototype Supabase KV (2024) et `DESIGN_TEAMS_SPORT_EVENTS.md` +
> `GUIDE_PARCOURS_APP.md`.
>
> **Fichiers lus intégralement** : `kv_store.tsx` (104 lignes).
> **Fichiers lus par plages** dans `index.tsx` (12789 lignes) : L282-1001 (spaces/configurations/
> areas/margin), L2547-2985 (events/teams/sponsors/csv-mappings), L4723-5213 (fb-integrations/
> location-mappings/kv générique), L9041-10500 (toute la famille migrate-*/rebuild-*/cleanup-* +
> shop-element-mappings CRUD).

## 0. Le socle : kv_store.tsx

`kv_store.tsx` L1-105 est une table Postgres unique `kv_store_eb31619c(key TEXT PRIMARY KEY, value
JSONB)` avec 7 fonctions (`set/get/del/mset/mget/mdel/getByPrefix(WithKeys)`). Aucune contrainte,
aucun schéma, aucune relation FK — tout objet métier (space, config, event, team...) est un blob
JSON adressé par une clé texte préfixée (`space:${id}`, `config:${id}`, `event:${id}`...). Toute la
logique de « relation » (config→space, mapping→space) est reconstruite applicativement en filtrant
des listes en mémoire après un `getByPrefix`, jamais en base. C'est la clé de lecture de tout le
reste : chaque route `index.tsx` n'est qu'un pattern get/filter/set sur ce KV.

## 1. Correspondances confirmées

- **Ce fichier EST la « make-server morte »** citée par `DESIGN_TEAMS_SPORT_EVENTS.md` L23
  (« make-server Edge Function, projet Supabase uvxx, aujourd'hui mort → 500/522 »). `index.tsx`
  L2916-2935 (`GET/POST /make-server-eb31619c/teams`) est très probablement l'implémentation exacte
  de ce endpoint mort. Ce n'est pas une simple ressemblance : c'est littéralement le code source du
  service que le doc actuel décrit comme cassé.
- **Registry + Placement (Builder)** : `GUIDE_PARCOURS_APP.md` L266 décrit « `FBElementRegistry`
  (propriétés partagées) + `FBElementPlacement` (position par configuration) ». Le prototype a
  exactement ce pattern : `config.data.fbElementsRegistry` (registre partagé) et
  `floor.elements[].registryId` (placement par floor/configuration) — voir `index.tsx`
  L9659-9697 (construction de `floorIdToRegistryId` à partir de `configData.fbElementsRegistry` +
  `floors[].elements[].registryId`).
- **Espaces → Configurations (1-N)** : `index.tsx` L644-739 (`GET /spaces/:spaceId/configurations`,
  filtre `config.spaceId === spaceId`) correspond à la hiérarchie Space→Configuration de
  `GUIDE_PARCOURS_APP.md` L123-125 (carte mentale) et section 5 (Builder).
- **Areas ≈ filtre transverse actuel** : `index.tsx` L766-801
  (`GET/POST /spaces/:spaceId/areas`, stockage `space:${id}:areas` = tableau plat indépendant des
  configurations) correspond au concept « Area » du doc actuel — `GUIDE_PARCOURS_APP.md` L263
  (« Lier l'élément à une Area ») et L367 (`selectedShopAreas` comme filtre d'Analyse). Le terme
  « Area » (pas « zone ») est bien celui du doc actuel aussi.
- **Event → référentiels Type/Category/Subcategory** : `index.tsx` L2768-2913 (CRUD
  `event-type:`/`event-category:`/`event-subcategory:`) correspond à `GUIDE_PARCOURS_APP.md`
  L293-299 (hiérarchie Type→Catégorie→Sous-catégorie).
- **Sponsor comme attribut d'event** : `index.tsx` L2938-2957 (`sponsor:` CRUD) correspond à
  `GUIDE_PARCOURS_APP.md` L306 qui liste « sponsor... » parmi les attributs d'un Event.
- **Import CSV d'events** : `index.tsx` L2961-2981 (`csv-mappings:events`, un mapping colonnes
  persistant) correspond à `EventsImportWizard` décrit en `GUIDE_PARCOURS_APP.md` L308.
- **Sélection d'events passés pour la prédiction** : `index.tsx` L336-373
  (`predictive-event-selection`, associe un `futureEventId` à une liste `selectedEventIds`) est
  l'ancêtre direct du parcours Predict décrit en `GUIDE_PARCOURS_APP.md` section 8 (« le moteur lit
  l'historique des ventes (events passés similaires) »).

## 2. Divergences (ancien modèle, remplacé)

- **`homeTeam` était un attribut du SPACE, pas de l'Event.** `index.tsx` L611 : commentaire
  « Update space details (name, homeTeam, etc.) » sur `PATCH /spaces/:id` (L612-642, simple spread
  `{...space, ...body}` sans whitelist). Le modèle cible de `DESIGN_TEAMS_SPORT_EVENTS.md` L47-49
  déplace délibérément `homeTeamName` sur l'**Event** (texte libre), en note explicitement pourquoi :
  « souvent l'équipe résidente du lieu » — donc le prototype avait la version naïve (home team =
  propriété fixe du lieu), le nouveau modèle la rend event-scoped pour gérer un même lieu accueillant
  des compétitions différentes. C'est une évolution de modélisation directement traçable.
- **Team = blob KV sans scoping ni FK, aucune notion de tenant.** `index.tsx` L2916-2935 :
  `GET /teams` renvoie `kv.getByPrefix("team:")` brut, `POST /teams` fait
  `kv.set(team:${id}, team)` sans validation. Aucun champ
  `eventCategoryId`/`eventSubcategoryId`/`tenantId` n'est imposé côté serveur (contrairement au
  modèle cible `Team { id, name, tenantId, eventCategoryId?, eventSubcategoryId? }` de
  `DESIGN_TEAMS_SPORT_EVENTS.md` L38). Aucun endpoint PUT/DELETE pour teams (contrairement à
  `event-types`/`event-categories` qui ont bien PUT+DELETE, L2802-2913) — Team est un citoyen de
  seconde zone dans ce prototype. Aucune relation Event→Team n'existe nulle part dans le fichier
  (`grep visitingTeam/homeTeam` ne remonte que le commentaire L611) : l'ancien Event est un blob
  totalement plat, sans FK vers Team.
- **Aucune isolation multi-tenant.** Tout le KV est un espace de clés global (`space:*`, `event:*`,
  `team:*`...) sans préfixe organisation/tenant. C'est la différence architecturale la plus
  radicale avec l'actuel (mémoire : durcissement Auth & multi-tenant, isolation Prisma auto via
  nestjs-cls). Le prototype n'a jamais eu cette contrainte — il a été conçu comme un backend
  mono-client.
- **Aucune couche de validation/DTO.** `POST/PUT /events` (L2695-2716) stocke le body JSON du
  client tel quel (`kv.set(event:${id}, event)`). Pas de whitelist de champs — à l'opposé du plan
  `DESIGN_TEAMS_SPORT_EVENTS.md` L111 qui exige explicitement un DTO whitelistant
  `homeTeamName, visitingTeamId, visitingTeamName`.
- **Mapping shop→élément par NOM, pas par ID stable** : `index.tsx` L10307-10444 montre que les
  mappings `shop-element-mapping:{spaceId}:{shopName}` sont indexés par **nom de boutique**
  (texte), et l'`elementId` référencé a changé de nature en cours de route (floor element ID →
  « registry ID », cf. section 3). C'est le même point de fragilité que le mapping actuel (mémoire
  `project_shop_drawer_server_availability` : « itemKey = NOM du référentiel front »), donc pas
  vraiment résolu, juste déplacé.

## 3. Pépites nouvelles (règles métier / edge cases absents de nos docs actuelles)

- **Le même bug de fond que le « démapping Data Integration » actuel existait déjà ici, en pire.**
  La mémoire note (`project_data_integration_unmapping_rootcause`, 2026-06-28) :
  « SpaceElement.id régénéré au saveConfiguration (delete+recreate) → mappings orphelins ». Le
  prototype avait exactement cette classe de bug : `index.tsx` L9620-9790
  (`migrate-shop-element-ids`) existe spécifiquement parce que les mappings shop-element
  pointaient vers des **floor element IDs** volatiles au lieu de **registry IDs** stables, cassant
  le lien à chaque re-sauvegarde du plan. Il a fallu un endpoint dédié pour rescanner tous les
  configs, reconstruire une table `floorIdToRegistryId`, et re-résoudre chaque mapping cassé. Puis
  `cleanup-shop-mappings` (L9792-9878) existe pour purger les doublons issus de cette même
  migration mal terminée (garder la version « registry-» et supprimer les anciennes).
  **Enseignement direct pour l'actuel** : ce n'est pas un accident isolé, c'est une classe de bug
  récurrente dès qu'un identifiant d'élément dérivé du plan (position/floor) sert de clé stable
  pour un mapping externe — un outil de diagnostic/réparation générique (façon
  `diagnose-menu-mappings`, `debug-shop-mappings`) pourrait valoir la peine d'être industrialisé
  côté NestJS plutôt que reconstruit au coup par coup.
- **Un bug de réparation resté cassé dans le prototype lui-même** :
  `shop-element-mappings/by-element/:spaceId/:elementId` (L10447-10489) et
  `shop-revenue/by-element/:spaceId/:elementId` (L10492+) font
  `kv.get('location-space-mappings')` (clé plurielle, sans préfixe) puis lisent `.value` — mais
  nulle part dans le fichier cette clé consolidée n'est écrite sous cette forme (seule
  `location-space-mapping:{location}` au singulier avec préfixe existe, gérée individuellement).
  Résultat : `locationMappings?.value` est toujours `undefined`, la boucle ne trouve jamais la
  `location`, et l'endpoint retourne `{success:true}` **sans rien supprimer**, silencieusement.
  Même défaut à `shop-element-mappings/delete` (L10397-10444) : `consolidatedData?.value` alors
  que `kv.get()` renvoie déjà la valeur déballée (cf. `kv_store.tsx` L33-40) — donc la mise à jour
  de la table consolidée après un batch-delete échoue systématiquement en silence. **Leçon
  utile** : ce genre de « suppression qui ne supprime rien mais répond success:true » est le pire
  type de bug de mapping — invisible tant qu'on ne compare pas le compte réel avant/après. Vaut la
  peine de vérifier qu'aucun pattern analogue n'existe côté NestJS (retour 200 sans vérifier
  l'effet réel d'une opération de nettoyage).
- **Ordre de priorité à 3 niveaux pour résoudre le revenu d'un event** : `index.tsx` L2547-2693
  fusionne trois sources concurrentes avec une hiérarchie explicite : 1) `granular-records` (détail
  transaction par shop, source de vérité utilisateur), 2) `wizard` (calcul batch sauvegardé, source
  primaire des tickets scannés), 3) `individual` (`event-revenue:*`, fallback). Et une règle fine :
  `ticketsScanned` manuel sur l'event prime toujours, sinon on retombe sur le wizard, sinon une
  dérivation `revenue/perCapita`. C'est une règle métier de résolution de conflits multi-sources
  non documentée ailleurs et potentiellement transférable telle quelle à la logique actuelle
  d'intégration F&B/Analyse (mémoire : Digifood, WeezeventTransaction, Logistic ledger) si un jour
  plusieurs sources de vente coexistent.
- **Cache KV maison avec invalidation manuelle dispersée** : quasiment chaque route de mutation
  (`POST /spaces`, `PATCH /spaces/:id`, `POST/DELETE /configurations`,
  `POST /location-space-mappings`...) doit explicitement faire
  `kv.del("all-spaces-cache")`, `kv.del(space-configs-cache:${id})`, etc. C'est fragile par
  construction (oublier un point d'invalidation = données périmées silencieuses) — retenir cette
  leçon si l'actuel introduit davantage de caches applicatifs (mémoire mentionne déjà « cache
  spaceShops » dans l'audit perf Analyse) : préférer une invalidation centralisée/dérivée plutôt
  que des `kv.del` copiés-collés à chaque route.
- **Migration de format de clé en historique vivant** : la présence simultanée de
  `migrate-location-to-spaceid`, `migrate-menu-item-mappings` (ancien format 2 segments → nouveau
  3 segments avec spaceId), `copy-menu-mappings` (dupliquer les mappings d'un space vers un autre),
  et `diagnose-menu-mappings` (compte les mappings par space, détecte le format legacy) montre
  qu'un changement de clé primaire (location texte → spaceId) a dû être fait en production, à
  chaud, avec tolérance à la coexistence des deux formats. Si un changement similaire de clé
  primaire est un jour nécessaire côté Prisma (ex. renommage d'un identifiant métier), ce triptyque
  diagnose→migrate→cleanup est un bon patron à reproduire plutôt qu'un simple script one-shot.

## 4. Mort / hors-sujet (spécifique au store KV, sans valeur pour Prisma/NestJS)

- `kv_store.tsx` en entier : get/set/mget/mset/getByPrefix génériques sur une table clé-valeur —
  n'a aucun équivalent conceptuel utile pour un schéma relationnel Prisma (les FK, jointures et
  contraintes remplacent nativement ce que ce fichier simule à la main).
- Le mécanisme de **chunking manuel** dans `GET /kv/:key` (`index.tsx` L4975-5063 : détection
  `_isChunked`, reconstruction de tableaux via `key:chunk:{i}`) — pur contournement de la limite de
  taille de ligne/réponse Postgres/KV pour stocker de gros tableaux JSON
  (`shop-granular-records`) dans une seule cellule JSONB. Sans objet dans un modèle relationnel
  normalisé.
- Les routes purement Supabase-brutes qui interrogent des tables externes non-KV
  (`fnb_shop_locations`, `fnb_sales_raw`) via `createClient` direct (L4757-4812, L9897-9994,
  L10166-10305) : logique d'ingestion ad hoc propre à l'ancien pipeline de données
  Weezevent/Digifood du prototype, sans rapport avec l'architecture NestJS actuelle.
- Doublon de route mort dans le fichier lui-même : `migrate-shop-mappings` (L9041-9077) est
  entièrement commenté (`/* ... */`), et `migrate-location-to-spaceid` est déclaré **deux fois** à
  l'identique (L9080-9102 et L9880-9894) — artefacts de copier-coller propres à l'évolution
  erratique de ce fichier unique de 12 789 lignes, sans signification architecturale à retenir
  au-delà de « ce fichier a accumulé de la dette non nettoyée ».
- `margin-threshold-settings` avec sa migration inline ancien format → nouveau format
  « type-specific » (L850-928) : logique de migration de schéma JSON en lecture, spécifique au
  fait qu'il n'y a pas de colonnes typées — non transposable telle quelle à Prisma (une vraie
  migration de schéma suffit).
