# BUG-021 — Jointure Event ↔ WeezeventEvent par égalité de DATE seule dans la RPC

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (latent — pas de cas observé au moment du diagnostic, mais des cas
  ambigus réels existaient déjà en base au moment de la correction — voir Correction)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Corrigé le** : 2026-07-21
- **Fichiers** : RPC `20260704200000_...sql:175-178,224-227` (`get_space_shop_details`), remplacée
  par `20260721210000_shop_details_rpc_event_link_by_id.sql` ; `prisma/schema.prisma` (`Event.
  weezeventEventId`) ; `src/features/events/services/event-weezevent-link.service.ts` ;
  `src/features/events/events.service.ts` (`create`/`update`/`listAmbiguousWeezeventMatches`/
  `resolveWeezeventLink`) ; `src/features/events/events.controller.ts` ; `src/features/weezevent/
  services/sync/catalog-sync.service.ts` (`syncEvents`)

## Symptôme

Deux events Weezevent le même jour calendaire sur le même espace risquent d'être confondus par la
jointure.

## Cause racine

La RPC `get_space_shop_details` joint `Event` DataFriday et `WeezeventEvent` par égalité de date
seule, sans autre discriminant (nom, heure, id externe).

## Correction

**Analysé en profondeur le 2026-07-21, décision produit prise par l'utilisateur avant fix** :
champ de liaison explicite `Event.weezeventEventId`, auto-rempli seulement quand le rapprochement
est univoque, désambiguïsation manuelle laissée en API (pas de nouvel écran frontend cette session
— hors scope `backend/`).

**Vérifié en base avant fix** (lecture seule, 2026-07-21) : des cas ambigus réels existaient déjà
— tenant `cmpya1n280009wpbc00u2bikp` avait 2 `WeezeventEvent` le même jour calendaire à 2 reprises
(2026-07-07, 2025-07-18) ; plusieurs tenants avaient aussi >1 `Event` le même jour (`cmpbej24f...`
notamment). Confirme que la désambiguïsation manuelle n'est pas un cas purement théorique.

Fait :
- `prisma/schema.prisma` : `Event.weezeventEventId String?` (nullable, FK vers `WeezeventEvent.id`,
  `ON DELETE SET NULL`) + relation `SalesEvent.events`. Migration écrite à la main
  (`prisma/migrations/20260721210000_event_weezevent_link_and_webhook_per_integration/migration.sql`
  — `prisma migrate dev` échoue sur cette base, `P3006`, cf. BUG-70 pour la cause pré-existante) et
  déployée (`prisma migrate deploy`, sur autorisation explicite de l'utilisateur, conformément à
  [ADR-0002](../adr/0002_migrations_manuelles_jamais_plateforme.md)).
- `EventWeezeventLinkService.relinkForTenantDate(tenantId, date)` (nouveau, `src/features/events/
  services/event-weezevent-link.service.ts`) : n'auto-lie QUE quand exactement 1 `Event` non lié
  et 1 `WeezeventEvent` partagent tenant+date calendaire (requête `DATE(...) = DATE(...)`, identique
  à l'ancienne sémantique RPC) — toute ambiguïté (plusieurs candidats d'un côté ou de l'autre) reste
  non résolue, pas d'heuristique de repli.
- Appelé depuis `EventsService.create()` (après insertion) et `EventsService.update()` (si
  `eventDate` change : reset `weezeventEventId` à `null` puis retente le lien sur la nouvelle date —
  un lien établi pour une date ne doit pas survivre silencieusement à un changement de date) ; et
  depuis `WeezeventCatalogSyncService.syncEvents()` (après upsert des `SalesEvent`/`WeezeventEvent`
  synchronisés, pour chaque date touchée par le sync).
- Désambiguïsation manuelle (API only, décision utilisateur) : `GET /events/weezevent-ambiguous-
  matches` (events non liés avec candidats `WeezeventEvent` du même jour) et
  `PATCH /events/:id/weezevent-link` (`{ weezeventEventId: string | null }`, `null` = déliaison
  explicite) — `EventsService.listAmbiguousWeezeventMatches`/`resolveWeezeventLink`.
- RPC `get_space_shop_details` (`supabase/migrations/20260721210000_shop_details_rpc_event_link_by_id.sql`,
  `CREATE OR REPLACE FUNCTION`, base = 20260704200000) : les 2 jointures `"Event" ev_df` passent de
  `DATE(ev_df."eventDate") = DATE(...)` à `ev_df."weezeventEventId" = we.id` / `= ev.id`. Conséquence
  attendue : un `Event` dont le lien reste ambigu n'apparaît plus associé du tout côté DataFriday
  (retombe sur les champs `WeezeventEvent` bruts) — préférable à l'ancien risque d'association
  silencieuse au mauvais event. Appliquée en base via `psql` sur `DIRECT_URL` (même autorisation).
- **Backfill one-shot** (2026-07-21, même autorisation) : la logique d'auto-link ne tournant qu'à la
  création/au sync, les `Event`/`WeezeventEvent` déjà existants n'avaient jamais été rapprochés.
  Un script SQL rejouant exactement la même condition (1 `Event` non lié + 1 `WeezeventEvent`, par
  tenant+date) a été exécuté une fois contre la base de `backend/.env` : **8 liens posés** sans
  ambiguïté ; les cas ambigus pré-existants (ex. tenant `cmpbej24f...` avec 2-3 `Event` le même jour
  sans `WeezeventEvent` correspondant, ou tenant `cmpya1n2...` avec 2 `WeezeventEvent` sans `Event`
  ce jour-là) restent non liés — vérifiés après coup via `listAmbiguousWeezeventMatches` (0 ligne
  retournée : aucune ambiguïté réelle actionnable actuellement, cohérent avec l'attendu).
- Tests unitaires ajoutés : `event-weezevent-link.service.spec.ts` (nouveau), et mis à jour dans
  `events.service.spec.ts`, `catalog-sync.service.spec.ts`. `npx tsc --noEmit` propre, suite Jest
  complète : 740/751 passent (2 échecs pré-existants sans rapport, module `menu-items`, confirmés
  antérieurs à cette session).

## Risque de régression / à surveiller

Un `Event` dont le rapprochement reste ambigu (plusieurs `WeezeventEvent` candidats le même jour,
ou plusieurs `Event` candidats) n'apparaît plus du tout associé dans `get_space_shop_details` tant
que personne ne résout manuellement via `PATCH /events/:id/weezevent-link` — à surveiller si le
volume d'events multi-quotidiens sur un même espace augmente (aucun écran frontend de
désambiguïsation n'existe encore, seulement l'API).

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #8
