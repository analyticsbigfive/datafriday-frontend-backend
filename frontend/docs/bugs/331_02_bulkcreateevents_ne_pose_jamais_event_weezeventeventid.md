# BUG-331-02 — "Créer et lier tout" ne pose jamais `Event.weezeventEventId` : le lien s'écrit dans un champ mort, jamais relu par l'API

- **Statut** : 🟡 Corrigé non testé (2026-08-14, branche `fix/event-aggregation-window-precision`)
  — **prérequis pour que BUG-330-02 soit efficace en pratique**, trouvé en réponse à une remarque
  de KOUAME Ulrich ("l'event de vérité est celui créé dans DataFriday, pas ceux venant de
  Weezevent/Digifood — comment on gère les données manquantes ?").
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes (wizard, étape 4) / Analyse & agrégation
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-08-14 — en vérifiant comment `Event.weezeventEventId` (le pont dont
  dépend BUG-330-02) est réellement posé en pratique par le flux le plus utilisé du wizard.
- **Fichiers** :
  - `frontend/src/components/integration/wizard/StepProcessTimeline.vue:1352-1379`
    (`bulkCreateEvents`, chunk `chunk.map(async (weezEvent) => {...})`)
  - `backend/src/features/spaces/spaces.service.ts:1775-1837` (`updateWeezeventEventMetadata` —
    écrit dans `SalesEvent.metadata`, whitelist de champs qui n'inclut PAS `dfEventId`)
  - `backend/src/features/spaces/spaces.service.ts:1750-1768` (`getWeezeventEventsForSpace` —
    mapping de sortie, même whitelist, `dfEventId` absent de la réponse)
  - `backend/src/features/events/dto/create-event.dto.ts` (aucun champ `weezeventEventId`)
  - `backend/src/features/events/dto/resolve-weezevent-link.dto.ts` +
    `backend/src/features/events/events.controller.ts:92-98` (`PATCH :id/weezevent-link` — le
    mécanisme qui pose correctement `Event.weezeventEventId`, existant, jamais appelé par
    `bulkCreateEvents`)
  - `frontend/src/api/endpoints/event.api.js:76-78` (`resolveWeezeventLink(id, weezeventEventId)` —
    wrapper frontend déjà prêt, jamais utilisé par `bulkCreateEvents`)

## Symptôme

Deux façons distinctes et incohérentes d'enregistrer "cet `Event` DataFriday correspond à ce
`SalesEvent` Weezevent/Digifood" coexistent dans le code :

1. `Event.weezeventEventId` — un vrai champ typé sur le modèle `Event`, posé par le matching
   automatique (BUG-021) ou par le dialog de résolution manuelle
   (`ResolveWeezeventLinkDialog.vue` → `PATCH :id/weezevent-link`).
2. `SalesEvent.metadata.dfEventId` — un champ **non déclaré** dans aucun DTO/type, écrit par
   `bulkCreateEvents` (`updateWeezeventEventMetadata(this.spaceId, weezEvent.id, { dfEventId:
   newEvent.id })`), qui survit uniquement parce que `updatedMeta = {...existingMeta, ...payload}`
   ne filtre rien à l'écriture — mais qui n'est **jamais renvoyé** par l'API en lecture
   (`getWeezeventEventsForSpace` ne whiteliste que `doorsOpening/showTime/category/eventType/team/
   visitingTeam/hasIntermission/performer/openingAct/sponsor`).

**"Créer et lier tout" (`bulkCreateEvents`), le flux le PLUS utilisé pour créer/lier des events à
l'étape 4, n'utilise QUE le mécanisme n°2.** Il n'appelle jamais `resolveWeezeventLink`/`PATCH
:id/weezevent-link`. Conséquence : pour tout event créé par ce bouton, `Event.weezeventEventId`
reste `null` — alors que côté utilisateur, l'event *apparaît* bien lié (le bandeau "déjà lié"
fonctionne, via l'état local `weezEventMappings` du composant Vue, jamais persisté de façon
relisible).

## Cause racine

`bulkCreateEvents` a été écrit en supposant que `SalesEvent.metadata.dfEventId` suffisait à
"mémoriser" le lien pour la réhydratation de l'étape 4 (`loadWeezeventEvents`, voir BUG-214/319).
Mais :
- `updateWeezeventEventMetadata` n'a jamais été conçu/typé pour porter ce champ (whitelist de
  lecture volontairement restreinte à des métadonnées d'affichage) — `dfEventId` n'y survit qu'en
  écriture par accident de typage (`payload` en TS ne filtre rien au runtime pour un JSON reçu par
  HTTP).
- Le VRAI pont typé et documenté (`Event.weezeventEventId`, exploité par le matching auto, le
  webhook live `webhook-event.handler.ts:191`, et destiné à porter l'attribution exacte
  transaction → event de BUG-330-02) n'est jamais renseigné par ce flux.

Résultat pour BUG-330-02 : le fix "utiliser `WeezeventTransaction.eventId` → `SalesEvent` →
`Event.weezeventEventId`" ne bénéficierait, en l'état actuel, qu'aux events liés par le matching
automatique (BUG-021, lui-même limité aux correspondances non ambiguës) ou par la résolution
manuelle — pas à la majorité des events créés via le bouton le plus utilisé du wizard.

## Correction

Corrigée en code le 2026-08-14 (branche `fix/event-aggregation-window-precision`) :

1. `bulkCreateEvents` (`StepProcessTimeline.vue:1373`) appelle désormais `resolveWeezeventLink
   (newEvent.id, weezEvent.id)` juste après `createEvent(...)`, pour poser réellement
   `Event.weezeventEventId`. L'écriture dans `SalesEvent.metadata.dfEventId` est conservée telle
   quelle (additif, aucun risque, décision de la retirer reportée — pas de lecteur connu à casser).
2. Script de backfill écrit : `backend/scripts/backfill-event-weezevent-link.ts` (dry-run par
   défaut, `--apply` pour exécuter), retrouve `Event.weezeventEventId` manquant via
   `SalesEvent.metadata->>'dfEventId'` pour les events créés par l'ancien flux.
3. **Backfill testé en dry-run contre l'environnement `.env` actuel** : 4 `SalesEvent` avec
   `dfEventId` renseigné trouvés, **0 exploitables** (les 4 `dfEventId` pointent vers des `Event`
   introuvables — probablement des events de test déjà supprimés). Rien à appliquer aujourd'hui sur
   cet environnement ; le script reste nécessaire pour d'autres environnements (staging/prod) où
   l'historique peut différer.

## Risque de régression / à surveiller

- Le backfill (`--apply`) n'a pas été exécuté (rien à appliquer sur l'environnement testé) — à
  relancer sur chaque environnement avant de considérer BUG-330-02 pleinement bénéfique dessus.
- Vérifier que `resolveWeezeventLink` ne fait rien d'autre d'indésirable dans ce contexte (c'est un
  endpoint conçu pour la résolution MANUELLE d'ambiguïté — confirmer qu'il n'a pas d'effet de bord
  spécifique à ce cas d'usage avant de le réutiliser en masse depuis `bulkCreateEvents`).
- Prérequis explicite pour BUG-330-02 : ne pas mesurer le bénéfice de BUG-330-02 sur un
  environnement de test sans avoir d'abord vérifié/corrigé ce ticket, sous peine de conclure à tort
  que le fix "ne change rien" faute de liens réellement posés.

## Références

- [BUG-330-02](330_02_aggregation_utiliser_transaction_eventid_au_lieu_de_date_range.md) — dépend
  de ce ticket pour être efficace sur le flux de création le plus courant.
- [BUG-214](214_stepprocesstimeline_weezeventmappings_jamais_rehydrate.md),
  [BUG-319-02](319_02_getweezeventeventsforspace_integration_arbitraire_espace_partage.md) — bugs
  voisins sur la même réhydratation `weezEventMappings`, causes distinctes (l'un "jamais appelé",
  l'autre "mauvaise intégration", celui-ci "le champ écrit n'est jamais celui qui est relu").
