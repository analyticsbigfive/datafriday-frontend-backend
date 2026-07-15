# BUG-034 — Event.spaceId/configurationId sont des String, pas des FK Prisma

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur (orphelins possibles, pas de fuite de données)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `spaces.service.ts:415-427` (`SpacesService.remove()`), `events.service.ts:98-126,156-184`

## Symptôme

Aucun symptôme direct observé — risque latent d'orphelins.

## Cause racine

`Event.spaceId`/`configurationId` sont des `String` sans contrainte FK Prisma.
`SpacesService.remove()` ne touche jamais la table `Event` à la suppression d'un espace, et aucune
vérification d'appartenance tenant n'est faite sur `spaceId`/`configurationId` à la
création/édition d'un event.

## Correction

Aucune à ce jour — ajouter la FK (avec la migration de nettoyage des orphelins existants
qu'elle impliquerait) ou au minimum une vérification applicative d'appartenance tenant.

## Risque de régression / à surveiller

Ajouter la FK a posteriori nécessite d'abord d'identifier et traiter les orphelins déjà présents en
base.

## Références

- `datafriday-web/docs/modules/07_EVENEMENTS.md` §"Tableau récapitulatif — bugs et risques actifs" #4
