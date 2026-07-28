# BUG-115 — ShopDetailView.vue : dette diverse (i18n contourné, pas de dark mode, formatage incohérent, logs, pas de retry)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/ShopDetailView.vue`

## Symptôme / Cause racine

Plusieurs points de dette technique cumulés sur ce même fichier, relevés lors de l'audit complet :

1. **i18n entièrement contourné** : aucun `useI18n()` dans tout le fichier — tous les textes sont
   en dur, et mélangent FR et EN dans le même écran : FR — « Retour aux boutiques », « Menu Items
   disponibles », « Sélectionnez des items pour les attacher au shop », « Attacher », « Aucun
   article trouvé », « Items attachés au shop », « Aucune description », « Autre » — vs EN —
   « Available »/« Not Available », « Select All Available Items », « Uncategorized »,
   « Failed to attach items to shop ». Les clés i18n existent déjà et sont inutilisées ici
   (`spaceMenuAvailable`, `spaceMenuNotAvailable`, `spaceMenuNoRecipe`, etc., `i18n/translations.js`).
2. **Pas de dark mode** : aucune classe/variable `isDark`/`theme` dans tout le fichier — rend en
   clair même quand l'app est en thème sombre.
3. **Formatage monétaire incohérent** : `` `$${Number(price).toFixed(2)}` `` (lignes 150, 199) —
   `$`, 2 décimales — au lieu du formatter partagé `useFormatters.js` (EUR, 0 décimale, décision UI
   du 2026-07-12) utilisé par le reste du domaine `menu-fb`.
4. **9 `console.log`/`console.warn` de debug** laissés en production (anciennement lignes 404, 461,
   488, 521, 522, 543, 556, 567, 568).
5. **Pas de retry sur l'état d'erreur** (`v-if="error"`) — texte statique, contrairement à
   `SpaceMenuShopView.vue`/`SpaceMenuItemView.vue` qui proposent tous deux un bouton retry.

## Correction

- Tous les textes en dur remplacés par `useI18n()` / `t()`, en réutilisant les clés `spaceMenu.*`
  déjà définies pour le reste du feature.
- Support du dark mode ajouté (prop `isDark` alimentée depuis `useTheme()`, classes miroir des
  autres écrans du feature `.sdv-page--dark`, etc.).
- Formatage monétaire remplacé par `formatCurrency` de `useFormatters.js`.
- Les 9 `console.log`/`console.warn` de debug supprimés.
- Bouton retry ajouté sur l'état d'erreur, cohérent avec `SpaceMenuShopView.vue`.

## Risque de régression / à surveiller

- Vérifier visuellement l'écran en thème clair ET sombre après le fix.
- Vérifier que les prix affichés correspondent au format utilisé ailleurs dans `/space-menus`
  (EUR, 0 décimale).

## Références

- [BUG-113](113_spacemenus_shopdetailview_orpheline_attach_factice.md), [BUG-114](114_spacemenus_shopdetailview_disponibilite_catalogue_divergents.md) — mêmes fichier, bugs fonctionnels.
