# BUG-045 — `unit` codé en dur à `null` pour un menu item mono-ingrédient `readyForSale=Yes`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (affichage — unité générique au lieu de la vraie unité)
- **Domaine** : Stock (Logistics)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `logistics.service.ts:539` (avant fix), méthode `itemRefsForMenuItem`

## Symptôme

Sur `/spaces/:spaceId/logistic`, une carte de denrée affichait `4 units/pack` au lieu de
`4 Pc/pack` — repli générique côté front (`LogisticItemCard.vue:16-18`,
`{{ unitsPerPack }} {{ item?.unit || t('logiUnits') }}/pack`) alors que l'ingrédient a bien une
unité définie en base.

Repro observée : denrée "Bun - Burger" (`Ingredient.id = cmpa6w6qv00s39tbf1uamqnti`,
`recipeUnit = "Pc"`), rattachée en base à trois menu items — BURGER SEUL (`readyForSale=No`, 4
ingrédients), CHIPS (`readyForSale=No`, 1 ingrédient), FUZE TEA (`readyForSale=Yes`, 1 ingrédient
— rattachement volontaire, données de test ; non représentatif d'une vraie carte, mais suffisant
pour déclencher le bug). L'agrégation par nom dans `aggregateItems`
(`logistics.service.ts:646-667`) ne garde que la **première** occurrence rencontrée pour fixer
`unit`/`marketPriceId`/`unitsPerPack`/`packagingType`/`picture` — si FUZE TEA (branche
`readyForSale=Yes`) est traité avant BURGER SEUL/CHIPS (branche `readyForSale=No`), la ligne hérite
du `unit: null` de la branche `Yes`.

## Cause racine

Dans `itemRefsForMenuItem`, deux branches produisent un ref `kind: 'ingredient'` pour le cas
mono-ingrédient résolu via un Market Price :
- branche `readyForSale === 'No'` (boucle `item.ingredients`, ligne ~562) :
  `unit: ing.recipeUnit ?? null` — correct.
- branche `readyForSale === 'Yes'` (mono-ingrédient, ligne ~538) : `unit: null` codé en dur, sans
  raison identifiée — divergence pure avec la branche sœur, pas un choix voulu (rien dans le nom du
  champ ni les commentaires ne justifie l'absence d'unité ici spécifiquement).

Comme l'agrégation par nom (`aggregateItems`) ne fixe les champs qu'à la première occurrence, le
bug n'est visible que si un menu item `readyForSale=Yes` mono-ingrédient partage sa denrée avec un
autre item `readyForSale=No` **et** passe en premier dans l'ordre d'agrégation du shop — sinon la
valeur `No` (correcte) gagne et masque le bug par chance. Concerne potentiellement tout item
mono-ingrédient en `readyForSale=Yes` du catalogue, pas seulement l'exemple repro.

## Correction

`logistics.service.ts:539` : `unit: null` → `unit: ing.recipeUnit ?? null` (aligné sur la branche
`readyForSale=No`). `Ingredient.recipeUnit` est déjà sélectionné par `recipeSelect()` — aucun
changement de requête Prisma nécessaire.

## Risque de régression / à surveiller

- Vérifier l'affichage d'un item mono-ingrédient `readyForSale=Yes` après déploiement (doit
  afficher sa vraie unité, pas "units").
- Le rattachement "Bun - Burger" → FUZE TEA/CHIPS en base est **volontaire** (données de test,
  confirmé par l'équipe) — ce n'est pas une erreur à corriger, aucune action de données requise.

## Références

- [BUG-044](44_stock_payload_lent_et_volumineux.md) — même écran, code adjacent, cause indépendante.
