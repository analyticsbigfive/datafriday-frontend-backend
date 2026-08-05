# BUG-276-02 — Menus des Espaces (« Par menu item ») : pas de « Tout sélectionner »

> Note : comme [BUG-268-01](268_01_spacemenus_drawer_sans_tout_selectionner.md), ce n'est pas un
> défaut mais une **amélioration UX** demandée par l'utilisateur, tracée ici pour garder
> l'historique du module Space Menus au même endroit.

- **Statut** : 🟢 Corrigé (2026-08-02)
- **Sévérité** : 🟡 Mineur (ergonomie)
- **Domaine** : Menu & recettes (Space Menus)
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-02 (demandé par l'utilisateur, capture d'écran à l'appui)
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/SpaceMenuItemView.vue`

## Symptôme

Sur `/menu-fb/space-menus`, onglet « Par menu item », attacher un article à toutes les boutiques
d'un espace (16-20 selon la capture) impose **un clic par boutique** dans la liste déroulante
« X/Y shops ». Même symptôme, écran miroir, que [BUG-268-01](268_01_spacemenus_drawer_sans_tout_selectionner.md)
(qui concernait l'autre sens : depuis une boutique, attacher tous ses articles).

## Cause racine

Fonctionnalité jamais portée sur cet écran (pas un défaut de logique) — `ShopMenuItemsDrawer.vue`
avait déjà sa barre tri-état depuis BUG-268, `SpaceMenuItemView.vue` (screen différent, sens
inverse de l'assignation) ne l'a jamais eue.

## Correction

Barre « Tout sélectionner »/« Tout désélectionner » tri-état ajoutée en tête de la liste déroulante
de boutiques (repris de `ShopMenuItemsDrawer.vue`, préfixe `smi-` → `smiv-`, mêmes icônes
`Check`/`Minus`, même palette rouge). Différence avec le modèle du drawer (sélection locale +
bouton « Valider ») : ici chaque clic sauvegarde **immédiatement** (comme le clic unitaire déjà en
place sur ce même écran), donc le bouton tri-état sauvegarde directement aussi, en un seul appel
réseau batché plutôt qu'un par boutique :

- `toggleSelectAllShops(item)` calcule le delta (boutiques dont l'état diffère de la cible —
  tout cocher ou tout décocher) et n'envoie QUE ce delta, jamais l'état complet.
- Utilise `saveSpaceMenuConfiguration({ spaceId, configId, menuItems })` (déjà existante dans
  `menu.api.js`, jusqu'ici inutilisée par ce fichier) plutôt que `assignMenuItemsToShop` (limité à
  1 seule boutique par appel) — `menuItems` accepte `{ [shopId]: { [menuItemId]: bool } }` pour
  plusieurs boutiques à la fois, POST sur la même route `/space-menu`.
- **Vérifié côté backend** (`space-menus.service.ts:1148-1256`, `saveMenuConfiguration`) : upsert
  **partiel**, ne touche que les paires (elementId, menuItemId) présentes dans le payload — envoyer
  un delta de N boutiques pour 1 seul article n'affecte aucune autre assignation existante.
- État `pendingBulkToggles` (spinner + `pointer-events:none` pendant l'appel), même patron que
  `pendingToggles` (toggle unitaire) déjà en place.
- Après succès, émet `menu-item-toggled` pour CHAQUE boutique changée — réutilise tel quel le
  handler `onMenuItemToggled` du parent (`SpaceMenuView.vue`), aucune modification du parent
  nécessaire.
- i18n : réutilise les clés génériques déjà existantes `selectAll`/`unselectAll` (pas de nouvelle
  clé `spaceMenu.*` créée, ni doublon).

## Risque de régression / à surveiller

- Même risque de timeout transactionnel que documenté pour BUG-268 (upserts séquentiels dans un
  `$transaction` Prisma au défaut 5s) — ici plafonné par construction au nombre de boutiques de
  l'espace (16-20 dans l'exemple observé), sensiblement moins risqué que le cas BUG-268 (50+ items
  d'un coup), mais à surveiller sur un espace à beaucoup de boutiques.
- La barre tri-état se base sur `shops` (prop), déjà filtrée `merchshop`-exclu par le parent
  (BUG-274/275) — cohérent, "tout sélectionner" ne peut pas assigner un article à un stand Merch.
- Dark mode à vérifier visuellement (variantes ajoutées mais non testées en navigateur, contrainte
  de session).

## Références

- [BUG-268-01](268_01_spacemenus_drawer_sans_tout_selectionner.md) — même demande, écran miroir
  (`ShopMenuItemsDrawer.vue`), source du pattern repris ici.
