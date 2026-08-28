# BUG-368-02 — `Event.integrationId` : mode `integration-range`, remplace la déduction implicite via conteneur de saison (BUG-146-01, devenu legacy)

- **Statut** : 🟡 Code prêt, testé — **migration écrite mais PAS appliquée** (autorisation
  explicite requise avant `prisma migrate deploy`/application manuelle, ADR-0002)
- **Sévérité** : 🟠 Majeur (robustesse structurelle — élimine une classe entière de bugs)
- **Domaine** : Analyse & agrégation / Intégrations & ventes
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-08-25 — KOUAME Ulrich, après le trou de couverture multi-intégrations
  (`unregisteredDates` ne distinguait pas PFC de SFP) : "je pense qu'on peut ajouter un nouveau
  champ pour associer le bon sous-espace ; par exemple ceux de SFP, ceux de PFC, etc." — décision
  explicite : coexistence avec le mécanisme existant (BUG-146-01), qui devient legacy.
- **Fichiers** :
  - `backend/prisma/schema.prisma` (`Event.integrationId`, relation `Integration.dfEvents`)
  - `backend/prisma/migrations/20260825110000_add_event_integrationid/migration.sql`
  - `backend/src/features/aggregation/aggregation.service.ts` (`resolveEventWindow`, mode
    `integration-range` + `unregisteredDates`)
  - `backend/src/features/spaces/spaces.service.ts` (`resolveEventSalesScope`,
    `getEventTimelineBatch`, `getTransactionBasketsBatch`, `getAnalyseUnmappedBatch`)
  - `backend/src/features/events/events.service.ts` (`resolveEventSpaceFields`,
    `findOwnedIntegrationOrThrow`), `dto/create-event.dto.ts`
  - `frontend/src/components/integration/wizard/StepProcessTimeline.vue` (`bulkCreateEvents`)

## Contexte

Toute la session du 2026-08-25 a buté sur la même racine : identifier "à quel club/quelle
intégration appartient cette transaction" en s'appuyant sur `t.eventId`/`Event.weezeventEventId`
— un id d'entité Weezevent, jamais pensé pour porter cette information de façon fiable (saisons
groupées, sites Digifood permanents, cold-start de la détection de conteneur — BUG-338/358/361/
363-02). Le fix BUG-146-01 (même jour, travail en parallèle) a déjà réduit l'impact en repérant
les conteneurs de saison et en les traitant comme un tag de club (mode `container-range`) — mais
reste dépendant d'un backfill manuel par tenant et d'une détection heuristique (span observé/
déclaré).

Principe validé avec l'utilisateur : le "mapping" de Data Integration n'est **jamais** un lien
entre deux entités "event" — c'est un lien entre la plage de dates d'un `Event` et les
transactions Weezevent dont la date tombe dans cette plage, **scopées à la bonne intégration**.
`Event.integrationId` rend cette intégration explicite au lieu de la déduire.

## Ce que ça élimine

Pour tout `Event` où `integrationId` est posé, l'agrégation ne regarde plus JAMAIS `t.eventId` —
elle matche directement `t."integrationId" = Event.integrationId` + la fenêtre calendaire
(`resolveEventTransactionWindow`, déjà partagée écriture/lecture depuis BUG-146-01/fiche 147-01).
Ça rend inutiles, pour ces events : la détection de conteneur de saison (span observé/déclaré,
cold-start), le backfill manuel par tenant, et toute la fragilité qui allait avec.

## Cohabitation avec le mécanisme legacy

Priorité dans `resolveEventWindow` :
1. `exact` — lien vers un match PRÉCIS (pas un conteneur) : reste le plus fiable, prioritaire
   même si `integrationId` est aussi posé.
2. `integration-range` (NOUVEAU) — `Event.integrationId` posé, pas de lien exact.
3. `container-range` (LEGACY, BUG-146-01) — lien vers un conteneur de saison, pas
   d'`integrationId` posé.
4. `range` — ni l'un ni l'autre, comportement historique.

Un Event legacy (les 77 de Jean Bouin, déjà backfillés BUG-146-01) continue de fonctionner sans
rien faire — migré automatiquement vers `integration-range` par le backfill de CETTE migration
(dérivé de `SalesEvent.integrationId` via leur lien conteneur existant), pour bénéficier
immédiatement du mécanisme robuste sans dépendre du tag conteneur.

