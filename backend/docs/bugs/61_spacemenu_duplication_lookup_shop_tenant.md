# BUG-061 — Logique de lookup shop/tenant + résolution `spaceId` dupliquée sur 4 méthodes

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes / Espaces & builder — module `SpaceMenus`
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/space-menus/space-menus.service.ts:80-101, 594-615, 676-696, 788-809`
  (requête `spaceElement`), `:622-624, 702-704, 815-817` (dérivation `spaceId`)

## Symptôme

Aucun symptôme utilisateur direct — c'est de la dette qui a directement causé BUG-060 (une des 4
copies avait « oublié » de sélectionner `zone`, empêchant `getShopMenu` de résoudre `spaceId`).

## Cause racine

`getShopMenu`, `getShopAvailableMenuItems`, `getShopInventory` et `getStorageInventory`
réimplémentent chacune, quasi verbatim, le même bloc `spaceElement.findFirst`/`findMany` avec la
même clause de scoping tenant (`OR: [{floor:...},{forecourt:...},{externalMerch:...},{zone:...}]`)
et la même dérivation `spaceId = config?.spaceId ?? shop.zone?.spaceId ?? null`, avec un `select`
légèrement différent à chaque fois. Cette duplication à 4 endroits rend une divergence accidentelle
(comme BUG-060) facile à introduire et difficile à repérer en revue.

## Correction

Factorisation **partielle et ciblée**, après ré-examen (2026-07-17) : plutôt que d'unifier les 4
`select` hétérogènes (le vrai risque, notamment le `select` très riche de `getShopMenu`), deux
petits helpers privés purs sont extraits et réutilisés dans les 4 méthodes :
- `tenantShopOwnershipWhere(tenantId)` — la clause `OR` d'appartenance tenant, strictement
  identique dans les 4 méthodes (vérifié caractère près) ;
- `resolveShopSpaceId(shop)` — la dérivation `spaceId`, également identique dans les 4 méthodes.

Les `select` eux-mêmes (structure des données demandées à Prisma) restent propres à chaque
méthode, non touchés. Ce fix réduit la duplication réelle (celle qui a causé BUG-060) sans toucher
à la partie hétérogène jugée plus risquée.

## Risque de régression / à surveiller

- `tsc --noEmit` passe sans erreur sur l'ensemble du backend après ce changement.
- Vérifier qu'un appel à chacune des 4 méthodes (`getShopMenu`, `getShopAvailableMenuItems`,
  `getShopInventory`, `getStorageInventory`) renvoie toujours le même `spaceId`/comportement de
  scoping tenant qu'avant le refactor — comportement inchangé attendu, ce n'était qu'une extraction
  mécanique de code strictement identique.
- Si une nouvelle méthode a besoin du lookup shop/tenant, utiliser ces deux helpers plutôt que de
  recopier le bloc — c'est précisément ce que ce fix vise à éviter.

## Références

- [BUG-060](60_spacemenu_getshopmenu_spacelinks_non_scope.md) — le bug concret causé par cette
  duplication.
