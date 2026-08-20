# BUG-347-02 — Inspecteur Inventaire (Builder) : conditionnement générique "Pack(s)" au lieu de la vraie valeur "is stored in"

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Espaces & builder / Stock
- **Repo(s) concerné(s)** : les deux (`datafriday-web` + `api-datafriday-staging`)
- **Découvert le** : 2026-08-20 (signalement Ulrich : incohérence de packaging sur les écrans
  logistique, "Pack" affiché partout au lieu du libellé configuré sur Edit Component / Edit
  Supplier Item, ex. "Carton", "Pipette")
- **Fichiers** :
  - `backend/src/features/space-menus/space-menus.service.ts:887` (`getStorageInventory`)
  - `frontend/src/components/spaces/views/builder2/components/inspector/sections/StorageInventorySection.vue:302-322`

## Symptôme

Dans le panneau "Inventaire" de l'inspecteur d'un élément de stockage (Builder d'espace), le chip
de conditionnement à côté de la quantité (et l'indice sous Min/Max) affiche le mot générique
"Pack(s)" pour des articles pourtant configurés avec un conditionnement précis ("Carton",
"Pipette"...) dans Edit Component / Edit Supplier Item (Market Price). Les formulaires d'édition
eux-mêmes affichent la bonne valeur — seul ce panneau d'inspection se trompe.

## Cause racine

`StorageInventorySection.vue:310-318` (avant fix) rechargeait tout le catalogue Market Price
côté client (`getMarketPrices()`, sans pagination) et résolvait le conditionnement de chaque ligne
par **correspondance de NOM** (`itemName.trim().toLowerCase()`) contre ce catalogue.

Deux défauts cumulés :
1. `getMarketPrices()` sans paramètres ne renvoie que la page 1 (200 lignes max, tri
   alphabétique) — même famille de bug que BUG-345-01, qui listait déjà ce fichier
   (`StorageInventorySection.vue:313`) comme appelant latent non traité.
2. Même avec le catalogue complet, la résolution par nom est intrinsèquement ambiguë
   ("plusieurs Market Price peuvent partager un nom", commentaire d'origine) — un ID est
   disponible et non exploité.

Dès qu'aucune correspondance n'était trouvée (article hors page 1, ou nom non matché),
`packInfoFor()` retournait `null` et l'UI repliait sur le libellé générique `t('b2InventoryPacksWord')`
("Packs") au lieu du vrai `packagingType`.

## Correction

Résolution déplacée côté backend, **par ID**, bornée aux seuls articles réellement utilisés par
l'élément de stockage inspecté (jamais tout le catalogue tenant) :

- `getStorageInventory` (`space-menus.service.ts`) sélectionne désormais `marketPriceId` sur
  Ingredient/Packaging, `packedUnits`/`inventoryPackaging` directement sur MenuComponent, et
  `inventoryPackagingType`/`inventoryNumberOfUnits` directement sur MenuItem (article merch).
  Chaque `StorageLine` retournée porte deux nouveaux champs `unitsPerPack`/`packagingType`,
  résolus par un unique `findMany` MarketPrice borné aux `marketPriceId` effectivement
  référencés (après la boucle de construction des lignes, avant le tri final).
- `StorageInventorySection.vue` : suppression du fetch `getMarketPrices()`/`onMounted` ; la map
  `packInfoByName` se construit désormais directement depuis les champs `unitsPerPack`/
  `packagingType` déjà présents sur `derived.value` (fournis par le backend).

Les lignes ajoutées manuellement (hors menu, sans référence catalogue donc sans id) gardent le
repli silencieux sur l'unité brute — comportement déjà documenté, inchangé.

## Risque de régression / à surveiller

- Vérifier en recette qu'un article avec conditionnement configuré (Carton, Pipette...) affiche
  bien ce libellé dans le panneau Inventaire du Builder, pour un tenant dont le catalogue Market
  Price dépasse 200 lignes (cas qui déclenchait le bug avant fix).
- Vérifier qu'un article merch (MenuItem) affiche bien son conditionnement
  (`inventoryPackagingType`/`inventoryNumberOfUnits`) — chemin nouvellement branché, jamais
  exercé avant ce fix.
- Aucune migration : changement de `select` Prisma + logique de résolution, pas de schéma modifié.
- Callers latents restants de la même famille listés par BUG-345-01, non vérifiés par cette
  fiche : `useInventoryApi.js`, `RecipeImportDrawer.vue` — à traiter séparément si un symptôme
  remonte sur ces écrans.
- **Vérifié le 2026-08-20 (suite question Ulrich) : `SpaceLogisticView.vue` / écran
  `/spaces/:id/logistic` n'a PAS ce bug précis (résolution catalogue tronquée)** — sa résolution
  serveur (`LogisticsService.getStock`) est saine, pas de fetch catalogue page-1 tronqué côté
  front. Mais l'écran avait un bug voisin, cause différente (donnée déjà résolue et disponible,
  simplement jamais lue par deux lignes de template précises) : voir BUG-348-02
  (`LogisticByItemView.vue` ET `LogisticItemCard.vue`, tous deux corrigés).
  (`logistics.service.ts`), avec une résolution par nom ciblée/bornée aux seuls noms
  d'ingrédients non résolus (pas un fetch catalogue page 1 tronqué). Son repli générique
  (`logiPacked` = "Packed"/"Emballé") est un libellé de champ légitimement générique quand le
  type est réellement inconnu, pas une valeur usurpée comme le mot "Pack(s)" de ce bug. Retiré
  de la liste des callers latents.

## Références

- BUG-345-01 (même famille : résolution catalogue tronquée à la page 1), BUG-299-01 (principe
  "l'ID prime toujours, le nom est un repli réservé aux lignes sans identifiant").

Ulrich
