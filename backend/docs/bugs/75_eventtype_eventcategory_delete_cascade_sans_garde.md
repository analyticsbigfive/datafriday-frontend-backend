# BUG-75 — Suppression `EventType`/`EventCategory` : cascade silencieuse sans garde "en cours d'utilisation"

- **Statut** : ⚪ Diagnostiqué
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

Aucune à ce jour — décision produit à prendre : ajouter un check "N catégories/événements
utilisent ce type, confirmer ?" avant suppression (nécessite une requête de comptage
supplémentaire, et un choix UX côté frontend pour afficher ce compte), ou accepter le comportement
actuel comme volontaire (cohérent avec le choix déjà fait de ne pas garder les référentiels
"orphelins" — la logique cascade existe précisément pour éviter des `EventCategory`/
`EventSubcategory` sans `EventType` parent).

## Risque de régression / à surveiller

Si un garde-fou est ajouté : décider s'il bloque totalement la suppression (nécessite d'abord
réaffecter/supprimer les enfants) ou s'il se contente d'avertir puis laisse la cascade s'exécuter.

## Références

- `docs/bugs/34_event_spaceid_sans_fk.md`
- `docs/modules/07_EVENEMENTS.md` (Piège n°3)
