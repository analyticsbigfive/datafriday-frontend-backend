# BUG-141 — Événements : i18n contourné sur les 4 dialogs de suppression + mini-dialog "Créer une équipe"

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `EventDeleteDialog.vue`, et les dialogs de suppression inline de
  `EventsCategorieListView.vue`, `EventsTypeListView.vue`, `EventsSubcategorieListView.vue`,
  `EventFormDrawer.vue:459-476` (mini-dialog "Créer une équipe")

## Symptôme

Les 4 dialogs de suppression du domaine (dont 3 inline dans leur vue de liste respective) avaient
tous leurs textes ("Supprimer X", "Cette action est irréversible", "Annuler", "Suppression…") codés
en dur en français, alors que le reste de chacun de ces mêmes fichiers utilise systématiquement
`useI18n()`/`t()`. Même chose pour le mini-dialog "Créer une équipe" inline dans
`EventFormDrawer.vue` ("Créer une équipe", "Nom de l'équipe", "Annuler", "Créer").

## Cause racine

Ces blocs UI ont été ajoutés (ou copiés-collés entre les 3 vues de liste) sans jamais brancher les
clés i18n déjà utilisées ailleurs dans les mêmes fichiers.

## Correction

- Nouvelles clés `eventsList.delete*`, `eventTypeList.delete*`, `eventCategoryList.delete*`,
  `eventSubcategoryList.delete*` (Title/Subtitle/Text/Cancel/Confirm/Confirming) ajoutées en EN et
  FR dans `src/i18n/translations.js`, branchées sur les 4 dialogs de suppression.
- Nouvelles clés `eventsList.createTeam*` (Title/Label/Placeholder/Cancel/Confirm) pour le
  mini-dialog de `EventFormDrawer.vue`.

## Risque de régression / à surveiller

Basculer la langue de l'app (FR ↔ EN) et vérifier que les 5 dialogs concernés changent bien de
langue — vérifié par un test Node direct que les clés résolvent des deux côtés (3524 clés EN/FR,
symétriques après ajout).

## Références

- Aucune.
