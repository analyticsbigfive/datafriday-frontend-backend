# BUG-169 — `TaxonomyImportDrawer.vue` : la FK parente (type/catégorie) n'est jamais forcée avant l'import, chaque ligne échoue silencieusement en 400 brut si elle est absente

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (aucune perte de données silencieuse — chaque échec s'affiche dans le
  panneau d'erreurs — mais UX confuse : message technique brut, et rien n'empêche l'utilisateur
  d'arriver à ce résultat)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web` (+ lecture croisée `api-datafriday-staging` pour
  confirmer que la FK est bien obligatoire côté backend)
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/components/events/drawers/TaxonomyImportDrawer.vue` (`entityFields`,
  `canProceed`, `reachableSteps`, `doImport`) ; côté backend, confirmé obligatoire par
  `backend/src/features/events/dto/create-event-category.dto.ts` (`eventTypeId`
  `@IsNotEmpty()`, pas `@IsOptional()`)

## Symptôme

Import CSV de catégories (`entity="category"`) ou de sous-catégories (`entity="subcategory"`) :
rien n'oblige l'utilisateur à mapper la colonne CSV correspondant au type/à la catégorie parente,
ni à résoudre chaque valeur brute vers un id existant à l'étape 3 (mapping des valeurs) :

- `canProceed` (step 2 → step 3/4) ne vérifie que `mapping.name` — jamais `mapping.eventTypeRaw`/
  `mapping.eventCategoryRaw`.
- Si la colonne n'est pas mappée du tout, l'étape 3 (mapping des valeurs) est **entièrement
  sautée** (`reachableSteps`), et le bouton "Importer" apparaît directement à l'étape 2.
- Même si la colonne est mappée, rien n'empêche de laisser une valeur sur "Ignorer" à l'étape 3
  (`v-select clearable`, pas de validation avant `doImport`).
- Résultat : chaque ligne concernée est envoyée avec `eventTypeId`/`eventCategoryId: undefined`,
  et le backend la rejette (`eventTypeId should not be empty` / `eventCategoryId should not be
  empty`) — affiché tel quel (message NestJS brut, non traduit) dans le panneau d'erreurs de fin
  d'import, ligne par ligne.

Pas de perte de données silencieuse (chaque échec est visible), mais deux défauts UX : (1) rien ne
prévient l'utilisateur *avant* de cliquer "Importer" que ces lignes sont vouées à échouer, (2) le
message d'erreur est un message de validation backend brut, pas une phrase compréhensible.

## Cause racine

Le composant a été conçu pour un cas générique (`entity: type|category|subcategory`) où seul
`type` n'a pas de FK parente — mais `canProceed`/`reachableSteps` n'ont jamais été complétés pour
rendre le mapping de la FK parente obligatoire dans les deux autres cas, contrairement à ce qui
existe déjà ailleurs dans ce même repo pour un problème structurellement identique.

## Options considérées (précédents trouvés dans ce repo)

1. **Bloquer l'import tant que le mapping n'est pas complet** — précédent :
   `MarketPriceCsvImportDrawer.vue::canImport` (bouton "Importer" désactivé + `v-alert` visible
   tant que tous les champs requis ne sont pas mappés). Nécessiterait en plus, pour être complet,
   de vérifier qu'aucune valeur unique de la colonne mappée ne reste sur "Ignorer" avant d'activer
   le bouton (le drawer Market Price n'a pas d'étape de mapping de valeurs équivalente à comparer).
2. **Auto-créer le référentiel manquant par nom** (au lieu de forcer un mapping vers de l'existant)
   — précédent direct : `MenuItemCsvImportDrawer.vue` (BUG-110/111/112, corrigé le 2026-07-16/17),
   qui crée automatiquement type/catégorie/marque/nom d'affichage manquants pendant l'import et
   affiche un résumé "Automatically created: N type(s), N category(ies)…". Plus permissif, mais
   supprime l'intérêt de l'étape 3 actuelle (choisir un id existant plutôt que faire confiance
   au texte brut) — un typo dans le CSV ("Consert" au lieu de "Concert") créerait un nouveau type
   au lieu d'alerter l'utilisateur.
3. **Statu quo, juste traduire le message d'erreur** — coût minimal, ne résout pas le problème de
   fond (l'utilisateur découvre l'échec seulement après avoir lancé l'import).

## Correction

**Décision (2026-07-18)** : option 1 (bloquer), écartant explicitement l'option 2 (auto-création).
Raison : contrairement au catalogue Menu Items (haute cardinalité, le CSV *est* la façon normale
d'y créer marques/catégories), `EventType`/`EventCategory` est une taxonomie à faible cardinalité
**résolue par nom dans le moteur de scoring Event Predict** (`predictiveAnalytics.js`, cf.
`docs/modules/07_EVENEMENTS.md`). Un typo CSV auto-créé fragmenterait silencieusement les events
comparables utilisés pour la prédiction — risque propre à ce domaine, absent côté Menu Items.
Bloquer coïncide aussi avec l'intention déjà visible de l'étape 3 (choisir un id existant).

Implémenté dans `TaxonomyImportDrawer.vue` :
- `entityFields` : `eventTypeRaw`/`eventCategoryRaw` marqués `required: true` (chip visuel étape 2).
- `canProceed` : exige désormais le mapping de la colonne FK parente pour `category`/`subcategory`
  (en plus de `name` déjà requis) avant de quitter l'étape 2.
- Nouveau computed `valuesFullyMapped` : vérifie qu'aucune valeur unique de la colonne FK n'est
  restée sur "Ignorer" à l'étape 3.
- Bouton "Importer" désormais désactivé si `!valuesFullyMapped`, avec une `v-alert` warning
  explicite à l'étape 3 tant que le mapping n'est pas complet.

## Risque de régression / à surveiller

- Vérifié par lecture de code + parse SFC (syntaxe) uniquement — **pas de reproduction live en
  navigateur** (pas de `pnpm dev` dans cette session). À tester manuellement : importer un CSV de
  catégories/sous-catégories sans mapper la colonne FK (le bouton "Importer" doit rester
  désactivé, avec le message d'avertissement visible) ; mapper la colonne mais laisser une valeur
  sur "Ignorer" (même blocage attendu) ; puis résoudre toutes les valeurs et vérifier que l'import
  fonctionne normalement. Vérifier aussi que l'import de types (`entity="type"`, sans FK parente)
  n'est pas affecté par ce changement.
- Aucun test automatisé ajouté (pas de suite de tests existante sur ce composant).

## Références

- `QUESTIONS_A_BERTRAND.md` #10
- `src/components/menu-fb/views/market-prices/drawers/MarketPriceCsvImportDrawer.vue` (précédent option 1)
- `src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue` (précédent option 2, BUG-110/111/112)
- `backend/src/features/events/dto/create-event-category.dto.ts`, `create-event-subcategory.dto.ts`
