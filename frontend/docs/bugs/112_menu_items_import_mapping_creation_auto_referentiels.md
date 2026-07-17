# BUG-112 — Import CSV MenuItem : pas de mapping de colonnes ni de création auto des référentiels manquants

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17 (demandé par l'utilisateur, en référence au comportement déjà
  existant de `MarketPriceCsvImportDrawer.vue`)
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue`

## Symptôme

Contrairement à l'import CSV de `/market-prices`, celui de `/menu-items` :
1. N'offrait aucun moyen de corriger manuellement la correspondance colonne CSV → champ interne
   si l'en-tête du fichier ne matchait aucun alias connu — la reconnaissance des colonnes était
   entièrement automatique et non corrigible.
2. Rejetait toute ligne dont le Type/Catégorie/Marque/Nom d'affichage ne correspondait à rien de
   déjà existant dans le compte cible, au lieu de proposer de créer l'entrée manquante — un import
   entre deux comptes différents (ou un référentiel légèrement différent) échouait donc
   systématiquement sur ces champs.

## Correction

**Écran "Mapping" (nouvelle étape 2, entre File et Preview)** — reproduit le pattern de
`MarketPriceCsvImportDrawer.vue` : un `v-select` par champ interne (Name, Type, Category, Brand,
Display Name Ref, prix, recette, etc.), pré-rempli automatiquement par correspondance d'alias
d'en-tête (`autoMapFields()`, réutilise le dictionnaire `HEADER_MAP` déjà existant) et corrigible
manuellement. Le parsing est désormais scindé en deux temps : `parseCsvRaw()` (en-têtes + lignes
brutes, sans résolution de colonnes) puis un mapping appliqué en aval (`mappedRawRows`/`csvRows`,
computed) — le reste du composant (validation, dédoublonnage, résolution des lignes de recette)
n'a pas eu besoin d'être réécrit, il consomme la même forme de données qu'avant.

**Création automatique des référentiels manquants** — Type, Category, Brand, Display Name
uniquement (voir "Risque" ci-dessous pour les lignes de recette, volontairement exclues) :
- `resolveTypeCategory()` ne rejette plus jamais une ligne pour un Type/Catégorie non résolu —
  c'est désormais une simple information ("sera créé automatiquement"), pas une erreur bloquante.
- `pendingCreations` (computed) détecte, sur l'ensemble des lignes valides, les noms de Type/
  Category/Brand/Display Name absents du compte cible — affiché comme bandeau informatif à
  l'étape Preview (`pendingCreationsCount`).
- `scanAndCreateMissingReferentials()`, appelée en tout début de `runImport()` : crée réellement
  chaque nom manquant (une seule fois par nom pour tout le fichier — Types avant Categories,
  dépendance `typeId`), via `createProductType`/`createProductCategory`/`createBrandName`/
  `createDisplayName`, et met à jour le store correspondant (`add*` action) pour que le reste de
  l'app voie immédiatement la nouvelle entrée sans devoir recharger.
- Le récapitulatif des créations (`autoCreatedSummary`) est affiché à l'étape Résultat.

## Risque de régression / à surveiller

- **Volontairement PAS d'auto-création pour les lignes de recette** (Ingredient/Component/
  Packaging) : ces entités ont un coût/une unité qu'un simple nom de CSV ne permet pas de
  déduire — une auto-création produirait une fiche incomplète (coût à 0). Comportement inchangé
  (`unresolvedRecipeLines`, la ligne de recette est juste signalée, l'article est créé sans elle).
- **Pas de détection "faute de frappe probable"** (contrairement à `MarketPriceCsvImportDrawer`
  qui compare par distance de Levenshtein et demande confirmation si un nom est très proche d'un
  existant) — scope volontairement réduit pour ce lot. Un nom mal orthographié dans le CSV créera
  donc un NOUVEAU Type/Category/Brand/Display Name distinct plutôt que de réutiliser l'existant
  proche. À envisager comme amélioration future si ce cas se présente en pratique.
- Si la création d'un Type échoue (erreur réseau/API), les Category qui en dépendent ne sont pas
  créées non plus (garde explicite `if (!typeId) continue`) — la ligne sera alors créée sans FK,
  pas en échec total.
- Vérifier en navigateur (non fait ici, `pnpm dev` interdit dans cette session) : l'auto-mapping
  initial sur un vrai fichier, la correction manuelle d'un champ, et un import réel créant au
  moins un Type/Category/Brand/Display Name inexistant.

## Références

- `src/components/menu-fb/views/market-prices/drawers/MarketPriceCsvImportDrawer.vue` (pattern
  de référence : `autoMap()`, `columnOptions`, `scanNames()`/`createMissingEntities()`).
- [[110_menu_items_export_placeholder_tiret_casse_reimport]]
- [[108_menu_items_csv_reimport_format_multi_lignes]]
