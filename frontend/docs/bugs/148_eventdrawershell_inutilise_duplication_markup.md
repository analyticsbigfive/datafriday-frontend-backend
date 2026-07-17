# BUG-148 — `EventDrawerShell.vue` inutilisé dans le périmètre Événements, header/footer dupliqués 3×

- **Statut** : ⚪ Diagnostiqué
- **Sévérité** : 🟢 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/events/drawers/EventDrawerShell.vue`, vs `EventFormDrawer.vue:1-27`,
  `CsvImportDrawer.vue:1-23`, `TaxonomyImportDrawer.vue:1-23`

## Symptôme

`EventDrawerShell.vue` vit dans `components/events/drawers/` (le même dossier que les 3 autres
drawers du domaine) mais ses seuls importeurs réels sont `EventPredictSourcesDrawer.vue` et
`EventDetailsEditor.vue` — tous deux hors périmètre (domaine Prévision). Les 3 drawers du domaine
Événements (`EventFormDrawer.vue`, `CsvImportDrawer.vue`, `TaxonomyImportDrawer.vue`) réimplémentent
chacun leur propre header/footer de drawer (markup + CSS quasi identiques : dégradé rouge, icône,
titre/sous-titre, bouton fermeture) au lieu de réutiliser ce shell pourtant rangé au même endroit —
duplication de ~3× la même CSS.

## Cause racine

Non tranché — le shell a peut-être été introduit après ces 3 drawers (donc jamais rétrofité), ou
volontairement laissé de côté pour une raison non documentée (ex. besoin de personnalisation que le
shell ne permet pas).

## Correction

Aucune à ce jour — décision à prendre : migrer les 3 drawers vers `EventDrawerShell.vue` pour
éliminer la duplication (risque : vérifier que le shell couvre bien tous les besoins actuels — steps
d'import, footer à boutons multiples pour `CsvImportDrawer`/`TaxonomyImportDrawer`), ou assumer la
duplication comme un compromis délibéré.

## Risque de régression / à surveiller

Si migration : `CsvImportDrawer.vue`/`TaxonomyImportDrawer.vue` ont un footer à contenu variable
selon l'étape (Retour/Suivant/Importer, puis Fermer) — vérifier que le shell supporte ce genre de
slot avant de l'adopter.

## Références

- Aucune.
