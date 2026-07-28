# BUG-146 — `EventFormDrawer.vue` : aucune validation croisée `ticketsScanned` ≤ `ticketsSold`

- **Statut** : 🟢 Corrigé
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

**Décision (2026-07-18)** : la règle métier "ticketsScanned ≤ ticketsSold" n'est pas garantie vraie
en toute généralité (invités hors vente comptés au scan, comps) — pas de blocage. Un avertissement
**non bloquant** est ajouté à la place, pour éviter les erreurs de saisie évidentes (ex. inversion
des deux champs) sans empêcher les cas légitimes.

Implémentation : `EventFormDrawer.vue` — computed `ticketsScannedExceedsSold` (réactif, évalué à
chaque frappe sur les deux champs) affiche un bandeau `.efd-warning` (ambre, distinct visuellement
de `.efd-error` qui est bloquant) sous la section Billetterie dès que
`ticketsScanned > ticketsSold`. `submit()` n'a **pas** été modifié : aucune validation croisée n'y
a été ajoutée, la sauvegarde reste possible avec l'avertissement affiché.

## Risque de régression / à surveiller

- Vérifier que le bandeau apparaît/disparaît en temps réel pendant la saisie (pas seulement au
  submit), et qu'il n'empêche jamais la sauvegarde.
- Vérifier l'affichage en dark mode (`.efd--dark .efd-warning`).

## Références

- `docs/modules/07_EVENEMENTS.md` ("Zones grises restantes", `numberOfSessions` vs
  `sessions.length`)
