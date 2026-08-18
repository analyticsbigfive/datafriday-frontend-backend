# BUG-337-02 — Étape 3 du wizard : la pagination affichée est 100 % client (ne réduit rien côté serveur) ; cause racine réelle = cascade de prix scopé-espace jusqu'à 40s, résolue par la table `SalesPriceAgg`

- **Statut** : 🟡 Corrigé non testé (2026-08-18) — backfill vérifié sur l'intégration de
  diagnostic uniquement, backfill complet (27 intégrations, tenants clients réels) pas encore
  lancé, décision à prendre séparément (cf. Correction)
- **Sévérité** : 🔴 Bloquant/impact business (révisé à la hausse après mesure : requête
  utilisateur réelle à 29-40s, pas juste un confort UX — même famille d'incident que
  BUG-332/333-02)
- **Domaine** : Intégrations & ventes (wizard, étape 3)
- **Repo(s) concerné(s)** : les deux (frontend : pagination/meta ; backend : nouvelle table
  `SalesPriceAgg` + réécriture du cascade de prix)
- **Découvert le** : 2026-08-18 — capture d'écran "51–100 sur 204 / Page 2 sur 5" fournie par
  Ulrich en se demandant pourquoi le chargement de l'étape est lent malgré une pagination visible
  à l'écran.
- **Fichiers** :
  - `frontend/src/components/integration/wizard/StepMapMenuItems.vue:969-990` (`displayedRows`,
    `totalPages`, `pagedRows`, `pageRangeStart/End` — pagination) et `:1123-1140` (`loadData`)
  - `frontend/src/api/endpoints/aggregation.api.js:155-207` (`getWeezeventProducts`)
  - `backend/src/features/weezevent/weezevent.controller.ts:702-861` (`getProducts`)
  - `backend/prisma/schema.prisma` (modèle `SalesPriceAgg`)
  - `backend/src/shared/pricing/sales-price-agg.service.ts` (nouveau, écriture)
  - `backend/src/shared/pricing/menu-item-pricing.service.ts` (les 6 méthodes de lecture, réécrites)
  - `backend/src/features/weezevent/services/weezevent-incremental-sync.service.ts` (hook sync bulk/incrémental)
  - `backend/src/features/weezevent/services/weezevent-insert-worker.service.ts` (hook fin de job bisection)
  - `backend/src/features/weezevent/services/sync/transaction-sync.service.ts` (hook webhook)
  - `backend/src/features/digifood/services/digifood-ingestion.service.ts` (hook Digifood)
  - `backend/scripts/backfill-sales-price-agg.ts` (nouveau, backfill)
  - `backend/prisma/migrations/20260818200000_add_sales_price_agg/` (nouveau)

## Symptôme

La pagination "51–100 sur 204 · Page 2/5" affichée à l'étape 3 (`Précédent`/`Suivant`) est un
simple `Array.slice()` côté client (`pagedRows`, ligne 978) sur `this.products`, un tableau **déjà
entièrement chargé en mémoire** par `loadData()`. Elle ne fait que masquer/afficher des lignes déjà
en RAM — elle ne réduit ni le nombre de requêtes HTTP, ni la taille des réponses, ni (surtout) le
coût du cascade de résolution de prix côté serveur (voir BUG-332/333/334/335/336-02), qui s'exécute
pour l'intégralité du catalogue (jusqu'à 500-2000 produits) avant que la première ligne ne
s'affiche — y compris pour les ~150 produits des pages 2 à 5 que l'utilisateur ne voit peut-être
jamais.

## Cause racine

