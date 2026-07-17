# BUG-138 — Import CSV Événements : fichier vide/en-tête seul silencieusement ignoré

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `CsvImportDrawer.vue:594` (avant correction), `TaxonomyImportDrawer.vue:417`
  (avant correction)

## Symptôme

`if (parsed.length < 2) return;` — si le fichier CSV déposé ne contient que l'en-tête (ou est
vide/mal encodé), rien ne se passe : pas de message d'erreur, l'étape reste bloquée à 1 (upload)
sans qu'aucun signal n'indique à l'utilisateur pourquoi son clic n'a rien déclenché.

## Cause racine

Cas d'erreur non traité — le early-return silencieux ne distingue pas "fichier chargé mais vide" de
"aucune action de l'utilisateur".

## Correction

Un état `fileError` est posé (message "Ce fichier est vide ou ne contient que l'en-tête — aucune
ligne à importer.") et affiché en haut de l'étape 1 via une `v-alert`, dans les deux drawers
(`CsvImportDrawer.vue`, `TaxonomyImportDrawer.vue`). Réinitialisé à chaque nouvelle tentative
d'upload et à la fermeture du drawer (`reset()`).

## Risque de régression / à surveiller

Déposer un CSV avec seulement une ligne d'en-tête doit maintenant afficher le message d'erreur
immédiatement, sans avancer à l'étape 2.

## Références

- Aucune.
