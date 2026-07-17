# BUG-146 — `EventFormDrawer.vue` : aucune validation croisée `ticketsScanned` ≤ `ticketsSold`

- **Statut** : ⚪ Diagnostiqué
- **Sévérité** : 🟢 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/events/drawers/EventFormDrawer.vue` (`submit()`, validations
  `:808-844`)

## Symptôme

Un utilisateur peut saisir `ticketsScanned` supérieur à `ticketsSold` (ex. 500 scannés pour 100
vendus) sans aucun blocage côté formulaire ni côté backend (DTO n'a pas non plus de validation
croisée entre les deux champs).

## Cause racine

Absence de règle de validation croisée — chaque champ n'est validé isolément (type entier positif,
cf. BUG-73 backend / BUG-10 frontend déjà corrigés pour les bornes individuelles).

## Correction

Aucune à ce jour — prolonge la zone grise déjà documentée sur `numberOfSessions` vs
`sessions.length` (`docs/modules/07_EVENEMENTS.md`, "Zones grises restantes") : même famille
d'absence de garde-fou croisé sur les champs de billetterie. À trancher : la règle métier est-elle
"ticketsScanned ne peut jamais dépasser ticketsSold" (souvent vrai en billetterie), ou existe-t-il
des cas légitimes où ce n'est pas le cas (invités hors billetterie scannés à l'entrée) ?

## Risque de régression / à surveiller

Si une validation est ajoutée : vérifier qu'elle n'empêche pas la saisie progressive pendant
l'édition d'un event en cours (ex. `ticketsScanned` mis à jour avant que `ticketsSold` final soit
connu).

## Références

- `docs/modules/07_EVENEMENTS.md` ("Zones grises restantes", `numberOfSessions` vs
  `sessions.length`)
