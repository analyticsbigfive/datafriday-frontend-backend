# BUG-034 — Event.spaceId/configurationId sont des String, pas des FK Prisma

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (orphelins possibles, pas de fuite de données)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `spaces.service.ts:415-427` (`SpacesService.remove()`), `events.service.ts:119-198` (`findOwnedSpaceOrThrow`, `findOwnedConfigOrThrow`, `resolveEventSpaceFields`), `:220-262` (`create()`), `:294-340` (`update()`)

## Symptôme

Aucun symptôme direct observé — risque latent d'orphelins.

## Cause racine

`Event.spaceId`/`configurationId` sont des `String` sans contrainte FK Prisma.
`SpacesService.remove()` ne touche jamais la table `Event` à la suppression d'un espace, et aucune
vérification d'appartenance tenant n'est faite sur `spaceId`/`configurationId` à la
création/édition d'un event.

## Correction

Correction en deux volets, dont un seul appliqué à ce jour :

1. **Fait — vérification applicative d'appartenance tenant** (même famille que BUG-66/67) :
   `EventsService.create()`/`update()` (`events.service.ts`) appellent désormais
   `resolveEventSpaceFields()`, qui valide `spaceId`/`configurationId` via deux nouveaux helpers
   avant l'écriture Prisma :
   - `findOwnedSpaceOrThrow(id, tenantId)` — `Space.tenantId` est obligatoire (pas de socle global
     comme `EventType`/`EventCategory`), donc scope strict `{id, tenantId}`, `NotFoundException`
     sinon (même convention que `findOwnedTeamOrThrow`, déjà utilisé pour `visitingTeamId`).
   - `findOwnedConfigOrThrow(id, tenantId)` — `Config` n'a pas de `tenantId` propre, son
     appartenance est portée par l'espace parent : vérifie via `where: { id, space: { tenantId } }`.
   Un `spaceId`/`configurationId` omis du payload (`undefined`, cas `PATCH` partiel) ne déclenche
   toujours aucune vérification — comportement inchangé.
   Tests de régression ajoutés dans `events.service.spec.ts` (create + update) : accepte un
   `spaceId`/`configurationId` possédé par le tenant appelant, rejette (`NotFoundException`) une
   référence appartenant à un autre tenant.

2. **Fait le 2026-07-24 — vraie FK Prisma + migration**, en 3 étapes après confirmation explicite
   de l'utilisateur (approche SET NULL validée) :
   - **Constat** (lecture seule) : `Event.spaceId` — 20 lignes orphelines sur 61 événements avec
     `spaceId` non nul ; `Event.configurationId` — 5 lignes orphelines sur 18. Vérifié en base
     réelle que ce sont de **vrais événements historiques** (ex. séries "STADE FRANÇAIS"
     2019-2026, "Paris SG vs OL Lyonnais", etc.), pas des données de test — pas de suppression ni
     de rattachement deviné.
   - **Nettoyage** : `UPDATE "Event" SET "spaceId" = NULL WHERE ...` (idem `configurationId`) sur
     les seules lignes orphelines confirmées, exécuté contre la base pointée par `DATABASE_URL`.
     Revérifié après coup : 0 orphelin restant, 61 `Event` toujours lisibles, aucune donnée
     perdue (seule la référence cassée est vidée, le reste de l'event — CA, ventes, KPIs —
     intact).
   - **FK + migration** : `schema.prisma` porte désormais `space Space? @relation(fields:
     [spaceId], ..., onDelete: SetNull)` et `configuration Config? @relation(fields:
     [configurationId], ..., onDelete: SetNull)` (+ index ajouté sur `configurationId`, qui n'en
     avait pas). `onDelete: SetNull` choisi délibérément (pas `Cascade`) — cohérent avec le
     nettoyage : supprimer un Space/Config ne doit jamais supprimer l'historique d'un Event.
     Migration écrite à la main (`prisma/migrations/20260724180000_event_space_config_fk/`, voir
     ADR-0002) et **déployée** (`prisma migrate deploy`, sur autorisation explicite) — vérifié en
     base après coup : `Event_spaceId_fkey`/`Event_configurationId_fkey` bien présentes,
     `ON DELETE SET NULL`.

## Risque de régression / à surveiller

- Les 25 events touchés par le nettoyage affichent désormais "aucun espace"/"aucune config" côté
  UI (comportement correct : l'espace/config d'origine n'existe effectivement plus) — vérifier
  qu'aucun écran ne suppose `spaceId`/`configurationId` toujours non-null sur un event historique.
- Vérifier que `PATCH /events/:id` sans `spaceId`/`configurationId` dans le payload ne déclenche
  aucune vérification (comportement partiel préservé, couvert par les tests existants du fichier).

## Références

- `datafriday-web/docs/modules/07_EVENEMENTS.md` §"Tableau récapitulatif — bugs et risques actifs" #4
- [[67_event_taxonomy_fk_sans_ownership]] (même pattern d'ownership, appliqué ici à `spaceId`/`configurationId`)
- `docs/adr/0002_migrations_manuelles_jamais_plateforme.md` (politique de migration manuelle appliquée pour la FK)
