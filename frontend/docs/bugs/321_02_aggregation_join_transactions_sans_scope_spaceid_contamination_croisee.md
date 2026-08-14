# BUG-321-02 — L'agrégation par event ne restreint jamais les transactions aux locations de l'espace traité : risque de contamination croisée entre espaces partageant une intégration

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix à faire)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Analyse & agrégation / Intégrations & ventes
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-14 — trouvé en creusant BUG-317-02/318-02 (audit ciblé "plusieurs
  intégrations sur un même space" demandé par KOUAME Ulrich) ; symptôme inverse mais même famille
  de défaut de scoping dans le même code.
- **Fichiers** :
  - `backend/src/features/aggregation/aggregation.service.ts:287-325` (bloc
    `SpaceRevenueMinuteAgg`)
  - `backend/src/features/aggregation/aggregation.service.ts:307-308` (`LEFT JOIN
    "WeezeventLocationShopMapping" lsm ON lsm."weezeventLocationId" = t."locationId" AND
    lsm."tenantId" = ${tenantId}` — pas de filtre `spaceId`)
  - `backend/src/features/aggregation/aggregation.service.ts:378-422` (bloc
    `SpaceRevenueMinuteItemAgg`, même défaut, ligne 400-401)

## Symptôme

Non reproduit en conditions réelles (pas de tenant connu avec ce scénario aujourd'hui) — trouvé par
lecture de code. Scénario à risque : une seule `Integration` (ex. un Weezevent d'organisation) a des
locations mappées vers **2 `Space` différents** (ex. deux salles d'un même complexe, chacune sa
propre configuration DataFriday). Si les deux espaces ont un `Event` le même jour, "Traiter" cet
event pour l'espace X agrégerait aussi les transactions des locations mappées à l'espace Y, tant
qu'elles appartiennent à la même intégration et tombent dans la même fenêtre de dates.

## Cause racine

Le `WHERE` de la requête d'agrégation ne filtre les transactions QUE par `tenantId` (+
`integrationId` si fourni) et par plage de dates de l'`Event` — jamais par un lien explicite vers
les locations réellement mappées à `spaceId` :

```sql
-- aggregation.service.ts:305-313
FROM "WeezeventTransaction" t
JOIN "WeezeventTransactionItem" ti ON ti."transactionId" = t."id"
LEFT JOIN "WeezeventLocationShopMapping" lsm
  ON lsm."weezeventLocationId" = t."locationId" AND lsm."tenantId" = ${tenantId}
  -- pas de AND lsm."spaceElementId" IN (SELECT id FROM "SpaceElement" WHERE spaceId = ${spaceId})
WHERE t."tenantId" = ${tenantId}
  ${integrationClause}
  AND t."transactionDate" >= ${eventDate}
  AND t."transactionDate" < ${nextDay}
  AND t."deletedAt" IS NULL
```

Le `LEFT JOIN` vers `lsm` sert uniquement à résoudre `spaceElementId` pour l'enrichissement
(colonne `spaceElementId` de `SpaceRevenueMinuteAgg`), pas à restreindre les lignes retournées —
une transaction dont la location n'est mappée à AUCUN espace, ou mappée à un **autre** espace, est
quand même incluse dans l'agrégat de `spaceId`, tant que `tenantId`/`integrationId`/dates
correspondent. Le seul filet de sécurité aujourd'hui est que la plupart des tenants n'ont qu'un
espace par intégration — ce défaut est resté invisible jusqu'ici pour cette raison, pas parce que le
code le prévient.

## Correction

Pas encore faite. Piste : ajouter au `WHERE` une restriction explicite sur les locations
effectivement mappées à `spaceId` :

```sql
AND t."locationId" IN (
  SELECT lsm2."weezeventLocationId" FROM "WeezeventLocationShopMapping" lsm2
  JOIN "SpaceElement" se ON se.id = lsm2."spaceElementId"
  WHERE se."spaceId" = ${spaceId} AND lsm2."tenantId" = ${tenantId}
)
```
(ou équivalent via `LocationSpaceMapping`, à trancher selon que le scoping attendu est
"location → espace" (étape 1) ou "location → shop" (étape 2) — voir
`05_INTEGRATIONS_VENTES.md` pour la distinction entre les deux tables de mapping). À valider avec
Bertrand si le comportement actuel (transactions non mappées quand même incluses, `spaceElementId
NULL`) est voulu pour les locations non encore mappées à l'étape 2 — un filtre trop strict casserait
ce cas.

## Risque de régression / à surveiller

- Avant de corriger, vérifier s'il existe un tenant réel avec une intégration servant plusieurs
  espaces — sinon ce ticket reste "risque théorique confirmé par le code, jamais observé en
  production".
- Un filtre trop strict pourrait faire disparaître des transactions actuellement comptées
  (locations non mappées à un shop mais dont les ventes sont quand même agrégées avec
  `spaceElementId NULL`) — à tester avec un espace réel avant déploiement.

## Références

- [BUG-317-02](317_02_aggregation_processevents_deletemany_non_scope_integration.md),
  [BUG-318-02](318_02_aggregation_synchronize_purge_espace_sans_scope_integration.md) — même fil
  d'investigation, défaut de scoping symétrique (celui-ci : pas assez de filtre → contamination
  inter-espaces ; ceux-là : delete trop large → écrasement inter-intégrations sur le même espace).
- [`../modules/05_INTEGRATIONS_VENTES.md`](../modules/05_INTEGRATIONS_VENTES.md) — modèles
  `LocationSpaceMapping`/`LocationShopMapping`.
