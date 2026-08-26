# BUG-372-02 — `resolveSeasonContainerEventIds` scopée par l'`integrationId` du JOB faisait manquer le conteneur d'une AUTRE intégration, basculant l'event à tort en mode `exact`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Critique (agrégation "réussie" mais 0 ligne écrite, silencieusement)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-25 — après le fix BUG-371-02, SFP-Cardiff restait encore
  "Non agrégé" (job `completed`) même après redémarrage complet du serveur. Root cause trouvée
  en inspectant directement le job BullMQ dans Redis (`bull:aggregation:<id>`, champ `data`) :
  `integrationId: "cms82c09u8tdhkgsmovyrzzlk"` (PFC) alors que l'event traité (`eventIds`) est
  SFP-Cardiff — le wizard PFC était ouvert au moment du clic "Agréger".
- **Fichiers** : `backend/src/features/aggregation/aggregation.service.ts`
  (`resolveSeasonContainerEventIds`, `executeProcessEvents`, `getStep4Context`)

## Contexte

Même famille que BUG-370-02, un niveau plus profond. `resolveEventWindow` décide du mode
(`exact`/`integration-range`/`container-range`/`range`) en testant d'abord si
`event.weezeventEventId` pointe un "conteneur de saison" détecté (`seasonContainerIds`, calculé
par `resolveSeasonContainerEventIds`) — si NON détecté, il bascule en mode `exact` (rattachement
`t.eventId = weezeventEventId`, sans aucune fenêtre ni filtre d'intégration).

`resolveSeasonContainerEventIds(tenantId, integrationId)` était scopée par l'`integrationId` du
JOB (`this.location.id`, le wizard ouvert) — hérité d'avant BUG-368-02, quand il fallait bien dire
au backend quelle intégration scanner. Ici : job lancé depuis le wizard PFC pour traiter
SFP-Cardiff → la requête de détection ne voit QUE les transactions PFC → le conteneur de SFP
(`cms9haqpo00byqdrocemoc3y0`, 120 395 transactions sur 10 mois) n'est jamais vu → `isContainerLink`
= `false` pour SFP-Cardiff → mode `exact` choisi à tort, avec `t.eventId = <conteneur SFP>` ET (à
cause du fallback du mode `exact`, non couvert par le fix BUG-370-02) `t.integrationId = PFC` en
plus — combinaison IMPOSSIBLE à satisfaire (aucune transaction SFP n'a `integrationId = PFC`) → 0
ligne écrite, job marqué `completed` quand même (le `try/catch` par event ne fait qu'ajouter un
statut `'success'`/`dataPoints: 0` aux `results`, jamais loggé nulle part de façon visible).

## Fix

`resolveSeasonContainerEventIds` ne prend plus d'`integrationId` du tout — "ce `weezeventEventId`
est-il un conteneur de saison ?" est une propriété INTRINSÈQUE des transactions qui lui sont
liées, indépendante de qui lance le job. Les 3 requêtes internes (span observé, span déclaré,
site Digifood) sont maintenant scopées uniquement par `tenantId` — sans risque de collision
inter-intégrations, les `weezeventEventId`/ids de `SalesEvent` étant des cuids déjà uniques par
construction.

Test de régression : `aggregation.service.spec.ts`, "BUG-372-02 : resolveSeasonContainerEventIds
n'est plus scopée par l'integrationId du JOB...".

## Note de transparence (diagnostic)

Pendant l'investigation, une requête `INSERT` (reproduction manuelle de la requête réelle) a été
exécutée directement contre la base pour confirmer que le SQL en lui-même fonctionnait — écrivant
1943 lignes réelles dans `SpaceRevenueMinuteAgg` sans passer par le reste du pipeline
(`SpaceRevenueMinuteItemAgg`, `SpaceProductRevenueDailyAgg`, rollup `Event`, purge cache).
Immédiatement annulée (`DELETE` ciblé sur les mêmes critères) pour ne pas laisser d'état
incohérent — vérifié à 0 ligne après coup. Aucune trace résiduelle en base.

## Références

- [BUG-368-02](368_02_event_integrationid_mode_robuste_remplace_conteneur_saison.md),
  [BUG-370-02](370_02_job_integrationid_incompatible_avec_integration_range.md),
  [BUG-371-02](371_02_frontiere_voisin_meme_jour_deux_integrations.md) — même chaîne causale
  (l'`integrationId` du job, concept legacy, entre en conflit avec l'`integrationId` propre à
  l'event dès que la liste "Couvertes" mélange plusieurs clubs sur un même espace).
