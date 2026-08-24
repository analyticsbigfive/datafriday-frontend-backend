# BUG-353-01 — L'Analyse dépend du SpaceMenu : les ventes basculent sur un article homonyme

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement — le backend faisait déjà le bon calcul)
- **Découvert le** : 2026-08-24
- **Fichiers** : `src/utils/analyseReconciliation.js:287-368` (avant fix), `src/composables/useReconciliationContext.js:39`, `src/store/modules/analyse.js:919`, `src/utils/analyseAggregations.js:145,197`, `src/utils/timelineBucketing.js:284`

## Symptôme

Espace Le Mans FC, événement « Le Mans-Brest » du 22/08/2026.

« Bud 33cl 26/27 (LMFC) » affichait **60 unités sur un seul PdV** (Kiosque FB 1) et ses ventes
apparaissaient sous « Budweiser 45cl 26/27 (LMFC) ». Après **simple ajout de Bud 33 au SpaceMenu**,
sans réimport ni réagrégation : **916 unités sur 14 PdV**, bon libellé.

Or les deux produits ont des identifiants Weezevent distincts (`41` et `27`) et sont tous deux
correctement mappés dans Data Integration :

| Produit Weezevent | id externe | Menu item mappé | unités réelles | PdV |
|---|---|---|---|---|
| Bud 33CL | `41` | Bud 33cl 26/27 (LMFC) | 916 | 14 |
| Bud 45CL | `27` | Budweiser 45cl 26/27 (LMFC) | 4 041 | 17 |

Un chiffre d'Analyse ne doit dépendre que du mapping Data Integration, jamais d'un état de
configuration éditorial comme le SpaceMenu.

## Cause racine

**Le backend faisait déjà exactement ce qu'il fallait.** `getEventTimelineBatch`
(`api/src/features/spaces/spaces.service.ts:1468`) joint `WeezeventProductMapping` puis `MenuItem`
et renvoie `menuItemId` / `menuItemName` / `menuItemType` / `menuItemCategory`. Le PdV vient de
`WeezeventLocationShopMapping`. **Aucune table SpaceMenu n'apparaît dans le SQL analytique** —
vérifié sur `src/`, `prisma/migrations/` et `supabase/migrations/`.

C'est le **frontend qui écrasait ce résultat**. `resolveItem`
(`src/utils/analyseReconciliation.js:287-368`) refaisait la réconciliation en 5 étapes, calquée sur
celle d'EventPredict :

1. l'`menuItemId` du backend n'était accepté **que s'il appartenait à l'assignation SpaceMenu du
   PdV** (`candidateIds.has(recId)`, l.314) ;
2. sinon → mapping nom→id explicite ;
3. sinon → `findBestMatch({ name, basePrice: null }, candidates)` au seuil `MATCH_THRESHOLD = 70`
   (l.23, l.330-338), contre les seuls items du SpaceMenu.

Avec `basePrice: null`, `menuItemMatching.js:47-105` réduit le score à la similarité de nom seule.
« Bud 33cl 26/27 (LMFC) » et « Budweiser 45cl 26/27 (LMFC) » partagent le suffixe « 26/27 (LMFC) » :
le seuil de 70 est franchi. L'écriture finale (l.525,
`menuItemId: match.menuItemId || record.menuItemId`) remplaçait alors l'identifiant issu du mapping
par celui du gagnant du match flou, avec `mapStatus: 'remapped'` — comportement **assumé** à
l'époque, asserté dans les tests.

Ajouter Bud 33 au SpaceMenu le faisait entrer dans le pool de candidats, l'étape 1 gagnait, et les
916 unités « revenaient ». D'où la dépendance observée.

