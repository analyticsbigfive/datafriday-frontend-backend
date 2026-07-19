# BUG-168 — `ProductCategoryList.vue` : force le refresh à chaque montage, contourne le cache TTL

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes (Configurations — Menu Item Categories)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** : `src/components/products/views/ProductCategoryList.vue:187-192,211` (`mounted()` appelle `loadCategories()` qui passe toujours `{forceRefresh: true}`)

## Symptôme

Contrairement à `ProductTypeList.vue:197-199` (mount respectant le cache 15 min standard),
`ProductCategoryList.vue` recharge systématiquement les catégories depuis l'API à chaque montage/
navigation vers `/product-categories`, même si le cache est encore valide — un aller-retour réseau
évitable à chaque visite de l'écran.

## Cause racine

`loadCategories()` passe inconditionnellement `{forceRefresh: true}` au lieu de laisser le getter
`isCacheValid` du store trancher, contrairement au contrat de cache documenté dans
`frontend/CLAUDE.md` pour les modules Vuex standard.

## Correction

Reste à faire : retirer `forceRefresh: true` du mount par défaut, ne le garder que pour le
listener `@saved` (après une création/édition, où un refresh forcé est légitime — voir
[BUG-159](159_producttype_optimistic_write_objet_partiel.md), qui documente que `ProductTypeList.vue`
manque justement ce listener sur sa propre page).

## Risque de régression / à surveiller

Vérifier qu'une catégorie créée/modifiée depuis un autre onglet reste visible dans un délai
raisonnable (le TTL de 15 min s'appliquera alors normalement, comportement attendu et cohérent avec
le reste de l'app).

## Références

- [BUG-159](159_producttype_optimistic_write_objet_partiel.md) — problème inverse sur la page sœur Types (pas assez de refresh, celui-ci en a trop).
