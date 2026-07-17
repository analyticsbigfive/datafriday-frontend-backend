# BUG-143 — Computed morts jamais référencés dans le template (`EventsTypeListView`/`EventsCategorieListView`)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `EventsTypeListView.vue` (`typeDialogTitle`, `totalCategories`),
  `EventsCategorieListView.vue` (`categoriesWithHomeTeam`)

## Symptôme

Trois `computed` sans aucun consommateur (grep confirmé sur le template et le reste du script) :
- `typeDialogTitle` — le titre du drawer utilise en fait `t('eventTypeList.drawerEditTitle'/
  'drawerCreateTitle')`.
- `totalCategories` — jamais affiché nulle part dans `/event-types`.
- `categoriesWithHomeTeam` — jamais affiché nulle part dans `/event-categories`.

## Cause racine

Vestiges d'une itération antérieure de ces écrans (probablement avant l'introduction du système
i18n pour le premier, et d'un compteur retiré de l'UI pour les deux autres).

## Correction

Les 3 `computed` supprimés.

## Risque de régression / à surveiller

Aucun — code strictement mort, aucun template ni méthode n'y faisait référence.

## Références

- Aucune.
