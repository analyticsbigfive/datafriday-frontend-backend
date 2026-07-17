# BUG-130 — `/event-categories` : `hasHomeTeam` jamais envoyé par le seul écran dédié à ce champ

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/events/views/EventsCategorieListView.vue:352-368` (`submitCategory`)

## Symptôme

`/event-categories` est le seul écran dédié à la gestion des catégories, avec une case à cocher
"Has home team" (`:152`). L'utilisateur la coche, sauvegarde — le payload envoyé au backend
(`createEventCategory`/`updateEventCategory`) ne contient que `{ name, eventTypeId }` :
`hasHomeTeam` n'est jamais inclus. La coche est cosmétique sur cet écran.

## Cause racine

Oubli dans la construction du payload de `submitCategory()` — le champ est bien lu depuis
`categoryFormData.hasHomeTeam` mais jamais ajouté aux deux objets `payload` (création et édition).
`docs/modules/07_EVENEMENTS.md` (Piège n°2) affirmait ce champ "bien saisi et affiché" sur cet
écran — faux au niveau de la sauvegarde, seule la lecture (affichage `Oui`/`Non` dans le tableau)
fonctionnait.

## Correction

`hasHomeTeam: this.categoryFormData.hasHomeTeam` ajouté aux deux payloads (création et édition).

## Risque de régression / à surveiller

Vérifier qu'éditer une catégorie existante (déjà `hasHomeTeam: true` en base) et resauvegarder ne
réinitialise pas la valeur à `false` par erreur — le formulaire initialise bien
`categoryFormData.hasHomeTeam` depuis `category.hasHomeTeam` en édition (`openEditDialog`), donc
correct par construction.

## Références

- `docs/modules/07_EVENEMENTS.md` (Piège n°2)
- [[131_eventcategorydialog_hashometeam_absent_cache_emit]]
