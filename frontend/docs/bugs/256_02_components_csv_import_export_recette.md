# BUG-256-02 — Components : aucun import CSV (export plat seulement) — ajout import/export packé avec recette

- **Statut** : 🟡 Corrigé non testé (vérifié par script contre la vraie base de dev, tenant "test" ;
  jamais exercé via le drawer réel dans un navigateur)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web` (le backend `api-datafriday-staging` est le même repo
  ici, dossier `backend/`)
- **Découvert le** : 2026-07-30
- **Fichiers** :
  `frontend/src/components/menu-fb/views/component-library/drawers/ComponentCsvImportDrawer.vue`
  (nouveau), `frontend/src/components/menu-fb/views/component-library/views/componentListView.vue`
  (export packé + bouton import ajoutés, export plat existant inchangé),
  `frontend/src/api/endpoints/menu.api.js` (2 nouveaux wrappers), `backend/prisma/schema.prisma`
  (`MenuComponent.numberOfUnitsRecipe`), `backend/src/features/menu-components/dto/create-menu-component.dto.ts`.

## Symptôme

L'utilisateur dispose d'un jeu de données historique (`frontend/docs/example/components-2026-07-30.csv`,
25 composants réels — sauces, garnitures — avec leur recette complète) qu'il ne pouvait pas
importer : aucun import CSV Component n'existait (contrairement à Market Prices et MenuItem).
Seul un export "plat" basique existait (`componentListView.vue`, 8 colonnes, aucune recette —
`ingredients[]`/`children[]` jamais exportés).

## Cause racine

Fonctionnalité jamais implémentée — pas une régression. Deux obstacles supplémentaires,
découverts sur le fichier réel complet (pas visibles sur un extrait de 2 lignes) :

1. La colonne `Recipe` du CSV référence des ingrédients par un ancien id du système précédent
   (ex. `1767711693533-ada68o82u`). Confirmé en les retrouvant tels quels dans
   `frontend/docs/example/market-prices-2026-07-29.csv` : ce sont d'anciens **Market Price ID**
   (sous-enregistrements fournisseurs), pas des ids d'`Ingredient`. Le chantier Market Prices
   (BUG-254-02) ne conserve nulle part le mapping ancien-id → nouveau-id (id ignoré à l'import,
   nouveau `cuid()` généré) — impossible de résoudre ces références par id seul.
2. `MenuComponent.numberOfUnitsRecipe` est `Int` en base (`schema.prisma:1861`, avant fix) +
   `@IsInt()` côté DTO (`create-menu-component.dto.ts:288-292`, avant fix), mais 10 des 25 lignes
   réelles (40%) ont un rendement de recette fractionnaire (0.750, 2.500, 0.800, 2.400, 1.500) —
   rejeté tel quel par la validation. Le frontend affichait déjà ce champ en flottant
   (`.toFixed(3)`, `ComponentBuilderPanel.vue:897`) : le typage `Int` était une erreur de
   modélisation antérieure, pas une contrainte métier volontaire.

## Correction

### Migration `numberOfUnitsRecipe` Int → Float

- `schema.prisma:1861` : `Int?` → `Float?` (cohérent avec `packedUnits Float?` du même modèle).
  Migration appliquée directement contre la base de dev via `prisma db execute` +
  `prisma migrate resolve --applied` plutôt que `prisma migrate dev`/`deploy` : une migration
  pré-existante non liée (`20260730180000_storage_type_referential`, travail en cours d'un
  collègue, présente dans le repo mais pas encore appliquée) aurait été déclenchée en même temps
  par un `migrate dev`/`deploy` classique — évité pour ne pas toucher à un chantier tiers non
  demandé. Migration isolée : `prisma/migrations/20260730190000_menu_component_number_of_units_recipe_float/`.
- `create-menu-component.dto.ts` : `@IsInt()` → `@IsNumber()` sur `numberOfUnitsRecipe`
  (`UpdateMenuComponentDto` hérite via `PartialType`, aucun changement séparé).
- Polish cohérent : `ComponentCreateView.vue` — `step="1"`/`min="1"` → `step="0.001"`/`min="0.001"`
  sur le champ de saisie manuelle (le champ accepte réellement des décimales maintenant).

### Import/export CSV — nouveau format packé, coexiste avec l'export plat existant

- **Format cible** (confirmé sur le fichier réel complet, 25 lignes) :
  `Component ID,Component Name,Category,Component Type,Unit,Number of Units per Recipe,Packaging Type,Number of units,Storage Type,Description,Recipe`.
  Mapping : `Category` (valeur parente, ex. "Food") → `category` (texte) **+** `componentTypeId`
  (résolu/auto-créé) ; `Component Type` (valeur enfant, ex. "Veg"/"Sauce") → `componentCategory`
  (texte) **+** `componentCategoryId` (résolu/auto-créé sous ce Type) — inversion volontaire vs.
  le nom littéral des colonnes CSV, la hiérarchie Food→Veg/Sauce prime.
- **Format packé de `Recipe`** (confirmé sur fichier complet — un détail invisible sur 2 lignes) :
  segments séparés par `|`, chaque segment séparé par `>`. Un ingrédient a un slot vide
  supplémentaire (`localId>Ingredient>>refId>quantity`, 5 parties), un sous-composant n'en a pas
  (`localId>Component>refId>quantity`, 4 parties) — logique identique à l'ancien `parseRecipe()`
  de `MenuItemCsvImportDrawer.vue:606-629`, dupliquée/adaptée ici.
- **Résolution `Ingredient`** (référence = ancien Market Price ID) : (a) si `refId` correspond à
  un `Ingredient.id` réel du tenant → utilisé directement (round-trip après un export packé de
  cette base) ; (b) sinon, si un **fichier compagnon Market Prices** est fourni (nouveau champ
  optionnel du drawer, aucun précédent de "2e fichier" dans ce domaine), résolution
  ancien-id → `Item Name` (parsing du compagnon) → `Ingredient` par nom (`marketPriceIngredients/rows`,
  même pattern que `MenuItemCsvImportDrawer.vue`) ; (c) sinon → ligne ignorée (composant quand
  même créé), listée dans un bandeau d'avertissement. Jamais d'auto-création d'`Ingredient` depuis
  cet import (réservé au flux Market Prices `syncIngredients()`).
- **Résolution `Component`** (sous-composant) : toujours une auto-référence à l'intérieur du même
  CSV via la colonne `Component ID` d'une autre ligne — confirmé sur le fichier réel (ligne 8
  "Pickles (Auxerre)" référence `comp-1761518359520`, qui est le `Component ID` de la ligne 25
  "Jus Pickle (Aux)", définie **plus loin** dans le fichier). Résolu en **2 passes** : passe 1 crée/
  met à jour tous les composants (obtenant leur id réel) et fixe les lignes d'ingrédients, passe 2
  résout ensuite les sous-composants une fois tous les ids réels connus — indépendant de l'ordre
  des lignes dans le fichier.
- **Upsert** : `Component ID` CSV correspond à un cuid réel du tenant → mise à jour ; sinon un
  composant de même nom existe déjà → mise à jour (évite les doublons sur réimport du même
  fichier legacy) ; sinon → création. `ComponentType`/`ComponentCategory` résolus par nom exact et
  auto-créés si absents (mise en cache par nom pendant l'import pour éviter les doublons quand
  plusieurs lignes partagent la même Category/Component Type) — **sans** l'étape de résolution
  interactive façon Levenshtein de Market Prices (jugée disproportionnée ici : 2 champs de
  taxonomie contre 4 chez Market Prices, résolution exacte + auto-création jugée suffisante).
- **Export packé** (`onExportCsvPacked()`, nouveau, coexiste avec `onExportCsv()` existant
  inchangé) : réutilise `componentsList` déjà chargé avec `ingredients[]`/`children[]` imbriqués
  (confirmé : le backend les inclut déjà via `includeRelations`, aucun appel N+1 nécessaire) pour
  produire le format packé avec les **vrais cuids** de cette base — permet un cycle
  export → édition → réimport en upsert **sans** fichier compagnon.
- 2 nouveaux endpoints frontend (`replaceComponentIngredients`/`replaceComponentChildren` dans
  `menu.api.js`) — les routes backend `PUT /menu-components/:id/ingredients`/`/children`
  existaient déjà mais n'avaient aucun wrapper côté client.
- i18n : le drawer utilise un objet `translations` auto-contenu au composant (pattern
  `MarketPriceCsvImportDrawer.vue`), **pas** le fichier global `translations.js` — confirmé en
  clair que ce fichier est un namespace plat où des clés génériques comme `close`/`back`/`row`/
  `stepFile` sont déjà utilisées ailleurs (au moins 2 fois chacune avant cet ajout) ; les y
  ajouter aurait créé des collisions silencieuses (dernière définition gagne). Seules
  `compListImportCsv`/`compListExportCsvPacked` (boutons de `componentListView.vue`, déjà dans le
  pattern `compList*` existant) sont dans le fichier global.

## Risque de régression / à surveiller

- **Non vérifié dans le navigateur.** La logique métier (parsing du format packé, résolution
  Ingredient via fichier compagnon, résolution Component en 2 passes indépendante de l'ordre,
  upsert par id/nom, cache de taxonomie) a été vérifiée par un script Node (`ts-node`, `tsx`
  échoue sur un import circulaire de `RedisModule`/`RedisService` au boot complet de l'app — à
  garder en tête pour de futurs scripts de ce type) exécutant directement les vrais services
  NestJS (`MenuComponentsService`, `ComponentTaxonomyService`) contre la vraie base de dev
  (tenant "test", vide avant/après — nettoyage vérifié indépendamment après coup) : 2 passes
  (import initial de 4 composants avec un cas de recette fractionnaire + une auto-référence vers
  une ligne définie plus loin dans le fichier, puis réimport identique → upsert par nom sans
  doublon), ~15 assertions, toutes passées. **Mais** le drawer Vue réel (upload/mapping/résultats,
  y compris le fichier compagnon) et les appels HTTP réels via `menu.api.js` n'ont jamais été
  exercés — à valider en navigateur avant de considérer ceci réellement "corrigé".
- Le fichier réel `frontend/docs/example/components-2026-07-30.csv` (25 composants) n'a été testé
  qu'à l'échelle d'un sous-ensemble synthétique de 4 lignes reproduisant les cas structurants
  (fractionnaire, auto-référence avant/arrière, taxonomie partagée) — le passage à l'échelle réelle
  n'a pas été mesuré.
- Au moins une référence du fichier réel (`mp-1761526392482-1`, lignes 8 et 25) est dans un format
  différent (préfixe `mp-`) qui ne correspond à aucun `Market Price ID` du fichier compagnon —
  restera non résolue par best-effort (comportement assumé, pas un bug).
- Migration `numberOfUnitsRecipe` : vérifier qu'aucune requête Prisma ailleurs dans le code ne
  filtre/agrège sur ce champ en s'appuyant sur un typage entier strict (recherche effectuée au
  moment du fix, rien trouvé — mais à revérifier si un comportement inattendu apparaît).
- Migration appliquée hors du flux `prisma migrate dev`/`deploy` standard (shadow DB cassée par une
  migration historique non liée à ce chantier, `20260704160000_menu_assignment_config_scope`,
  `ExternalMerch` inexistante) — la base de dev a maintenant une entrée `_prisma_migrations`
  supplémentaire créée par contournement manuel (`db execute` + `migrate resolve --applied`) ; à
  garder en tête si quelqu'un relance `migrate dev` plus tard et voit un historique inhabituel.

## Références

- [`docs/modules/04_MENU_CATALOGUE.md`](../modules/04_MENU_CATALOGUE.md#menucomponent--la-sous-recette)
  — section "MenuComponent — la sous-recette" (mention de la migration `numberOfUnitsRecipe`) et
  nouvelle sous-section "Import/Export CSV".
- [[254_02_market_prices_csv_format_packe_par_article_import_export]] — chantier frère (même
  famille de format packé, même esprit d'upsert et de coexistence des formats), source du fichier
  compagnon utilisé ici pour résoudre les anciens ids d'ingrédients.
- [[108_menu_items_csv_reimport_format_multi_lignes]] — explique pourquoi l'ancien format `Recipe`
  packé de MenuItem (résolution par id interne brut) a été jugé insuffisant et remplacé par un
  format multi-lignes résolu par nom ; le format packé Components réutilise volontairement la
  même syntaxe `localId>Type>>refId>quantity` (le format n'était pas le problème — l'absence de
  toute résolution par nom pour les ids d'un autre système l'était), avec la résolution par nom
  ajoutée ici via le fichier compagnon.
