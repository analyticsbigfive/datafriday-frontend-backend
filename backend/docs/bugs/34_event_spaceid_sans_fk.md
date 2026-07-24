# BUG-034 — Event.spaceId/configurationId sont des String, pas des FK Prisma

- **Statut** : 🟡 Corrigé partiel
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

2. **Non fait — vraie FK Prisma + migration** : un contrôle en lecture seule sur la base
   pointée par `DATABASE_URL` (staging, Supabase) le 2026-07-24 a trouvé des orphelins déjà
   existants :
   - `Event.spaceId` : **20 lignes orphelines sur 61** événements avec `spaceId` non nul (pointent
     vers un `Space.id` inexistant).
   - `Event.configurationId` : **5 lignes orphelines sur 18** événements avec `configurationId` non
     nul (pointent vers un `Config.id` inexistant).
   Conformément à la procédure prévue pour ce ticket, la présence d'orphelins bloque l'ajout de la
   FK/migration tant qu'ils n'ont pas été traités (nettoyage ou décision produit sur quoi faire de
   ces événements) — **aucune modification de `schema.prisma` ni migration n'a été écrite**. À
   traiter en suivi séparé : identifier ces 20+5 lignes, décider (réassigner, mettre `spaceId`/
   `configurationId` à `null`, ou supprimer les events concernés), puis seulement ajouter la
   `@relation` FK et la migration manuelle (voir ADR-0002 — migration à écrire à la main, jamais
   appliquée automatiquement par la plateforme).

## Risque de régression / à surveiller

- Ajouter la FK a posteriori nécessite toujours d'abord de traiter les orphelins déjà présents en
  base (confirmés le 2026-07-24 : 20 `spaceId` + 5 `configurationId`).
- Vérifier que `PATCH /events/:id` sans `spaceId`/`configurationId` dans le payload ne déclenche
  aucune vérification (comportement partiel préservé, couvert par les tests existants du fichier).

## Références

- `datafriday-web/docs/modules/07_EVENEMENTS.md` §"Tableau récapitulatif — bugs et risques actifs" #4
- [[67_event_taxonomy_fk_sans_ownership]] (même pattern d'ownership, appliqué ici à `spaceId`/`configurationId`)
- `docs/adr/0002_migrations_manuelles_jamais_plateforme.md` (politique de migration manuelle, pour le volet FK non fait)
