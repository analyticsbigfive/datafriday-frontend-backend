# BUG-109 — Import CSV MenuItem : dropzone de l'étape 1 n'utilise pas toute la hauteur du tiroir

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17 (signalé par l'utilisateur, capture à l'appui)
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue`

## Symptôme

À l'étape 1 (upload), la zone de dépôt CSV n'occupait qu'une petite portion de la hauteur du
tiroir — un grand espace vide restait entre la zone de dépôt (+ le bloc "colonnes reconnues") et
le bas du tiroir, avant le bouton "Cancel".

## Cause racine

`.mi-body { flex: 1 }` donnait bien au corps du tiroir toute la hauteur disponible, mais `.mi-body`
lui-même n'était pas un conteneur flex — ses enfants (les divs `v-if="step === N"`) restaient donc
en flux bloc normal, dimensionnés par leur seul contenu. La dropzone (`.mi-dropzone`) n'avait
aucune règle de hauteur/flex : sa taille venait uniquement de son `padding: 48px 24px`.

## Correction

- `.mi-body` devient un conteneur flex colonne (`display: flex; flex-direction: column`).
- Le wrapper de l'étape 1 reçoit une classe dédiée `.mi-step1` (`flex: 1; min-height: 0`) pour
  occuper toute la hauteur restante du corps du tiroir.
- `.mi-dropzone` reçoit `flex: 1` (avec un plancher `min-height: 220px`) pour remplir l'espace
  disponible à l'intérieur de `.mi-step1` — le bloc "colonnes reconnues" en dessous garde sa
  hauteur naturelle.
- Étapes 2 (aperçu) et 3 (résultat) non touchées : elles restent en flux normal, leur contenu
  (tableau, récapitulatif) n'ayant pas le même besoin de remplissage.

## Risque de régression / à surveiller

Vérifier visuellement (non fait ici, `pnpm dev` interdit dans cette session) que la dropzone
s'agrandit bien proportionnellement à la hauteur de fenêtre sans casser le centrage de son
contenu (icône/texte/bouton), et que les étapes 2/3 n'ont pas été affectées par le passage de
`.mi-body` en `display: flex`.

## Références

- Aucune.
