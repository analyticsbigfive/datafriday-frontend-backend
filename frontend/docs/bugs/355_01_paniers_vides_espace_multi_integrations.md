# BUG-355-01 — « Product category mix per transaction » vide sur un espace à plusieurs intégrations

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Analyse & agrégation / Intégrations & ventes
- **Repo(s) concerné(s)** : les deux — fiche miroir api **BUG-136-01**
- **Découvert le** : 2026-08-24
- **Fichiers** : `src/utils/analyseDimensions.js:379`, `src/components/analyse/AnalyseView.vue:863-875`, `src/utils/transactionBaskets.js:134`

## Symptôme

Espace Le Mans FC, événement « Le Mans-Brest » sélectionné dans le panneau **Events Performance** :

```
Product category mix per transaction
0 transactions
Category combinations   → No data for this breakdown
Product combinations    → No data for this breakdown
```

Toutes les autres cartes de la page continuent d'afficher les chiffres de ce même événement
(CA 65 565 €, 25 867 unités, Revenue distribution by item, Events performance…). Seul ce bloc est
muet.

## Cause racine

L'espace a **deux** lignes dans `WeezeventLocationSpaceMapping` :

| integrationId | nom | créé le | transactions |
|---|---|---|---|
| `cmsoolboy000x71ydwsxhatup` | Le Mans FC | 11/08/2026 | 41 554 |
| `cmt01vzza007dqw011q4js95x` | Le Mans FC Weez | 23/08/2026 | 6 721 |

`resolveEventSalesScope` (`api/src/features/spaces/spaces.service.ts:1226`) faisait un
`locationSpaceMapping.findFirst({ where: { tenantId, spaceId } })` **sans `orderBy`** → une seule
intégration, choisie arbitrairement, d'où `AND t."integrationId" = <celle-là>`.

Les transactions du 22/08 portent l'**autre** `integrationId` → l'endpoint `transaction-baskets`,
seul lecteur restant des transactions brutes, ne matchait **aucune** ligne.

Pourquoi le reste de la page tenait : depuis le commit perf `8bd792a`, `getEventTimelineBatch` lit
`SpaceRevenueMinuteItemAgg` et ne déstructure même pas `integrationClause` (`spaces.service.ts:1380`)
— la pré-agrégat est déjà scopée par `spaceId`. L'asymétrie entre les deux lecteurs est ce qui rend
le symptôme aussi localisé. **7 espaces sur 31** sont dans ce cas.

**Bug latent du même écran, corrigé dans la foulée.** Les lignes paniers ne portaient pas
`minuteLocal` (la minute DATÉE en heure locale), contrairement aux lignes timeline, alors que
`buildBasketFilterPredicate` (`src/utils/transactionBaskets.js:134`) appelle
`buildItemFilterPredicate` **sans** `{ skipMinute: true }`. Depuis BUG-351-01 le curseur horaire émet
des bornes datées ; les comparer à un simple `HH:MM` retombait sur la branche legacy de
`isMinuteInRange` et vidait les donuts dès qu'un événement franchissait minuit. Aggravant :
`timelineFilterSignature` (`AnalyseView.vue:863-875`) excluait `selectedEventIds`, donc changer
d'événement ne remettait pas le curseur à pleine largeur — une plage datée d'un autre jour survivait
au changement.

## Correction

Backend (fiche api BUG-136-01) : `findMany` au lieu de `findFirst`,
`AND t."integrationId" = ANY(<liste>)`, `shopScopeClause` sur `integrationIds.length`.
`minuteLocal` ajoutée au `SELECT` paniers et propagée dans les lignes renvoyées.

Sûreté vérifiée en base avant d'élargir : **aucun** événement du tenant ne mélange les transactions
de deux intégrations (`GROUP BY eventId HAVING COUNT(DISTINCT integrationId) > 1` → vide). Élargir
en `ANY(...)` ne peut donc pas faire diverger les paniers de la pré-agrégat, qui est construite par
intégration.

Frontend :

- `analyseDimensions.js:379` — `isMinuteInRange(r.minuteLocal ?? r.minute, range)`. Corrige les
  paniers **et** l'item-level : `isMinuteInRange` accepte les deux formes, et les bornes datées
  prennent enfin la branche prévue par BUG-351-01. Même changement dans
  `shopPerformanceCompute.js` (3 occurrences).
- `AnalyseView.vue:863-875` — `selectedEventIds` ajouté à `timelineFilterSignature`, pour que le
  curseur horaire reparte à pleine largeur au changement d'événement.

## Risque de régression / à surveiller

- Tests backend ajoutés (`spaces.service.spec.ts`) : scope sur **toutes** les intégrations, mode
  dégradé sans intégration mappée (pas de filtre intégration + scope PdV strict), et présence de
  `minuteLocal` dans les lignes renvoyées.
- Un espace sans aucune intégration mappée reste en mode dégradé tenant-wide, où les PdV non mappés
  sont **exclus** (`mem."spaceElementId" = ANY(...)`) — comportement inchangé, volontaire : sans
  scope d'intégration, la branche permissive laisserait fuiter les ventes d'un autre espace.
- Corollaire du fix `minuteLocal` : l'item-level répond désormais réellement au curseur horaire
  daté. Si un écran comptait sur son inertie, ça se verra ici.
- Ce correctif est un **prérequis** de [BUG-354-01](354_01_transactions_comptent_des_lignes.md) : le
  KPI transactions lit maintenant les paniers, donc un endpoint paniers vide donnerait 0 transaction
  sur les 7 espaces multi-intégrations.

## Références

- Fiche miroir api : **BUG-136-01** (`api/docs/bugs/136_01_scope_ventes_une_seule_integration.md`).
- Fiches liées : [BUG-353-01](353_01_analyse_depend_du_spacemenu.md),
  [BUG-354-01](354_01_transactions_comptent_des_lignes.md),
  [BUG-351-01](351_01_timeline_date_transaction_ignoree.md) (origine des bornes datées).

---

*JLH*
