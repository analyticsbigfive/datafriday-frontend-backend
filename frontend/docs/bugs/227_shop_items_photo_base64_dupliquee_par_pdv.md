# BUG-227 — `shop-items` : 5,6 Mo / 53 s, une photo base64 réémise une fois par PdV

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Critique (53 s de chargement sur la page Analyse ; le catalogue des filtres et
  le camembert « Par zone » restent bloqués tout ce temps)
- **Domaine** : Analyse & agrégation / Stock / Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web` **et** backend NestJS
- **Découvert le** : 2026-07-20 (retour utilisateur : « advanced filters & by area met du temps à
  se charger ; shop-items met 1 minute à se charger », capture DevTools à l'appui)
- **Fichiers** : `backend/src/features/space-menus/space-menus.service.ts:1052-1120`
  (`getConfigShopMenuItemsLight`), `backend/src/features/space-menus/space-menus.controller.ts:467-484`,
  `frontend/src/composables/useInventoryData.js:222-303`

## Symptôme

Sur `/spaces/:spaceId`, le panneau « Advanced filters » reste sur « Loading the catalog… » et le
donut « Par zone » reste en skeleton pendant environ une minute. DevTools :

```
shop-items   200   xhr   5 631 kB   53,25 s
```

Les deux zones attendent le même appel :
`loadConfigShopContext` → `buildConfigShopEntry` → `fetchNestShopMenus` →
`GET /space-menu/:spaceId/:configId/shop-items`. Tant qu'il n'a pas rendu, `configContextLoading`
reste vrai (spinner du catalogue) et `shopArea` n'existe sur aucun record (skeleton zone, cf.
[BUG-223](223_analyse_donut_zone_vide_pendant_contexte_differe.md)).

## Cause racine

`getConfigShopMenuItemsLight` sélectionnait `picture` **dans le `select` imbriqué des
`menuAssignments`**, c'est-à-dire **par ligne d'assignation**. Un article assigné à N points de
vente voyait donc sa photo sérialisée N fois. Or les photos sont stockées **en base64** dans
`MenuItem.picture`.

Mesuré sur la base `datafriday-dev`, config `cmr8axbc80002sn07gcdh5ley` (599 assignations
activées, 16 éléments, 40 articles) :

| | |
|---|---|
| Octets de `picture` émis | **14 Mo** |
| Tout le reste (id + nom + catégorie + prix) | **38 ko** |

Une **seule** photo fait presque tout le payload :

| Article | Taille photo | Assignations | Émis |
|---|---|---|---|
| BURGER SEUL | **915 ko** | 15 | **13 Mo** |
| 2 X TENDERS FRITES | 33 ko | 15 | 493 ko |
| COCA COLA CHERRY | 15 ko | 16 | 247 ko |

Sur toute la base : 2 389 articles, **3** avec une vraie photo base64 (963 ko cumulés), 79 avec
`picture = ''`, aucune URL. C'est la **duplication** qui fabrique le payload, pas le volume
d'images. 14 Mo de JSON très redondant se compressent aux ~5,6 Mo transférés observés.

`basePrice`/`picture` avaient été ajoutés à ce batch le 2026-07-18 pour que Space Inventory sorte
d'un N+1 (fiche back BUG-010). L'intention était bonne ; l'effet de bord — la sélection par ligne
d'assignation — n'avait pas été vu.

### Et cette photo n'était jamais lue

C'est ce qui rend le correctif quasi sans risque. Vérifié de bout en bout :

- `useInventoryData.js` recopiait `picture` du batch dans `shops.value[].items[]` ;
- `shop.items` n'est utilisé qu'à deux endroits : sa **longueur**, et `shop.items.map(enrichForBuild)` ;
- `enrichForBuild` **jette** ce champ — branche avec match catalogue : `return { ...catalog, … }`
  (le `catalog` vient de `store.state.analyse.menuItems`, qui porte `picture`) ; branche sans
  match : objet construit **sans** `picture` ;
- les vignettes affichées viennent donc du catalogue, via `buildConsolidatedInventory`
  (`inventoryUtils.js` lit `menuItem.picture`) puis `InventoryCountingInterface.vue:125-126`.

`SpaceLogisticView.resolveItemPicture` lit l'item d'inventaire consolidé, pas la ligne du batch —
son propre commentaire notait déjà que `MenuItem.picture` est ignoré au profit de l'image Market
Price.

Autrement dit : ces 13 Mo traversaient le réseau pour être ignorés.

## Correction

Appliquée le 2026-07-20 sur `feat/postEventInventory`.

**Backend** — `picture` retiré du `select` imbriqué, de l'objet `items[]` et du type de retour.
`basePrice` conservé (scalaire, coût nul, réellement consommé). Le commentaire de la méthode porte
désormais une **règle dure** : ne jamais ajouter ici un champ volumineux porté par le `MenuItem`,
puisque la sélection est par ligne d'assignation. Description `@ApiResponse` du contrôleur alignée.

Même réflexe que le `marketPriceSelectNoImage` déjà en place dans `menu-items.service.ts` — le
repo avait le pattern, il n'avait pas été appliqué ici.

**Frontend** — suppression de la ligne morte `picture: it?.picture || null`. C'est la contrepartie
du changement serveur, pas une compensation : aucune résolution de vignette n'a eu à être écrite.

Ce point compte : écrire une résolution dans le `.map()` de `useInventoryData` aurait introduit une
**course**. Depuis le découpage de la phase 2 ([BUG-226](226_chargement_analyse_dedup_catalogues_et_phase2_en_vagues.md)),
`analyse.menuItems` arrive en vague 2a — après que `loadContext` a construit ses shops. Comme
`shops.value = nextShops` est une affectation impérative, les photos auraient été résolues à `null`
sans jamais être recalculées. `enrichForBuild` étant une `computed`, la résolution est déjà
réactive, gratuitement.

**Tests** — 3 tests ajoutés dans `tests/unit/inventoryContext.spec.js` pour verrouiller
l'invariant dont dépend tout ce correctif : item d'assignation **sans** `picture` + catalogue
porteur → vignette résolue (par id, puis par nom normalisé) ; article absent du catalogue → pas de
photo, pas de crash. Sans eux, une refonte de `enrichForBuild` casserait les vignettes de Space
Inventory en silence.

## Risque de régression / à surveiller

- **Le seul risque réel** : les vignettes de Space Inventory. L'analyse et les tests disent
  qu'elles viennent déjà du catalogue — à confirmer à l'œil sur « BURGER SEUL ».
- **Payload ≠ latence totale** : le correctif supprime 13 Mo. Si l'appel reste à plusieurs
  secondes, le reliquat est ailleurs (cold start Render, pooler, coût de la requête) — piste
  distincte, pas un échec de ce correctif.
- **Environnement de mesure** : les chiffres viennent de `datafriday-dev` ; le navigateur tape
  `datafriday-api.onrender.com`. Le gain ne sera visible qu'une fois le backend déployé.
- Un futur consommateur qui aurait besoin de la photo par shop doit passer par le catalogue
  (`GET /menu-items`, une occurrence par article) — surtout pas la réintroduire dans ce batch.

## Références

- [Question #27](../QUESTIONS_A_BERTRAND.md) — le stockage base64 en base lui-même (migration vers
  Supabase Storage, normalisation des `''` en `NULL`, plafond d'upload) : **hors périmètre de ce
  correctif**, tranché ainsi le 2026-07-20.
- [BUG-082](82_menu_items_upload_image_sans_validation.md) — plafond d'upload à 5 Mo, sans
  redimensionnement client.
- [BUG-223](223_analyse_donut_zone_vide_pendant_contexte_differe.md) — le skeleton du donut
  « Par zone », qui a rendu ce blocage visible au lieu d'un graphe muet.
- [`../PLAN_CHARGEMENT_PROGRESSIF_ANALYSE.md`](../PLAN_CHARGEMENT_PROGRESSIF_ANALYSE.md) — ce
  blocage n'était **aucun** des lots A/B/C/D : c'était un payload, pas une orchestration.

---

Rédaction : **JLH**, 2026-07-20.
