# BUG-111 — Import CSV MenuItem : interface trop dense, listes d'erreurs sans action possible

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17 (signalé par l'utilisateur, captures à l'appui)
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue`

## Symptôme

- La barre d'étapes (File/Preview/Result) était collée directement sous la bannière rouge du
  header, sans respiration visuelle.
- L'étape Aperçu affichait systématiquement en pleine vue de longues listes de noms (lignes en
  erreur, doublons ignorés), sans qu'aucune action ne soit possible dessus — pur bruit visuel
  pour l'utilisateur, en particulier sur un gros fichier (77+ lignes listées d'un coup).

## Cause racine

`.mi-stepbar` n'avait pas de padding-top. Les bandeaux d'avertissement (`invalidRows`/
`duplicateRows`/`unresolvedRecipeLines`) affichaient systématiquement leur liste complète (jusqu'à
10 entrées + compteur) sans possibilité de la replier.

## Correction

- `pt-5` ajouté à `.mi-stepbar` (espace entre le header et la barre d'étapes).
- Les trois listes de détail sont désormais **repliées par défaut**, avec un bouton "Voir le
  détail"/"Masquer le détail" dans chaque bandeau — l'information reste accessible mais n'impose
  plus sa présence permanente à l'écran.

## Risque de régression / à surveiller

Aucun — changement purement visuel/interaction, aucune donnée ni logique de validation modifiée.

## Références

- [[110_menu_items_export_placeholder_tiret_casse_reimport]] (le vrai fix de fond qui réduit
  drastiquement le nombre de lignes en erreur affichées dans ces listes)
