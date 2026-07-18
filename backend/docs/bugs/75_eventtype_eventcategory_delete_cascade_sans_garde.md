# BUG-75 — Suppression `EventType`/`EventCategory` : cascade silencieuse sans garde "en cours d'utilisation"

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (risque dormant)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/events/events.service.ts:212-215` (deleteEventType),
  `:275-278` (deleteEventCategory) ; `prisma/schema.prisma:2120` (`EventCategory.eventType
  onDelete: Cascade`), `:2140` (`EventSubcategory.eventCategory onDelete: Cascade`)

## Symptôme

`DELETE /event-types/:id` (ou `/event-categories/:id`) ne vérifie jamais si des `EventCategory`
(ou `EventSubcategory`) en dépendent avant de supprimer. Comme `EventCategory.eventType` et
`EventSubcategory.eventCategory` sont tous deux `onDelete: Cascade`, supprimer un `EventType`
supprime silencieusement en cascade toutes ses `EventCategory`, et par transitivité toutes leurs
`EventSubcategory` — sans confirmation, sans compte du nombre d'entités affectées. Tout `Event`/
`Team` référençant l'une de ces lignes voit ensuite sa FK optionnelle mise à `null` (comportement
par défaut Prisma pour une relation optionnelle sans `onDelete` explicite).

## Cause racine

Choix de modélisation (cascade complète sur la hiérarchie de taxonomie) jamais accompagné d'une
garde applicative côté service — même famille de risque que le Piège n°3 déjà documenté
(`Event.spaceId`/`configurationId` sans FK, [[34_event_spaceid_sans_fk]]), pour la branche
taxonomie plutôt que la branche espace.

## Correction

**Décision (2026-07-18)** : bloquer totalement la suppression tant que des enfants dépendent (pas
juste avertir) — pattern le plus sûr et le plus conventionnel, cohérent avec le fait que ces
entités structurent des `Event`/`Team` potentiellement déjà en production. `deleteEventType`
compte désormais les `EventCategory` dépendantes (`eventTypeId: id`) et lève `ConflictException`
(« Impossible de supprimer ce type : N catégorie(s) en dépendent encore. Supprimez-les d'abord. »)
si le compte est > 0. `deleteEventCategory` fait de même un niveau plus bas avec les
`EventSubcategory` dépendantes.

Aucun changement frontend nécessaire : les deux écrans live (`EventsTypeListView.vue`,
`EventsCategorieListView.vue`) affichent déjà `e.response.data.message` sur échec de suppression
(pattern déjà en place, vérifié dans le code).

## Risque de régression / à surveiller

- Vérifié : `tsc --noEmit` propre.
- Tester manuellement : supprimer un `EventType`/`EventCategory` qui a des enfants doit maintenant
  échouer avec un message clair au lieu de cascader silencieusement ; supprimer une entité sans
  enfant doit continuer à fonctionner normalement.

## Références

- `docs/bugs/34_event_spaceid_sans_fk.md`
- `docs/modules/07_EVENEMENTS.md` (Piège n°3)
