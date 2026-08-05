# BUG-268-01 — Space Menus : le drawer d'attachement n'a pas de « Tout sélectionner »

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Espaces & builder
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-02
- **Fichiers** : `ShopMenuItemsDrawer.vue:49-131,291-298`, `ShopDetailView.vue:113-131,397-408`

## Symptôme

Sur `/menu-fb/space-menus`, cliquer sur une boutique ouvre `ShopMenuItemsDrawer` avec ses deux
onglets « Disponible » / « Non disponible ». Attacher le menu complet d'une boutique (32 items
disponibles sur la boutique « 1 A » d'Auxerre, davantage ailleurs) impose **un clic par item** —
alors que c'est l'opération la plus courante à l'ouverture d'un espace.

Incohérence interne : la page sœur `ShopDetailView.vue` (`/menu-fb/space-menus/:spaceId/shops/:shopId`),
qui affiche la **même** liste avec les **mêmes** onglets et le même tableau d'ids `String`, possède
déjà une barre « Tout sélectionner » tri-état depuis sa création (`:113-131`). Le drawer ne l'a
jamais eue.

## Cause racine

Pas un défaut de logique : la fonctionnalité n'a simplement jamais été portée de la page vers le
drawer. Les deux composants ont été écrits séparément et ont divergé — `ShopDetailView` a la barre
et autorise la sélection de n'importe quel item ; le drawer n'a pas la barre et **bloque**
volontairement les items non disponibles (`ShopMenuItemsDrawer.vue:292` `if (!item.available)
return;`, et `:123` ne rend même pas la pastille de sélection sur ces lignes).

## Correction

Branche `feat/debugMenuItems`. Barre « Tout sélectionner » ajoutée dans `ShopMenuItemsDrawer.vue`
entre les onglets et l'en-tête de liste, en reprenant le markup, les computeds et le handler de
`ShopDetailView.vue:113-131,333-340,397-408` (préfixe `sdv-` → `smi-`, palette transposée sur le
rouge `#ff3131` du drawer plutôt que le bleu de la page).

- **Onglet « Disponible » uniquement** — `v-if="availabilityTab === 'available' && availableCount > 0"`.
  Décision prise avec le demandeur : rien n'est rendu sur « Non disponible », pas même une version
  grisée. Ces items sont volontairement non sélectionnables (il leur manque des ingrédients) ; un
  bouton inerte n'aurait fait qu'ajouter du bruit. **La règle métier existante n'est pas
  modifiée** : `toggleMenuItem` garde son garde-fou `!item.available`.
- Computeds `allAvailableSelected` / `someAvailableSelected` (tri-état : `Check` si tout coché,
  `Minus` si partiel), calculés sur `availableMenuItems` et non `displayedMenuItems` puisque la
  barre n'existe que sur un onglet.
- `toggleSelectAll()` n'ajoute/retire que les ids disponibles et **préserve les autres ids** déjà
  présents dans `selectedMenuItemIds` — voir « Risque de régression » ci-dessous.
- i18n : clé `selectAll` existante (`translations.js:6569` fr / `:2552` en), compteur interpolé
  dans le template.

**Rien à changer côté API ni backend** — vérifié de bout en bout : `toggleSelectAll` alimente le
même `selectedMenuItemIds` que le clic unitaire, `hasChanges` (`:234-240`, diff de `Set`) fait
apparaître « Valider la sélection (N) », `attachMenuItems` (`:299-334`) envoie le delta
`{ menuItemId: bool }` à `assignMenuItemsToShop` (`menu.api.js:514-522`), et
`saveMenuConfiguration` (`api-datafriday-staging`, `space-menus.service.ts:1148-1256`) accepte un
`Record<elementId, Record<menuItemId, boolean>>` sans limite de cardinalité : un `upsert`
`MenuAssignment` par item (`:1223-1229`) puis un `createMany` `SpaceMenuItem` pour les items
activés (`:1243-1248`).

## Risque de régression / à surveiller

- **⚠️ Timeout transactionnel backend (pré-existant, mais que ce bouton rend courant).** Les
  upserts de `space-menus.service.ts:1223` sont **séquentiels** (`await` dans une boucle `for`)
  à l'intérieur d'un `prisma.$transaction` **sans option `timeout`**, donc au défaut Prisma de
  **5 s**. Jusqu'ici les appelants front envoyaient un delta de 1 à quelques items ; avec « tout
  sélectionner », des lots de 50+ deviennent la norme. À ~10 ms par aller-retour ça passe largement
  (≈0,5 s), mais sur une base lente ou distante on s'approche du plafond — et un dépassement fait
  échouer **toute** la transaction, donc l'attachement entier. Non corrigé ici (modification
  backend hors périmètre de cette branche). **À éprouver sur la boutique ayant le plus d'items.**
  Si le plafond est atteint : passer les upserts en `createMany`/`updateMany` groupés, ou déclarer
  un `timeout` explicite sur la transaction.
- **Items indisponibles déjà attachés.** Le seed de sélection (`ShopMenuItemsDrawer.vue:268-270`)
  retient **tous** les items `enabled`, disponibles ou non. Un item attaché puis devenu
  indisponible reste donc dans `selectedMenuItemIds`, compte dans le « (N) » du footer, et n'a
  aucune UI pour être décoché. `toggleSelectAll` **n'aggrave pas** ce point (il filtre sur
  `availableMenuItems`, donc ne détache jamais ces ids) — mais c'est bien pour ça que le handler
  ne réaffecte pas le tableau en bloc. Ne pas « simplifier » ce filtre.
- Vérifier que rouvrir le drawer après validation recharge bien les N items cochés **depuis le
  backend** (c'est le seul contrôle qui prouve l'assignation réelle, le front ne refetch pas après
  écriture : voir le commentaire `:322`).
- Dark mode à contrôler sur les deux onglets. Attention à ne pas confondre la nouvelle
  `.smi-check-box` (carrée, barre de sélection) avec `.smi-check-dot` (ronde, lignes de liste) qui
  existait déjà.

## Références

- [[117_spacemenus_scrolllock_keepalive]] — même drawer, piège `keep-alive`/`deactivated`.
- [[128_spacemenus_cache_shopmenuitems_non_invalide]] — invalidation des caches après attachement.
- [[263_02_drawer_body_flex_min_height_manquant_contenu_coupe]] — conventions de layout des drawers.
- `docs/modules/04_MENU_CATALOGUE.md` § « SpaceMenus » / « MenuAssignment ».