`getWeezeventProducts()` (`aggregation.api.js:157-163`) appelle `GET /weezevent/products` avec
`perPage=500` (jusqu'à `MAX_PAGES=4` pages en parallèle), sans lien avec le `pageSize=50` réel de
l'UI (`StepMapMenuItems.vue:848`). Le contrôleur backend (`weezevent.controller.ts::getProducts`)
respecte bien `page`/`perPage`, mais le front ne s'en sert jamais pour limiter la charge réelle —
il demande systématiquement le maximum, ramène tout en mémoire (`this.products`), puis pagine
localement pour l'affichage seul.

C'est le pendant frontend de [BUG-334-02](334_02_weezevent_products_catalogue_bloque_par_resolution_prix.md)
(déjà diagnostiqué côté conception, non implémenté) : la requête mélange catalogue (rapide) et
résolution de prix scopée-espace (lente, cf. cascade 332→336-02) dans un seul appel bloquant, et le
front aggrave l'effet en demandant systématiquement le catalogue complet plutôt que ce qui est
réellement affiché.

**Complication à ne pas ignorer en corrigeant** : `mappedCount`/`unmappedCount`/`catalogTotal`, le
bandeau "X produits sans mapping" bloquant le wizard, les auto-suggestions et
`bulkCreateAndMap` (`StepMapMenuItems.vue:900-948`, `1774-1797`) ont TOUS besoin de la liste
**complète** des produits (nom + statut de mapping), pas seulement de la page affichée — une vraie
pagination réseau naïve (ne charger que la page courante) casserait ces fonctionnalités. Le
`basePrice` par contre n'est nécessaire que pour les lignes réellement affichées.

## Correction

Après échange avec Ulrich (2026-08-18) : la vraie pagination réseau paresseuse (ne charger que la
page affichée) a été écartée — `mappedCount`/`unmappedCount`/le bandeau bloquant/`bulkCreateAndMap`
ont besoin de la liste complète, donc le front devra de toute façon toujours tout récupérer tant que
cette contrainte métier existe (même limite que [BUG-334-02](334_02_weezevent_products_catalogue_bloque_par_resolution_prix.md),
non résolue par ce ticket).

Le vrai verrou identifié en creusant : `onlySold=true` (actif par défaut, `hideUnsold: true`)
filtrait **après** pagination côté backend, sur un total **non filtré** — c'est ça qui forçait le
front à boucler sur toutes les pages pour reconstituer la liste réellement vendue, pas juste la
taille de `perPage`. Fix appliqué **côté backend** (`weezevent.controller.ts::getProducts`) :

- Le catalogue complet (métadonnées + résolution de prix) est chargé et résolu **une seule fois**
  par requête (au lieu d'une requête par page), `onlySold` filtre maintenant **avant** la
  pagination, et la pagination (`skip`/`take`) est appliquée en mémoire sur le résultat déjà filtré.
- `meta.total`/`total_pages` reflètent désormais le compte **filtré** (permet une vraie pagination
  si un jour le front cesse d'avoir besoin du set complet) ; `meta.catalogTotal` (nouveau champ)
  porte le compte **non filtré**, repris par le compteur "X produits masqués" de l'UI.
- Bonus : la requête `salesProduct.count()` séparée a disparu (le `findMany` complet sert aux deux
  usages), un aller-retour DB de moins par appel.
- Front (`StepMapMenuItems.vue` : `loadData`, `bulkResyncCatalog`) mis à jour pour lire
  `meta.catalogTotal` au lieu de `meta.total` pour `this.catalogTotal` — sinon le compteur "masqués"
  serait tombé à ~0 avec le nouveau contrat.

**Gain réel** : pour un tenant dont le catalogue non filtré dépasse `perPage` (jusqu'ici le cas
courant vu que `onlySold=true` gonflait artificiellement le nombre de pages nécessaires), le nombre
de requêtes HTTP baisse. Pour un tenant dont le catalogue tient déjà dans une seule page (comme le
cas capturé en capture d'écran, 204 produits), CE point seul n'apporte rien — Ulrich a reconfirmé
"toujours pareil, très lent" après ce premier fix.

**Deuxième passe (même jour)**, après nouvelle mesure — deux causes distinctes trouvées dans la
cascade de prix scopée-espace elle-même (`weezevent.controller.ts::getProducts`, branche
`spaceId`), au-delà de la pagination :

1. Les 3 niveaux de repli (par `productId`, par `item_id` Weezevent, par nom) restaient enchaînés
   **séquentiellement** (chaque niveau ne tournait que sur les produits "manquants" du niveau
   précédent), et chacun (`getSpaceScoped*`) ré-appelait `resolveSpaceLocationIds` indépendamment
   (jusqu'à 4 requêtes redondantes par appel, le même calcul refait). Même diagnostic que
   [BUG-333-02](333_02_pricing_cascade_3_niveaux_sequentiels_toujours_trop_lent.md) (coût dominé par
   le JOIN vers `WeezeventTransaction`, pas par la taille de la liste d'ids) appliqué un niveau plus
   haut : `resolveSpaceLocationIds` est maintenant résolu **une seule fois**, et les 3 niveaux
   tournent en **parallèle** contre le catalogue complet (au lieu d'être conditionnés les uns aux
   autres), fusionnés par la même priorité qu'avant.
2. **Bug de correction trouvé en même temps** : le niveau 2 (repli par `item_id` Weezevent) ne
   s'était **jamais** déclenché — le code filtrait sur `pr.weezeventId`, un champ qui n'existe pas
   sur le modèle Prisma `SalesProduct` (le champ exposé côté JS est `externalId` ; `@map("weezeventId")`
   ne renomme que la colonne DB, pas le nom utilisable en TypeScript). `pr: any` masquait l'erreur
   au typecheck. Remplacé par `pr.externalId` — ce niveau de repli s'exécute désormais réellement
   pour la première fois, ce qui peut résoudre le prix de produits jusqu'ici bloqués sur
   `priceSource: 'catalog'` à tort.

Vérifié uniquement par `tsc --noEmit` (0 erreur) — **pas mesuré en conditions réelles**, le serveur
backend d'Ulrich tournait en `nest start` (sans `--watch`, lancé avant ces changements) donc n'avait
chargé aucun des deux fixs au moment du "toujours pareil, très lent" ; à remesurer après redémarrage.
**Non résolu par ce fix** : le temps de calcul de la cascade elle-même pour un très gros catalogue
(reste borné par BUG-332/333/335/336-02) et la nécessité de tout récupérer en un bloc avant
affichage (BUG-334-02, décision produit toujours en attente si on veut aller plus loin).

**Troisième passe (même jour)** — Ulrich a reconfirmé "toujours 20-40s" après redémarrage propre du
backend (deuxième passe bien chargée). Diagnostic poussé au bout avec `EXPLAIN (ANALYZE, BUFFERS)`
directement contre la base réelle (tenant `cmrpf3ukw0001bdu2h6rz0vbz`, intégration `cms9h9tfy00blqdroy0ahs1rd`,
300 produits catalogue, 112 locations mappées à l'espace) : la requête `getLatestSalesPrices`
(niveau 1) seule mesurée à **17-40s**. Le plan confirme que ce n'est ni un index manquant (le bon
index composite `WeezeventTransaction_tenantId_locationId_transactionDate_idx` existe déjà) ni un
problème de `work_mem` (256MB : 22.2s → 21.7s, quasi aucun effet) mais un vrai scan disque —
`Buffers: read=` montre ~500 Mo lus depuis le disque, cohérent avec la taille réelle des tables
(`WeezeventTransactionItem` : 3,1M lignes, 1,8M pour ce tenant).

**Cause racine réelle, donc** : recalculer ce cascade en JOIN+tri à CHAQUE requête HTTP est
fondamentalement trop coûteux à ce volume, quels que soient les fixs de dédup/parallélisation
ci-dessus. Fix définitif implémenté : nouvelle table de pré-agrégation **`SalesPriceAgg`**
(`(tenantId, locationId, productId, itemWeezeventId, productNameNorm, unitPrice, vat) →
salesCount, lastSoldAt`), tenue à jour à l'ÉCRITURE (pas recalculée à la lecture) :

- **Écriture** (`sales-price-agg.service.ts`, nouveau) : `refreshForKeys` (ciblé, bon marché,
  1-20 lignes) accroché à 3 points d'ingestion — sync bulk/incrémental
  (`weezevent-incremental-sync.service.ts::processBatchTransactions`), webhook transaction unique
  (`sync/transaction-sync.service.ts::upsertTransactionItems`), et Digifood
  (`digifood-ingestion.service.ts::ingestOrder`, même patron, `productKey` = équivalent Digifood
  de `item_id` Weezevent). `refreshForIntegration` (recalcul complet, même coût qu'avant mais payé
  UNE fois par sync) pour le premier sync complet et la fin d'un job bisection worker
  (`weezevent-insert-worker.service.ts`). Tous best-effort (try/catch interne, ne bloque jamais le
  sync/webhook).
- **Lecture** (`menu-item-pricing.service.ts`) : les 6 méthodes (`getLatestSalesPrices`/
  `getModalSalesPrices` et leurs variantes `ByName`/`ByWeezeventId`) lisent désormais
  `SalesPriceAgg` au lieu du raw JOIN — signatures inchangées, `weezevent.controller.ts` n'a rien à
  changer. Repli vers l'ancienne requête raw conservé (`*Raw`, méthodes privées) si un appelant
  utilise `eventIds`/`excludeLocationIds` (un seul cas réel : `menu-items.service.ts` avec
  `eventIds`, param non représentable dans l'agrégat — `excludeLocationIds` n'a plus d'appelant
  réel depuis BUG-336-02).
- Pourquoi pas piggyback sur "Tout agréger" (étape 4, `executeProcessEvents`, le mécanisme déjà
  utilisé par `SpaceRevenueMinuteAgg`) : l'ordre du wizard est étape 3 (cet endpoint) **avant**
  étape 4 — un nouveau tenant n'aurait jamais de prix à l'étape 3 tant qu'il n'a pas cliqué "Tout
  agréger" à l'étape 4. D'où les 3 points d'ingestion ci-dessus plutôt que le mécanisme
  d'agrégation existant.

**Vérifié empiriquement** (`scripts/tmp-verify-337.ts`, script temporaire supprimé après usage) sur
la même intégration que le diagnostic ci-dessus :
```
Backfill (refreshForIntegration, à faire une fois)   : 42 617ms  (même coût que l'ancienne requête,
                                                                    payé une fois, pas par requête)
SalesPriceAgg rows écrites                            : 1 423
resolveSpaceLocationIds                                :  1 238ms (inchangé, hors périmètre de ce fix)
Cascade complet (6 appels parallèles, lit SalesPriceAgg):  1 691ms  ← était 17-40 000ms
Résolu : byId=162, byWid=162 (0 avant le fix du champ), byName=159
```
**~20-25x plus rapide sur le chemin de lecture** (celui qui s'exécute à chaque chargement de
l'étape 3), `byId=162` identique au compte de l'ancienne requête (justesse confirmée), `byWid=162`
non-nul confirme que le fix du champ `pr.externalId` (deuxième passe) fonctionne réellement.

Migration appliquée manuellement (ADR-0002, `datafriday-web/docs/adr/`, jamais `prisma migrate
dev` — shadow DB cassée sur l'historique existant, connue) :
`prisma/migrations/20260818200000_add_sales_price_agg/`, appliquée via `prisma migrate deploy`
contre la base de dev/staging partagée (`aws-1-eu-west-1.pooler.supabase.com`). Backfill lancé
uniquement sur l'intégration de diagnostic — **PAS encore lancé sur les 26 autres intégrations
actives** (tenants clients réels : Stade Français, AJ Auxerre, Le Mans FC, Adidas Arena, etc.,
`scripts/backfill-sales-price-agg.ts --apply`), volontairement laissé de côté pour décision
séparée plutôt que bundlé dans cette session de debug.

## Risque de régression / à surveiller

- **Backfill incomplet** : tant que `scripts/backfill-sales-price-agg.ts --apply` n'a pas tourné
  sur les 26 autres intégrations actives, l'étape 3 restera lente (repli implicite sur une table
  `SalesPriceAgg` vide → tous les produits en `priceSource: 'catalog'`, pas d'erreur mais pas de
  gain) pour ces tenants tant qu'ils n'auront pas fait tourner un sync (les hooks d'écriture
  peuplent la table au fil de l'eau, mais seulement pour les ventes synchronisées APRÈS ce déploi).
  Décision à prendre : lancer le backfill complet avant/au déploiement, ou laisser chaque tenant se
  peupler naturellement à son prochain sync.
- **Changement de contrat API** : `meta.total`/`total_pages` de `GET /weezevent/products` ne
  représentent plus le total catalogue non filtré quand `onlySold=true`, mais le total filtré — a
  vérifié chez les 3 autres appelants (`menu-items.service.ts:1061,1218`, refresh produit
  `weezevent.controller.ts`, `useSpaceData.js:240`) : aucun ne lit `meta.total`/`meta.catalogTotal`
  sur cette route, donc pas d'impact constaté, mais à garder en tête si un futur appelant s'y fie.
- Vérifier que `unsoldHiddenCount` (bandeau "produits masqués", étape 3) affiche bien un nombre
  cohérent après ce changement (dépend maintenant de `meta.catalogTotal`, pas `meta.total`).
- `productsNeedingPrice`/la résolution de prix "sans espace" tournent maintenant sur le catalogue
  complet plutôt que sur une page de `perPage` produits — testé sain via `tsc --noEmit`, mais pas
  mesuré en conditions réelles sur un très gros catalogue (des milliers de produits).
- Non testé en environnement réel au moment de la rédaction (pas de build/dev server relancé, cf.
  consignes de session).

## Références

- [BUG-334-02](334_02_weezevent_products_catalogue_bloque_par_resolution_prix.md) — diagnostic
  conception déjà posé côté backend (découpler catalogue et prix), non implémenté.
- [BUG-332-02](332_02_getlatestsalesprices_seq_scan_sans_filtre_tenant_502.md),
  [BUG-333-02](333_02_pricing_cascade_3_niveaux_sequentiels_toujours_trop_lent.md),
  [BUG-335-02](335_02_resolvespacelocationids_mauvaise_table_niveau1_jamais_fonctionne.md),
  [BUG-336-02](336_02_pricing_espace_supprime_niveaux_repli_autres_espaces.md) — chaîne complète
  d'incident sur le cascade de prix de cette même route.