## Ce qui a été mis à jour

- **Écriture** (`aggregation.service.ts`) : `resolveEventWindow` (nouveau mode), `matchClause`,
  `unregisteredDates` (le trou de couverture — un Event PFC ne "couvre" plus par coïncidence les
  transactions SFP d'une date où seul un event SFP existe).
- **Lecture** (`spaces.service.ts`) : `resolveEventSalesScope` calcule aussi
  `eventIntegrationId` par fenêtre ; les 2 requêtes qui interrogent `WeezeventTransaction`
  directement (`getTransactionBasketsBatch`, `getAnalyseUnmappedBatch`) filtrent dessus. Les 2
  requêtes qui lisent la table PRÉ-AGRÉGÉE (`getEventTimelineBatch`, minute + summary) n'ont pas
  eu besoin de changement : les lignes y sont déjà taguées `weezeventEventId = Event.id`
  (toujours vrai, quel que soit le mode d'écriture), déjà couvert par le filtre existant.
- **Création** (`bulkCreateEvents`) : pose `integrationId: this.location.id` sur tout nouvel
  Event ; un event legacy relié (BUG-366-02, `existingUnlinked`) reçoit aussi `integrationId` s'il
  ne l'avait pas déjà — migration automatique au fil de l'eau.
- **Ownership check** (`events.service.ts`) : `integrationId` validé comme `spaceId`/
  `configurationId` (`findOwnedIntegrationOrThrow`), exposé en DTO (`CreateEventDto`).

Tests ajoutés : `aggregation.service.spec.ts` (mode `integration-range` matche `t.integrationId`
jamais `t.eventId` ; un lien exact reste prioritaire même avec `integrationId` posé). Suite
complète (aggregation/events/spaces/weezevent-cron) : 65+57+66(+1 préexistant sans rapport)+16
passent. Compilation propre.

## Risque de régression / à surveiller

- **Migration NON appliquée** — colonne absente en base tant qu'elle n'est pas déployée
  manuellement (ADR-0002). Le code compile et les tests (mockés) passent, mais rien ne fonctionne
  en conditions réelles avant l'application + `prisma generate` déjà fait côté client local
  uniquement (pas propagé à un environnement de déploiement).
- Le backfill de la migration ne couvre que les Events déjà liés à un conteneur DÉTECTÉ (span
  observé > 2 jours à l'instant de la migration) — un Event lié à un conteneur qui n'a pas encore
  atteint ce seuil (cold-start, même trou que BUG-358/361-02) resterait sur le mode legacy
  `range`/`container-range` jusqu'à sa prochaine création/relink via `bulkCreateEvents`.
- Pas testé en conditions réelles (pas de serveur de dev, migration non appliquée).
- La coexistence des deux mécanismes (integration-range/container-range) est volontaire mais
  ajoute une branche de plus à `resolveEventWindow` — à retirer un jour si tous les tenants
  finissent par migrer naturellement (tout nouvel event créé via `bulkCreateEvents` migre déjà).

## Références

- [BUG-146-01](../../../backend/docs/bugs/) — mécanisme legacy dont celui-ci prend le relais
  (référencé dans les commentaires du code, pas de fiche `.md` dédiée trouvée dans
  `backend/docs/bugs/` au moment de l'écriture — seulement dans les commentaires et la migration
  `20260825100001`).
- [BUG-338-02](338_02_stade_jean_bouin_agregation_vide_events_saison_vs_match.md),
  [BUG-358-02](358_02_digifood_conteneur_site_cold_start_non_detecte.md),
  [BUG-361-02](361_02_bulkcreateevents_conteneur_saison_cree_event_plusieurs_mois.md),
  [BUG-363-02](363_02_resolveseasoncontainer_cold_start_span_declare_weezevent.md),
  [BUG-365-02](365_02_cron_safety_net_ignore_integration_contamination_ecriture.md) — toute la
  classe de bugs que ce champ rend structurellement impossible pour les events qui l'utilisent.
- [BUG-366-02](366_02_demapper_detachait_event_du_space_au_lieu_du_lien.md) — `bulkCreateEvents`,
  point d'écriture de `integrationId` à la création/relink.
