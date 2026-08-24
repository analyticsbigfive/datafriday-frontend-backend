# BUG-136-01 — `resolveEventSalesScope` ne retenait qu'UNE intégration : endpoint paniers vide

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Analyse & agrégation / Intégrations & ventes
- **Repo(s) concerné(s)** : les deux — fiche miroir web **BUG-355-01**
- **Découvert le** : 2026-08-24
- **Fichiers** : `src/features/spaces/spaces.service.ts:1226-1229`, `:1336-1339`, `:1349-1351`, `:1584`, `:1573`, `src/features/spaces/spaces.controller.ts:552`

## Symptôme

Page Analyse, espace Le Mans FC, événement « Le Mans-Brest » sélectionné : la carte
« Product category mix per transaction » affiche **0 transactions** et ses deux donuts sont vides,
alors que toutes les autres cartes publient les chiffres du même événement.

## Cause racine

L'espace a **deux** lignes dans `WeezeventLocationSpaceMapping` :

| integrationId | nom | créé le | transactions |
|---|---|---|---|
| `cmsoolboy000x71ydwsxhatup` | Le Mans FC | 11/08/2026 | 41 554 |
| `cmt01vzza007dqw011q4js95x` | Le Mans FC Weez | 23/08/2026 | 6 721 |

`resolveEventSalesScope` (`spaces.service.ts:1226`) faisait un
`locationSpaceMapping.findFirst({ where: { tenantId, spaceId } })` **sans `orderBy`** → une seule
intégration, retenue arbitrairement, d'où `integrationClause = AND t."integrationId" = <celle-là>`
(`:1330-1332`).

Les transactions du 22/08 portent l'**autre** `integrationId`. `getTransactionBasketsBatch`
(`:1584`) est le **dernier** lecteur du code à scanner `WeezeventTransaction` brute et le seul à
déstructurer `integrationClause` : il ne matchait aucune ligne.

`getEventTimelineBatch` ne s'en apercevait pas : depuis le commit perf `8bd792a` il lit
`SpaceRevenueMinuteItemAgg` et ne déstructure pas `integrationClause` (`:1380`) — la pré-agrégat est
déjà scopée par `spaceId`. D'où un symptôme parfaitement localisé sur une seule carte.

Effet de bord de la même variable : `shopScopeClause` (`:1342-1344`) choisissait sa branche stricte
ou permissive à partir de ce même `integrationId` unique.

**7 espaces sur 31** ont plusieurs intégrations mappées.

**Bug latent du même endpoint.** Les lignes paniers ne portaient pas `minuteLocal` (la minute DATÉE
en heure locale de l'espace), contrairement aux lignes de `getEventTimelineBatch` (`:1493`), alors
que le prédicat de filtrage frontend des paniers n'applique pas `skipMinute`. Depuis BUG-351-01, le
curseur horaire émet des bornes datées : comparées à un simple `HH24:MI`, elles vidaient les donuts
dès qu'un événement franchissait minuit.

## Correction

- `:1226` — `locationSpaceMapping.findMany` au lieu de `findFirst`.
- `:1336-1339` — `integrationIds = locationMapping.map(m => m.salesLocationId).filter(Boolean)` puis
  `AND t."integrationId" = ANY(${integrationIds})` quand la liste n'est pas vide.
- `:1349-1351` — `shopScopeClause` teste `integrationIds.length`.
- `:1573` + mapping de ligne — `minuteLocal` exposée sur les lignes paniers
  (`TO_CHAR(..., 'YYYY-MM-DD"T"HH24:MI')`, même expression `DATE_TRUNC` que la colonne `minute`, donc
  déjà couverte par le `GROUP BY`), documentée dans le schéma Swagger du contrôleur. Tri de sortie
  passé de `minute` à `minuteLocal`.

**Sûreté vérifiée en base avant d'élargir** : aucun événement du tenant ne mélange les transactions
de deux intégrations (`GROUP BY t."eventId" HAVING COUNT(DISTINCT t."integrationId") > 1` → vide).
Élargir en `ANY(...)` ne peut donc pas faire diverger les paniers de la pré-agrégat, qui est
construite **par intégration** (`aggregation.service.ts:432-434`, `deleteWhere.integrationId`).

## Risque de régression / à surveiller

- Tests ajoutés (`spaces.service.spec.ts`, describe `getTransactionBasketsBatch`) : scope sur toutes
  les intégrations (`= ANY(` + valeurs), mode dégradé sans intégration mappée (pas de filtre
  intégration + scope PdV strict), présence de `minuteLocal` dans les lignes renvoyées. Les mocks du
  spec passent de `findFirst` à `findMany`.
- Le mode dégradé tenant-wide reste **volontairement** strict sur les PdV
  (`mem."spaceElementId" = ANY(...)`) : sans scope d'intégration, la branche permissive laisserait
  fuiter les ventes d'un autre espace dans les fenêtres de dates de celui-ci.
- `getLiveStatus` (`:1696`) et les deux autres appels (`:1766`, `:1776`) utilisent encore
  `findFirst` — non modifiés ici, mais **même classe de défaut** sur un espace multi-intégrations.
  À qualifier séparément.
- Ce correctif est un **prérequis** de BUG-135-01 / web BUG-354-01 : le KPI transactions lit
  désormais cet endpoint.

## Références

- Fiche miroir web : **BUG-355-01** (`web/docs/bugs/355_01_paniers_vides_espace_multi_integrations.md`).
- Fiches liées : [BUG-135-01](135_01_transactions_count_compte_des_lignes.md), web BUG-351-01
  (origine des bornes datées), [BUG-130-01](130_01_geteventtimelinebatch_max_ecrase_merchants.md)
  (même commit `8bd792a`, autre régression).

---

*JLH*
