# BUG-097 — CreateTypeDialog/CreateCategoryDialog : doublon de nom renvoie une 500 générique

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`, `datafriday-api` (backend, même repo)
- **Découvert le** : 2026-07-17
- **Fichiers** : `backend/src/features/menu-items/menu-items.service.ts` (`createProductType`, `createProductCategory`), `src/components/menu-fb/views/menu-items/dialogs/CreateTypeDialog.vue:78`, `src/components/menu-fb/views/menu-items/dialogs/CreateCategoryDialog.vue:89`

## Symptôme

L'utilisateur crée un `ProductType`/`ProductCategory` avec un nom déjà existant → il voit une
erreur générique ("Une erreur est survenue."), sans savoir que la cause est un doublon. Le même
scénario sur `CreatePackingTypeDialog` affiche correctement un message clair
(`A packing type "X" already exists`).

## Cause racine

Côté backend, `createProductType()`/`createProductCategory()` (`menu-items.service.ts`) appellent
`prisma.productType.create`/`prisma.productCategory.create` **sans try/catch sur `P2002`**
(contrainte `@@unique([tenantId, name])`/`@@unique([tenantId, typeId, name])`, `schema.prisma`) —
l'exception Prisma brute remonte en 500. À comparer avec `packing-types.service.ts` qui catch
`P2002` et lève un `BadRequestException` explicite (400). Côté front, le fallback générique
`e?.response?.data?.message || e?.message || 'Une erreur est survenue.'` s'affiche faute de message
NestJS structuré pour une 500 brute.

## Correction

Backend : `createProductType`/`createProductCategory` catchent désormais `P2002` et lèvent un
`BadRequestException` avec un message explicite ("Un type/une catégorie nommé(e) « X » existe
déjà"), sur le même modèle que `packing-types.service.ts`. Aucun changement front nécessaire — le
fallback existant affiche déjà correctement `e?.response?.data?.message` une fois le backend
structuré.

## Risque de régression / à surveiller

Vérifier que la création avec un nom réellement nouveau continue de fonctionner normalement
(non-régression du chemin nominal), et que le message d'erreur reste correctement traduit/affiché
dans les deux dialogs.

## Références

- `backend/src/features/packing-types/packing-types.service.ts` (pattern de référence).