Deux fusions par NOM subsistaient en aval, indépendantes du SpaceMenu mais du même défaut de
conception (« le libellé n'est pas une identité ») :

- `analyseAggregations.js:145,197` — `aggregateByShop` / `aggregateByItem` groupaient sur
  `itemNameOf(r)` : deux MenuItem homonymes fusionnaient en une ligne ;
- `timelineBucketing.js:284` — `preprocessTimelineRecords` bucketait sur
  `productId || menuItemId || …`. Les lignes `event-timeline` portent `weezeventProductId` et
  `menuItemId` mais **jamais** `productId` → repli sur `menuItemId`, donc (a) deux produits externes
  mappés au même MenuItem fusionnaient et (b) toutes les lignes non mappées s'effondraient dans un
  bucket unique `''` par minute × PdV. Ce traitement s'exécute **avant** la réconciliation.

## Correction

`src/utils/analyseReconciliation.js` — l'identité article vient **exclusivement** du `menuItemId`
posé par le backend :

- `resolveItem(record)` se réduit à `mapped` si `record.menuItemId` existe, `unmapped` sinon ;
- suppression des paramètres `assignment` / `assignmentItemsByShop` / `nameToMenuItemId` de
  `buildReconciliationContext`, de `toAssignmentMap`, de l'import de `findBestMatch`, du `matchMemo`
  et du pool de candidats ;
- `shopByKey` n'est plus construit que depuis `floorElements`, et ne sert qu'aux **dimensions** du
  PdV (type, zone) — le rattachement PdV vient de `WeezeventLocationShopMapping` côté backend.
  Vérifié avant suppression : les entrées créées depuis `assignmentItemsByShop` seul ne
  différenciaient que `shopStatus`, champ de diagnostic jamais lu comme filtre ;
- `mapStatus` ne vaut plus `'remapped'`.

**Ventes sans mapping** : décision JLH 2026-08-24 — elles **restent comptées**, dans le bucket
sentinelle (libellé renommé « Non mappées », fiche 356-01). Décision prise deux fois le même
jour : confirmée le matin, remise en cause (« seules les ventes mappées comptent », exclusion
implémentée quelques heures), puis **réaffirmée** après mesure d'impact — aller-retour tracé
dans la fiche api BUG-137-01. Mesure : 0 % de lignes non mappées sur l'événement de test, mais
37,4 % des lignes / 5,16 M€ HT tous espaces confondus depuis 08/2025, concentrés sur des
intégrations jamais mappées (Adidas Arena 100 %).

`useReconciliationContext.js:39` et `store/modules/analyse.js:919` — `assignment` /
`assignmentItemsByShop` retirés des deux points de construction du contexte.

`analyseAggregations.js` — nouvelle clé `itemAggKeyOf(r)` : `id:<menuItemId>` d'abord, `name:<nom>`
seulement en repli pour les ventes non mappées. Le nom reste le **libellé affiché**, plus la clé.

`timelineBucketing.js` — clé de regroupement `rawProductGroupId` **distincte** de l'identité
`rawProductId`, avec `weezeventProductId` en tête. L'identité écrite dans `menuItemId` /
`mappedMenuItemId` et le lookup de coût restent inchangés (indexés sur MenuItem).

Prédiction non impactée : `analyseReconciliation.js` n'est utilisé que par l'Analyse, EventPredict a
sa propre réconciliation dans `EventPredictView.vue:2392-2463`.

## Risque de régression / à surveiller

- **Test de non-régression ajouté** : `tests/unit/analyseReconciliation.spec.js`, bloc
  « BUG-353-01 — l'Analyse est indépendante du SpaceMenu ». Il réconcilie la vente Bud 33 avec un
  contexte dont l'assignation ne contient **que** Bud 45, et exige un résultat **identique** à celui
  obtenu sans assignation. C'est la garantie durable ; le contrôle manuel (retirer un article du
  SpaceMenu, recharger l'Analyse, vérifier que ses unités ne bougent pas) reste possible mais n'est
  pas la preuve.
- La spec entière a été réécrite : elle assertait `remapped` comme comportement attendu (l.64, 117,
  127 de l'ancienne version).
- **Aucun recalcul de données nécessaire** pour ce bug : l'identité article est résolue **à la
  lecture**, dans le SQL de `getEventTimelineBatch` et dans le RPC `get_space_shop_details`.
- À surveiller : les articles dont le `menuItemId` n'est pas dans le catalogue chargé restent
  `mapped` et prennent leurs dimensions des champs backend du record. C'est voulu — ne pas
  réintroduire un rejet sur « id inconnu du store ».
- Artefact de validation : `api/scripts/verify-event-analytics.ts --event=<Event.id>` (lecture
  seule) compare unités par produit et par PdV à la vérité brute, joint sur `menuItemId`.

## Références

- Fiches liées : [BUG-354-01](354_01_transactions_comptent_des_lignes.md) (transactions comptées à
  tort), [BUG-355-01](355_01_paniers_vides_espace_multi_integrations.md) (donut paniers vide).
- [BUG-350-01](350_01_ca_variable_home_analyse_bascule_source.md) — écarte déjà le SpaceMenu comme
  cause des variations de CA ; ce bug montre le chemin qu'elle avait manqué, côté **client**.
- [`../CARTOGRAPHIE_MODULES.md`](../CARTOGRAPHIE_MODULES.md) — module Analyse.

---

*JLH*
