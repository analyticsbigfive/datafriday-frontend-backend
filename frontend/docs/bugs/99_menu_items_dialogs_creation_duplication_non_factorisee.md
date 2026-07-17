# BUG-099 — 3 dialogs de création quasi dupliqués, non factorisés

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix à faire)
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/dialogs/CreateCategoryDialog.vue`, `CreatePackingTypeDialog.vue`, `CreateTypeDialog.vue`

## Symptôme

Structure identique à ~90% (header dégradé, badge d'erreur, `form-floating`, footer 2 boutons,
~50 lignes de CSS quasi identiques) pour trois entités différentes (Type, Category, PackingType).
`CreatePackingTypeDialog.vue` a même été copié depuis `CreateTypeDialog.vue` sans renommer le
préfixe CSS scoped (`.ctd-*` au lieu de `.cptd-*`) — preuve du copier-coller non factorisé
(inoffensif fonctionnellement grâce à `scoped`, mais source de confusion en maintenance).

## Cause racine

Aucune abstraction commune ; chaque fichier réimplémente `cancel()`/`submit()`/`error`/`loading`
avec la même forme.

## Correction

**Non corrigé** : extraire un `CreateReferentialDialog.vue` générique paramétré par `{ titleKey,
labelKey, apiFn, storeAction, extraPayload }` est un refactor d'architecture avec un risque de
régression non négligeable sur 3 flux de création différents (chacun a des subtilités : la
catégorie dépend d'un `typeId` déjà sélectionné, cf. [[87_menu_items_csv_resolution_type_categorie_fragile]]
pour le même genre de scoping). Reporté pour ne pas mélanger un refactor risqué avec les
correctifs de bugs de ce lot — à traiter dans une passe dédiée.

## Risque de régression / à surveiller

Si traité plus tard : vérifier que le préfixe CSS de `CreatePackingTypeDialog.vue` (`.ctd-*`) est
bien renommé en cohérence (`cptd-*`) au passage, même en cas de factorisation complète.

## Références

- Aucune.
