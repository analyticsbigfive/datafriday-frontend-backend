# BUG-294-01 — Feuille de course : faux « Sans fournisseur (ingrédients manquants) » (429 sur fan-out recettes, cache empoisonné)

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant/impact business (feuille de course fausse : articles à recette complète présentés comme inachetables)
- **Domaine** : Stock (Restock / feuille de course, mode ingrédients)
- **Repo(s) concerné(s)** : les deux (frontend : chargement recettes ; backend : permission du batch)
- **Découvert le** : 2026-08-04
- **Fichiers** :
  - `src/views/SpaceRestockView.vue:3220-3287` (`ensureRecipesLoaded`)
  - `src/api/client.js:185-193` (retry 429 unique, borné 5 s)
  - `src/utils/bomPlanning.js:141-149` (fallback `itemType: 'MenuItem'`) et `:3301` de la vue (groupe `__finished__`)
  - `backend/src/features/menu-items/menu-items.controller.ts` (`POST /menu-items/recipes`)

## Symptôme

Étape « Feuille de course » en mode ingrédients : 7 articles à recette complète en base
(Burger 25/26 (Aux) — 7 lignes ingrédients/composants/packaging —, Frites, Haribo, Sandwichs,
Tenders…) classés dans le groupe « Sans fournisseur (ingrédients manquants) », comme s'ils
n'avaient aucune recette. Console : rafale de `GET /menu-items/:id` → `429 Too Many Requests` +
`[restock] recette détail échouée: <id> Request failed with status code 429`. Regénérer ne corrige
rien (voir cache empoisonné ci-dessous).

## Cause racine

Chaîne à 5 maillons, tous vérifiés :

1. `ensureRecipesLoaded()` (`SpaceRestockView.vue:3269`) faisait
   `Promise.all(missing.map(getMenuItemById))` — fan-out **non borné** (~40+ GET simultanés) →
   `TenantThrottlerGuard` backend répond 429 sur une partie des requêtes.
2. `client.js:185-193` ne retente un 429 qu'**une** fois et seulement si `Retry-After ≤ 5 s` →
   beaucoup d'échecs résiduels.
3. Chaque échec était caché comme `{ numberOfPiecesRecipe: 1, lines: [] }` dans
   `recipeByMenuItemId` (**cache empoisonné**) ; le filtre `missing = ids.filter(id =>
   !recipeByMenuItemId[id])` ne refetche jamais un id présent → l'état faux persiste pour toute la
   session.
4. Recette `lines` vide → filet de sécurité BOM `addLeaf({ …, itemType: 'MenuItem' })`
   (`bomPlanning.js:141-149`) : l'article devient sa propre ligne d'achat « produit fini ».
5. `resolveIngredientSupplier` : `itemType === 'MenuItem'` → groupe `__finished__` = « Sans
   fournisseur (ingrédients manquants) ». Le libellé accuse la donnée (« ingrédients manquants »)
   alors que c'est le **transport** qui a échoué.

## Correction

100 % dans le lot `fix/bug-290-01-eventpredict-config-stockup` :

- **Un appel batch au lieu de N** : `POST /menu-items/recipes` (endpoint existant, wrapper
  frontend `getMenuItemRecipes` écrit mais **jamais consommé** jusqu'ici) charge toutes les
  recettes en 1 requête. Adaptateur `normalizeRecipeFromBatch` (`bomPlanning.js`) : le DTO batch
  est déjà aplati mais son `components[].id` est l'id de la **ligne de jointure** — la clé
  d'agrégation reste `sourceId` (entité liée), sinon deux plats partageant un ingrédient ne
  s'agrègent plus. `suppliers[]` du batch fusionnés dans `bomSuppliers` (dédupe par id).
- **Anti-poison** : un échec réseau n'écrit plus jamais de recette vide. Seul un id demandé mais
  absent de la réponse batch (item supprimé / hors tenant) est caché `{ lines: [] }` — vraie
  absence de recette, flux « produit fini » légitime.
- **Repli borné** : si le batch échoue (500, timeout…), fallback détail per-id via
  `runWithConcurrency(ids, 4, …)` (sous le seuil du throttler) ; les ids en échec restent absents
  du cache (retentés au prochain « Générer ») + snackbar warning `srSnackRecipesPartial`.
- **Backend** : suppression du `@RequirePermissions('menu.fb.menuItems')` sur `POST
  /menu-items/recipes` — lecture pure (le POST ne sert qu'à porter `ids[]`), mêmes données que
  `GET /menu-items/:id` et `GET /menu-items/:id/recipe` qui n'exigent aucune permission ; sans
  cet alignement un rôle restreint prenait 403 sur la feuille de course.
- Tests : `tests/unit/bomPlanningBatchRecipe.spec.js` (7 cas, dont **parité détail ↔ batch** :
  même recette dans les deux shapes → groupes identiques).

## Risque de régression / à surveiller

- ⚠️ `getMenuItemRecipes([])` = **tous les items du tenant** côté backend — le guard
  `if (!missing.length) return` avant l'appel est indispensable, ne pas le déplacer.
- `refMenuItemId` absent du DTO batch : perte nulle — jamais peuplé non plus côté détail
  (`MenuComponent` sans `menuItemId`/`sourceMenuItemId` au schéma, cf. BUG-292-01) ; l'éclatement
  composant passe par le catalogue hydraté, inchangé.
- `costPerRecipeUnit` dérivé (`cost / numberOfUnits`) pour parité de shape — champ non consommé
  par la feuille de course (`addLeaf` ne le propage pas).
- Retester manuellement : générer la feuille de course mode ingrédients → Network : 1 seul
  `POST /menu-items/recipes`, zéro 429 ; le groupe « Sans fournisseur » ne garde que les vrais
  produits finis ; devtools offline pendant l'appel → snackbar warning puis « Générer » retente.
- Le déploiement doit embarquer **les deux repos** : un frontend nouveau sur un backend ancien
  garde la permission 403 pour les rôles restreints (le repli borné couvre ce cas, mais en N
  requêtes lentes).

## Références

- [292-01](292_01_decomposition_unique_stockup_inventaire_restock_feuille_de_course.md) —
  éclatement composant → ingrédients dans `bomPlanning`, catalogue hydraté, `refMenuItemId`
  jamais peuplé.
- [288-01](288_01_restock_composant_partage_lignes_dupliquees.md) — identité de ligne / agrégation
  par entité (même piège que le join-line id du batch).
- Module : `../modules/06_STOCK_INVENTAIRE.md`.

---

JLH
