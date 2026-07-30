# BUG-255 — Création HR Supplier : 400 « property departments should not exist » (backend Render obsolète)

- **Statut** : ⚪ Diagnostiqué (aucun code à corriger — problème de déploiement)
- **Sévérité** : 🟠 Majeur (création de fournisseur RH impossible en prod)
- **Domaine** : RH / Staffing — Suppliers
- **Repo(s) concerné(s)** : déploiement `datafriday-api` (Render) — le code des deux repos est correct
- **Découvert le** : 2026-07-30
- **Fichiers** :
  - `frontend/.env.local` (`VUE_APP_API_URL=https://datafriday-api.onrender.com/api/v1`)
  - `backend/src/features/hr/hr-suppliers.controller.ts:33` (DTO — a bien `departments`)
  - `backend/prisma/schema.prisma:610` (`HrSupplier.departments String[]`)
  - `backend/src/main.ts:87` (`forbidNonWhitelisted: true`)

## Symptôme

`POST /api/v1/hr/suppliers` renvoie :
```json
{ "statusCode": 400, "message": "property departments should not exist",
  "error": "BadRequestException", "errors": ["property departments should not exist"] }
```
Le front envoie `departments: string[]` (renommage RH-5 du 2026-07-30, ex-`sectors`) via
[`hr.api.js`](../../src/api/endpoints/hr.api.js) → [`HrSupplierFormDrawer.vue:244`](../../src/components/hr/drawers/HrSupplierFormDrawer.vue).

## Cause racine

**Ce n'est pas un bug de code.** Le DTO backend accepte déjà `departments`
(`hr-suppliers.controller.ts:33`, `@IsOptional @IsArray @IsString({each:true})`) et le modèle
Prisma porte `departments String[]` (`schema.prisma:610`, commit `4983d60`, déjà mergé).

Le front pointe sur le **backend distant Render** (`.env.local` → `datafriday-api.onrender.com`),
qui fait tourner une **version antérieure** du backend (DTO encore sur l'ex-`sectors`, sans
`departments`). Avec `forbidNonWhitelisted: true` (`main.ts:87`), toute propriété inconnue est
rejetée → 400. **Même cause que les endpoints Live en 404** : code présent dans `develop`, mais
Render pas redéployé.

## Correction

Aucune modification de code. Côté **ops / lead (Ulrich)** :

1. **Redéployer le backend** sur Render avec le code courant (contient `departments`).
2. **Appliquer la migration Prisma** sur la BDD Render — table/colonne `HrSupplier.departments`
   (migrations manuelles, [ADR-0002](../adr/0002_migrations_manuelles_jamais_plateforme.md)) :
   `pnpm prisma:migrate:deploy` avec le `DIRECT_URL` (port 5432) ciblant Render.

**Contournement pour tester en local** : pointer `VUE_APP_API_URL` sur un backend local lancé sur
le code courant (+ migrer la BDD locale), puis redémarrer le dev server.

## Risque de régression / à surveiller

- Vérifier que la migration a bien créé **toute la chaîne HR** (`HrSupplier`, `HrRole`,
  `EventStaffLine`, sinking rules…) sur Render, pas seulement la colonne `departments` — l'erreur
  DTO masque le fait qu'on ne sait pas encore si les **tables** existent côté Render.
- Après redéploiement : re-tester création/édition/suppression d'un supplier + import CSV.
- Généraliser : tout écart front/back sur le RH backend (nouveau depuis le merge) pointera
  probablement le même retard de déploiement tant que Render n'est pas synchronisé sur `develop`.

## Références

- Module : [`modules/11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md)
- Même classe de problème : endpoints Live 404 (Render non déployé) — [`modules/11_LIVE.md`](../modules/11_LIVE.md).
