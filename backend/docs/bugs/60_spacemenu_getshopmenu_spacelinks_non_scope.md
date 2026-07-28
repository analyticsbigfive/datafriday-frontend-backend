# BUG-060 — `getShopMenu` renvoie les prix de TOUS les espaces (spaceLinks non scopé) et ne résout jamais `spaceId`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes / Espaces & builder — module `SpaceMenus`
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/space-menus/space-menus.service.ts:90-101` (select shop),
  `:119` (spaceLinks non scopé), `:364-374` (retour sans spaceId)

## Symptôme

`GET /space-menu/shop/:shopId` (le détail complet d'un shop, avec prix/coûts/marges) renvoie pour
chaque `MenuItem` un `spacePricing` contenant les prix spécifiques de **tous** les espaces où
l'item a un prix custom — pas seulement celui de l'espace du shop demandé. Un tenant multi-espaces
(franchise, plusieurs sites) voit dans la réponse réseau les prix négociés pour ses *autres* sites,
alors que la page ne devrait exposer que ceux du shop consulté. Le front (`ShopDetailView.vue`,
`SpaceMenuView.vue`) n'affiche pas aujourd'hui ce champ, donc aucun symptôme visuel actuel — mais
la donnée est présente dans la réponse JSON pour quiconque inspecte le réseau.

## Cause racine

Deux défauts liés dans la même fonction :
1. `space-menus.service.ts:119` sélectionne `spaceLinks: spaceLinksSelect` **sans** `where: { spaceId }`,
   contrairement à la version scopée utilisée juste plus bas dans le même fichier
   (`getItemsWithAvailabilityForSpace`, `:425` : `spaceLinks: { where: { spaceId }, ...spaceLinksSelect }`).
2. Le `select` de la requête `spaceElement.findFirst` de `getShopMenu` (`:90-101`) ne demande jamais
   `zone: { select: { spaceId: true } } }`, contrairement à ses 3 fonctions sœurs
   (`getShopAvailableMenuItems:611`, `getShopInventory:692`, `getStorageInventory:805`). Résultat :
   `getShopMenu` n'a structurellement **aucun moyen** de connaître le `spaceId` du shop — son objet
   de retour (`:364-374`) n'inclut d'ailleurs pas de champ `spaceId`, contrairement à ses 3 sœurs.
   C'est la cause racine du point 1 : sans `spaceId` résolu, `spaceLinks` ne pouvait pas être scopé.

## Correction

- Ajout de `zone: { select: { spaceId: true } } }` au `select` du shop dans `getShopMenu`, et
  résolution de `spaceId` de la même façon que les 3 fonctions sœurs
  (`config?.spaceId ?? shop.zone?.spaceId ?? null`).
- `spaceLinks` scopé par ce `spaceId` (`where: { spaceId }`), à l'image de
  `getItemsWithAvailabilityForSpace`.
- `spaceId` ajouté à l'objet de retour de `getShopMenu`, pour cohérence avec les 3 autres endpoints
  du même contrôleur.

## Risque de régression / à surveiller

- Vérifier que `GET /space-menu/shop/:shopId` renvoie bien un `spaceId` non nul pour un shop
  builder v1 (floor/forecourt/externalMerch) ET builder v2 (zone).
- Vérifier que `spacePricing` dans la réponse ne contient plus que l'entrée du `spaceId` du shop
  consulté (ou est vide si aucun prix custom n'existe pour cet espace).
- Un tenant avec plusieurs espaces et des prix custom différents par espace est le cas de test à
  privilégier.

## Références

- [BUG-061](61_spacemenu_duplication_lookup_shop_tenant.md) — la duplication de la logique de
  lookup shop/tenant/spaceId sur 4 méthodes est la dette technique qui a permis à cet écart de
  passer inaperçu (une des 4 copies a « oublié » `zone`).
