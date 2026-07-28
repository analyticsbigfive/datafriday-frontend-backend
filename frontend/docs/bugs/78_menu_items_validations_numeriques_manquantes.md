# BUG-078 — MenuItemCreateView : validations numériques manquantes (négatifs/décimaux acceptés)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/views/MenuItemCreateView.vue:100-113,383-390,1031-1042,1083`

## Symptôme

Les attributs HTML `min`/`step` sont purement décoratifs (pas de validation native déclenchée) :
- `addPriceGroup()` : `if (!price || ...) return;` — un prix négatif est **truthy** en JS, passe
  le garde-fou et crée un groupe de prix négatif.
- `numberOfPiecesRecipe` (`min="1" step="1"`) : la validation à la sauvegarde ne vérifie que
  `< 1`, donc une valeur décimale (`1.5`) est acceptée pour un compteur de pièces qui devrait être
  entier.
- `item.quantity` dans le tableau ingrédients/composants/packaging : le champ texte accepte une
  saisie directe négative (seuls les boutons +/- clampent via `Math.max(0, ...)`), faussant
  `totalCost`/`costPerPiece` et envoyée telle quelle au backend.

## Cause racine

Validation uniquement décorative côté HTML, jamais revérifiée en JS avant construction du payload.

## Correction

- `addPriceGroup()` : rejet explicite si `price <= 0` (au lieu du garde-fou `!price` truthy-only).
- `numberOfPiecesRecipe` : validation étendue pour rejeter les valeurs non entières en plus des
  valeurs `< 1`.
- `item.quantity` : clamp `Math.max(0, ...)` appliqué aussi à la saisie directe au clavier (pas
  seulement aux boutons +/-), avant construction des tableaux `ingredients`/`components`/
  `packagings` envoyés au backend.

## Risque de régression / à surveiller

Vérifier qu'une quantité à zéro reste acceptée si c'est un cas d'usage légitime (ligne
temporairement neutralisée) — sinon durcir en rejet plutôt qu'en clamp à 0.

## Références

- Aucune.
