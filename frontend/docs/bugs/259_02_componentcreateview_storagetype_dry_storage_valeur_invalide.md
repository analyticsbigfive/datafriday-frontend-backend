# BUG-259-02 — Storage Type "Dry Storage" (≠ "Dry" attendu par Prisma) : sauvegarde Component en échec systématique sur ce choix, sibling de BUG-005

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Menu & recettes (Component Library)
- **Repo(s) concerné(s)** : `datafriday-web` + `api-datafriday-staging` (migration de schéma)
- **Découvert le** : 2026-07-30, en investiguant le chantier "Storage Type CRUD dans
  Configurations" (rendre `StorageType` — alors enum Postgres figé `Cold`/`Dry`/`Frozen` — éditable
  par tenant). Trouvé en traçant le chemin complet du champ Storage Type du formulaire Component
  jusqu'à l'écriture Prisma, avant tout changement de code.
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue:480`
  (valeur fautive), `:944,1001` (payload envoyé tel quel)

## Symptôme

Sur l'écran de création/édition d'un Component (`/menu-fb/components`), le champ obligatoire
"Storage Type" proposait trois options : `"Dry Storage"`, `"Cold"`, `"Frozen"`. Sélectionner la
première option (`"Dry Storage"`) et enregistrer faisait échouer la sauvegarde côté backend
(erreur de validation d'enum Prisma) — silencieusement pour l'utilisateur au-delà du message
d'erreur générique de la requête, sans lien évident avec le champ en cause.

## Cause racine

`ComponentCreateView.vue:480` codait en dur `storageTypeOptions: ["Dry Storage", "Cold", "Frozen"]`.
Or l'enum Prisma réel (`backend/prisma/schema.prisma`, `enum StorageType { Cold Dry Frozen }`)
n'accepte que `"Dry"`, pas `"Dry Storage"`. Le formulaire envoyait la valeur choisie telle quelle
(`String(this.form.storageType || "").trim()`, lignes 944/1001) sans transformation — donc tout
Component créé/édité avec "Dry Storage" échouait systématiquement à l'écriture Prisma.

Même famille de bug que **BUG-005** ("Freezer" vs "Frozen" invalide sur `MenuItemCreateView.vue`,
un champ voisin du même écran Component/Menu Item) : une liste de libellés d'affichage codée en
dur, jamais confrontée au contrat réel du enum backend au moment où elle a été écrite ou
modifiée.

## Correction

Corrigé dans le cadre du chantier plus large "Storage Type devient un référentiel CRUD-éditable"
(remplace l'enum Postgres figé par une table `StorageType` par tenant, cf. plan
`greedy-mixing-sphinx.md` et `backend/src/features/storage-types/`). `storageTypeOptions` n'est
plus une liste statique : c'est désormais un computed qui lit `storageTypes/storageTypes`
(store Vuex, alimenté par `GET /storage-types`) — les 3 valeurs historiques sont seedées avec les
noms exacts `"Dry"`/`"Cold"`/`"Frozen"` (`backend/scripts/backfill-storage-types.ts`), donc le bug
de libellé ne peut plus se reproduire par construction (le formulaire ne peut plus proposer une
valeur qui ne correspond à aucune ligne du référentiel).

## Risque de régression / à surveiller

- Non exécuté en navigateur (pas de `pnpm dev` dans cette session) — à confirmer : créer un
  Component avec Storage Type "Dry" depuis `/menu-fb/components`, vérifier que la sauvegarde
  réussit désormais.
- Migration Prisma (`storageType` enum → `String` sur 7 colonnes) vérifiée directement en base
  réelle (préservation des valeurs existantes confirmée par requête), tests
  `storage-types.service.spec.ts` verts (7 cas), vérification end-to-end Prisma directe (create/
  rename-cascade/delete-bloqué) faite dans la même session.
- `getStorageTypeForCategory()` (`ComponentCreateView.vue:~638`, heuristique de valeur par défaut
  selon la catégorie d'ingrédient) retourne toujours exactement `"Dry"`/`"Cold"`/`"Frozen"` —
  compatible sans changement avec le nouveau référentiel.

## Références

- [BUG-05](05_freezer_vs_frozen_valeur_invalide.md) — même famille de bug (libellé figé ≠ valeur
  enum réelle), sur le champ Storage Type voisin de `MenuItemCreateView.vue`.
- Plan `Storage Type CRUD — Étape 1 à N` (session du 2026-07-30/31, chantier taxonomie unifiée
  CFG-2) — contexte complet de la migration qui a corrigé ce bug en même temps.
