# BUG-257-02 — MenuItem : import CSV du format "Recipe" packé historique inutilisable + composition combo absente du schéma

- **Statut** : 🟡 Corrigé non testé (vérifié par script contre la vraie base de dev, tenant "test" ;
  jamais exercé via le drawer réel dans un navigateur)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web` (le backend `api-datafriday-staging` est le même repo
  ici, dossier `backend/`)
- **Découvert le** : 2026-07-30
- **Fichiers** :
  `frontend/src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue` (étendu,
  pas recréé), `backend/prisma/schema.prisma` (nouveau modèle `MenuItemCombo`),
  `backend/src/features/menu-items/menu-items.service.ts`/`.controller.ts`/`dto/create-menu-item.dto.ts`,
  `frontend/src/api/endpoints/menu-item.api.js`.

## Symptôme

L'utilisateur dispose d'un jeu de données historique
(`frontend/docs/example/menu-items-2026-07-30.csv`, 543 lignes, 542 MenuItem réels) qu'il ne
pouvait pas importer correctement. `MenuItemCsvImportDrawer.vue` existait déjà (BUG-108) et gérait
déjà un format `Recipe` packé legacy (`parseRecipe()`), mais qui résolvait les références par **ID
brut** — jamais un id valide dans ce compte, puisque ce sont des ids d'un système précédent (même
famille que le chantier Components, BUG-256-02). De plus, deux lignes du fichier réel composent un
article "Combo"/catégorie "Menu" à partir d'**autres MenuItem vendables** (ex. "Burger + Frites" =
"Burger" + "Frites") — un besoin que le schéma ne modélisait pas du tout (`MenuItem` n'avait aucune
relation vers lui-même).

Retour terrain sur le chantier Components (25 lignes) : l'import était perçu comme "trop lent" —
~75-100 requêtes HTTP séquentielles pour 25 lignes. Ce chantier (543 lignes) devait éviter le même
écueil dès la conception.

## Cause racine

Fonctionnalité existante mais incomplète (pas une régression) :

1. `parseRecipe()` (`MenuItemCsvImportDrawer.vue:606-629` avant fix) retournait directement l'ID
   brut du CSV comme `ingredientId`/`componentId`/`packagingId` — jamais résolu par nom, contraire-
   ment au nouveau format multi-lignes (BUG-108) qui, lui, résout déjà par nom via
   `ingredientNameToId`/`componentNameToId`/`packagingNameToId`.
2. `MenuItem` n'a aucune relation vers lui-même (confirmé : `components[]` ne pointe que vers
   `MenuComponent`, jamais vers un autre `MenuItem` — `schema.prisma`, modèle `MenuItem` avant
   fix). Les segments `Combo Item` du CSV (et un cas de `Component`, confirmé sur le fichier réel :
   `1762335941891,COMBO Smash frite,...,Combo,Menu,...` référence
   `1762336132417`, le "Menu Item ID" de la ligne "Frites (Aix)" du même fichier) n'avaient nulle
   part où être stockés.
3. L'import individuel (`for (const item of withRecipe) { await createMenuItem(item) }`,
   strictement séquentiel, aucune concurrence, aucun retry sur 429) n'était pas conçu pour un
   volume de plusieurs centaines de lignes — comportement déjà éprouvé insuffisant sur l'import CSV
   événements avant son propre correctif (BUG-252, palier "medium" du rate-limiter, 300 req/60s).

## Correction

### Nouvelle relation `MenuItem` ↔ `MenuItem` (composition combo)

Décision produit validée avec l'utilisateur (option "corriger durablement" plutôt que "ignorer",
malgré le faible volume concerné — 2 lignes sur 543) : nouveau modèle `MenuItemCombo`, calqué sur
`ComponentComponent` (seule autre auto-relation à table de jonction du schéma) :
```prisma
model MenuItemCombo {
  id       String   @id @default(cuid())
  parentId String
  childId  String
  quantity Float
  unit     String?
  cost     Decimal? @db.Decimal(10, 4)
  parent MenuItem @relation("ComboParentToChild", fields: [parentId], references: [id], onDelete: Cascade)
  child  MenuItem @relation("ComboChildToParent", fields: [childId], references: [id], onDelete: Cascade)
  @@unique([parentId, childId])
}
```
- Backend, même moule exact que `replaceComponents`/`replaceIngredients`/`replacePackagings` :
  `MenuItemsService.replaceComboItems()` (delete-then-create nesté), `create()`/`update()`
  acceptent `comboItems` inline, route `PUT /menu-items/:id/combo-items`.
- **Coût récursif avec garde anti-cycle** — `MenuItemsService.refreshCosts()` (existant) est plat,
  sans récursion, contrairement à `MenuComponentsService.computeComponentUnitCost()`. Nouvelle
  méthode privée `computeMenuItemComboCost()` par analogie (pile de `parentId` traversés,
  `BadRequestException` explicite si cycle). **Point de conception important, corrigé pendant la
  vérification** : la première version lisait `item.totalCost` déjà persisté comme point de départ
  du calcul — faisait doubler la contribution combo à chaque recalcul successif, puisque
  `totalCost` est justement le champ que ce calcul réécrit. Version corrigée : toujours recalculé
  ligne par ligne depuis `components`/`ingredients`/`packagings` (sans état, jamais de relecture
  d'un total déjà combo-inclusive).
- **Limite assumée** : `refreshCosts()` global (route `/menu-items/refresh-costs`, et les 3 autres
  routes `PUT :id/xxx` existantes) ne recalcule PAS la contribution combo — seul un appel explicite
  à `replaceComboItems()`/`create()`/`update()` avec `comboItems` la met à jour. Même famille de
  limite que le bug déjà documenté sur `MenuComponent.unitCost` (non divisé par
  `numberOfUnitsRecipe`), assumée pour ce chantier.
- Wrapper frontend `replaceMenuItemComboItems()` (`menu-item.api.js`) — attention, body **enveloppé**
  `{ comboItems }` (le DTO l'exige), à ne pas confondre avec `replaceMenuItemIngredients()` du même
  fichier qui envoie le tableau brut (convention divergente déjà présente avant ce chantier, non
  touchée).

### Résolution par nom (remplace le passage en ID brut)

`parseRecipe()` retourne désormais des refs **brutes** uniquement (`{ ingredientRefs, packagingRefs,
comboRefs }`, jamais résolues — fonction pure sans accès aux lookups par nom du composant).
Nouvelle méthode `resolveLegacyRecipe(row)` qui les résout, priorité identique au chantier
Components : (a) id réel déjà existant dans ce tenant, (b) fichier compagnon, (c) non résolu (ligne
ignorée, l'article est quand même créé/mis à jour).
- `Ingredient`/`Packaging` → fichier compagnon **Market Prices** (même technique que Components :
  ancien Market Price ID → Item Name → `ingredientNameToId`/`packagingNameToId`, déjà présents
  depuis BUG-108).
- `Component` **et** `Combo Item` → même cascade : d'abord fichier compagnon **Components**
  (`components-2026-07-30.csv` — confirmé sur le fichier réel : 46 des 47 refs `Component`
  correspondent exactement à des `Component ID` de ce fichier) via `componentNameToId` ; si non
  résolu, **déféré à une passe 2** (`_pendingComboRefs`, jamais envoyé au backend tel quel, retiré
  du payload avant l'appel API) — auto-référence vers une autre ligne de **ce même fichier**
  (`csvIdToName`, construite depuis toutes les lignes) ou vers un `MenuItem` déjà existant dans ce
  tenant (`menuItemNameToId`).
- **Bug trouvé et corrigé pendant la vérification** : la passe 2 ne retrouvait un item auto-
  référencé que s'il avait été créé via le chemin individuel (`withRecipe`, indexé au fil de
  l'import dans `nameToRealId`) — un item **sans aucune recette propre** (ex. "Frites" simple,
  passant par le lot `bulkCreateMenuItems`) n'y était jamais indexé. Corrigé : le lot bulk est
  maintenant aussi indexé dans `nameToRealId`, via `res.items` (réponse positionnelle déjà
  renvoyée par `bulkCreate()`, jusque-là ignorée par le frontend).
- **Collision corrigée** : l'alias legacy `'display name' → name` (pensé pour un export où
  "Display Name" est le seul nom de l'article) entre en conflit avec ce fichier historique où
  `Name` et `Display Name` sont deux colonnes réellement distinctes. Non touché globalement (risque
  de régression sur d'autres imports) — une colonne "Display Name" non consommée par l'alias
  historique (parce que "Name" a déjà capté le field `name`) est désormais mappée vers
  `displayNameRef` (champ déjà existant depuis BUG-107).
- `HEADER_MAP`/`MENU_ITEM_FIELDS` étendus : `Menu Item ID` (nouveau field `csvId`, clé de
  l'auto-référence), alias `'number of pieces'` bare (seul `'number of pieces (recipe)'` existait),
  `Packaging Type`/`Number of units` → `inventoryPackagingType`/`inventoryNumberOfUnits` (champs
  déjà existants sur `MenuItem`, quasi vides sur ce fichier — mappage par cohérence).
- **Colonnes ignorées** (décision validée) : `Is this a Promotion`, `Discounted Product`,
  `Promotion Type` — 33 lignes sur 543 référencent un autre article par son nom pour une remise,
  sans aucun champ MenuItem pour stocker ce lien (`discountType`/`discountValue` sont des remises
  scalaires sur l'item lui-même, pas une référence à un autre article). Jugé purement descriptif,
  aucun écran actuel n'exploite une telle relation.

### Performance — concurrence bornée + retry 429 (remplace la boucle séquentielle)

Reproduit fidèlement le pattern déjà éprouvé de `CsvImportDrawer.vue` (événements, BUG-252) :
`IMPORT_CONCURRENCY = 5` (même valeur que tous les usages de concurrence bornée de ce repo, jamais
plus de 6), `createMenuItemWithRateLimitRetry()`/`replaceComboItemsWithRateLimitRetry()` (retry
sur 429 uniquement, lit le vrai `Retry-After`, plafond 90s, jusqu'à 5 tentatives). La boucle
`withRecipe` (1 appel/item, recette incluse dans le body — inchangé, c'est déjà l'endpoint single
qui gère `ingredients`/`components`/`packagings`) et la passe 2 (`replaceComboItems`) tournent
désormais par lots de 5 en parallèle au lieu d'un `await` par ligne. Barre de progression réelle
ajoutée à l'écran Résultat (`importProgress`/`importTotal`), absente avant ce chantier (seul un
spinner indéterminé s'affichait pendant tout l'import).

## Risque de régression / à surveiller

- **Non vérifié dans le navigateur.** La logique métier (parsing du format packé legacy,
  résolution en cascade via 2 fichiers compagnons, passe 2 combo indépendante de l'ordre des
  lignes, nouvelle relation `MenuItemCombo` avec garde anti-cycle) a été vérifiée par 2 scripts
  Node (`ts-node -r tsconfig-paths/register` — `tsx` échoue sur un import circulaire
  `RedisModule`/`RedisService` au boot complet de `AppModule`, cf. bug Components) exécutant
  directement `MenuItemsService` contre la vraie base de dev (tenant "test", vide avant/après,
  nettoyage vérifié indépendamment) : (1) relation combo isolée — composition persistée, coût
  recalculé récursivement, remplacement sans doublon, cycle A→B→A rejeté explicitement ; (2) import
  CSV bout en bout sur un sous-ensemble représentatif (3 items, dont un sans recette propre passant
  par le lot bulk) — ingrédient et composant résolus via les fichiers compagnons, composition combo
  résolue en passe 2 y compris vers l'item bulk-créé. **Mais** le drawer Vue réel
  (upload/mapping/aperçu/résultats, y compris les 2 fichiers compagnons) et les vrais appels HTTP
  n'ont jamais été exercés.
- Le fichier réel `frontend/docs/example/menu-items-2026-07-30.csv` (543 lignes) n'a été testé qu'à
  l'échelle d'un sous-ensemble synthétique de 3 lignes reproduisant les cas structurants — le
  passage à l'échelle réelle (durée totale, comportement du rate-limiter sur un vrai run) n'a pas
  été mesuré.
- Au moins une référence du fichier réel (`mi-1761530805198`, ligne "COMBO Smash frite") ne
  correspond à aucun Menu Item ID de ce fichier ni à aucun MenuItem probable de ce tenant —
  restera non résolue par best-effort (comportement assumé, probablement un item d'un autre export
  historique non fourni).
- `refreshCosts()` global (bulk/refresh-costs, et les 3 autres routes `PUT :id/xxx` existantes) ne
  recalcule PAS la contribution combo — limite connue, voir section Correction.
- La collision d'alias `Name`/`Display Name` n'a été corrigée QUE pour le cas où les deux colonnes
  coexistent dans le même fichier — un fichier avec UNIQUEMENT une colonne "Display Name" (sans
  "Name") continue de la mapper vers `name`, comportement historique inchangé intentionnellement.

## Références

- [[256_02_components_csv_import_export_recette]] — chantier frère (même famille de format packé,
  même technique de fichier compagnon, source du fichier compagnon Components utilisé ici).
- [[108_menu_items_csv_reimport_format_multi_lignes]] — le format multi-lignes qui avait remplacé
  ce même format `Recipe` packé pour les usages courants ; ce chantier réintroduit une résolution
  par nom pour CE format legacy spécifiquement pour la reprise du fichier historique, sans
  redevenir le chemin recommandé pour un usage normal.
- [[252_02_csvimportdrawer_rate_limit_429_import_masse_echec_definitif]] — source du pattern
  concurrence bornée + retry 429 repris ici.
