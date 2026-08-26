# BUG-370-02 — L'`integrationId` du JOB (wizard ouvert) rend la requête insatisfiable en mode `integration-range` quand il diffère de celui de l'event

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Critique (agrégation silencieusement vide selon le wizard ouvert au clic)
- **Domaine** : Agrégation
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-25 — KOUAME Ulrich, en observant des résultats d'agrégation
  incohérents ("souvent marche, souvent ne marche pas") sur `SFP-Cardiff`/`PFC-Le Havre`
  (Jean Bouin, même date, même espace) après plusieurs "Relancer" successifs.
- **Fichiers** : `backend/src/features/aggregation/aggregation.service.ts` (`executeProcessEvents`)

## Contexte

`executeProcessEvents` reçoit un `integrationId` au niveau du JOB (posé par le frontend depuis
`this.location.id` — l'intégration du wizard actuellement ouvert, cf. `StepProcessTimeline.vue`).
Ce paramètre datait d'avant [BUG-368-02](368_02_event_integrationid_mode_robuste_remplace_conteneur_saison.md) :
sans `Event.integrationId`, il fallait bien que l'appelant précise quelle intégration scoper.

Le bug : ce filtre au niveau du job (`integrationClause`, ligne ~508) était ANDé
INCONDITIONNELLEMENT avec le `matchClause` de CHAQUE event traité — y compris en mode
`integration-range`, où `matchClause` filtre déjà `t."integrationId" = window.integrationId`
(l'intégration PROPRE à cet event, autoritaire). Résultat : `t."integrationId" = jobIntegrationId
AND t."integrationId" = event.integrationId` — si les deux diffèrent, aucune transaction ne peut
jamais satisfaire les deux à la fois → 0 résultat, silencieusement.

Or la liste "Couvertes" du wizard (step 4) mélange volontairement les events de TOUTES les
intégrations du space (PFC + SFP sur Jean Bouin) à but informatif. Cliquer "Relancer" sur une
ligne PFC pendant que le wizard SFP est ouvert envoie `jobIntegrationId = SFP`, alors que
l'event traité a `integrationId = PFC` → agrégation vidée au lieu de recalculée correctement.
Симметriquement, "Tout agréger" (`handleAggregateAll`) peut inclure des events non traités des
DEUX clubs et leur applique à tous le même `jobIntegrationId` du wizard courant.

## Fix

`integrationClause` n'est appliqué que si `window.mode !== 'integration-range'` — dans ce mode,
le window porte déjà la seule intégration qui compte, celle de l'event. Le paramètre job-level
reste utilisé tel quel pour les modes legacy (`exact`/`container-range`/`range`), qui n'ont pas
de source d'intégration propre par event.

## Comportement après fix

Pour tout event ayant `integrationId` posé (mécanisme robuste), le résultat de l'agrégation ne
dépend plus du wizard depuis lequel "Relancer"/"Tout agréger" est cliqué — seule l'intégration
propre à l'event compte. Répond directement à la question validée par l'utilisateur : "pourquoi
pouvoir faire les agrégations de PFC sur SFP, es-tu sûr que ça ne mélange pas les choses ?" — ça
mélangeait bien, pas en additionnant les deux mais en vidant l'un des deux selon le contexte.

Test de régression : `aggregation.service.spec.ts`, "BUG-370-02 : mode integration-range ignore
l'integrationId du JOB...".

## Risque de régression / à surveiller

- Les modes legacy (`container-range`/`range`/`exact`) gardent l'ancien comportement à
  l'identique — seul le mode `integration-range` change.
- Les données déjà écrites AVANT ce fix avec un `jobIntegrationId` incohérent (0 point si le
  clic venait du mauvais wizard, ou données d'un tenant/run antérieur au fix `Event.integrationId`
  lui-même) restent en base telles quelles tant qu'un "Relancer" n'est pas relancé sur l'event
  concerné.

## Références

- [BUG-368-02](368_02_event_integrationid_mode_robuste_remplace_conteneur_saison.md) — introduit
  `Event.integrationId`/le mode `integration-range` dont ce fix corrige une interaction non
  anticipée avec le paramètre job-level pré-existant.
