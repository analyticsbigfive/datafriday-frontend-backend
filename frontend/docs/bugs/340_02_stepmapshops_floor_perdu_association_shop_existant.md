# BUG-340-02 — Étage perdu lors de l'association d'un shop existant à une location (StepMapShops)

<!-- AA = code auteur à 2 chiffres (01 Jean-Luc, 02 Ulrich, 03 Emmanuel) — voir "Comment ajouter un
     bug" dans 00_INDEX.md pour éviter les collisions de numérotation entre branches parallèles. -->

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 2)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-19
- **Fichiers** : `src/components/integration/wizard/StepMapShops.vue:1104-1111` (`levelByShop`),
  `:1143-1181` (`elementFloorIndex`), `:1302-1349` (`_updateMappingOne`), `:1638-1694`
  (`executeBulk`), `:1696-1774` (`openFloorDialog`/`onFloorDialogConfigChange`)

## Symptôme

Lorsqu'on associe un shop **existant** à une location dans l'étape 2 du wizard d'intégration, le
badge d'étage n'apparaît pas et le dialogue d'assignation d'étage s'ouvre vide, comme si aucun
étage n'était défini pour ce shop — alors qu'il en a bien un ailleurs dans l'espace. L'utilisateur
doit re-sélectionner manuellement l'étage à chaque association. Pire : s'il confirme un étage dans
ce dialogue vide (souvent le premier proposé, RDC), `applyFloorDialog` appelle `assignShopsFloor`
qui **réaffecte réellement** le shop à ce niveau en base, écrasant l'étage réel par RDC.

Ce symptôme est proche de BUG-003/BUG-208 mais sur un chemin de code différent : BUG-003/208
corrigeaient la reconstruction de `floorMap` au **rechargement de page** (`loadData`) ; ce bug
touche la mise à jour **en cours de session**, au moment même où l'utilisateur choisit un shop
existant (`_updateMappingOne`, bulk `executeBulk`, et le dialogue d'étage).

## Cause racine

`loadData()` construit bien deux index avec l'étage réel de chaque shop (`levelByShop`,
space-wide ; `elementFloorIndex`, avec nom mais scopé à `userConfigs[0]`, cf. BUG-208), mais ce
sont des variables locales à `loadData()`, jamais conservées sur l'instance. Ils ne servaient qu'à
reconstruire `floorMap` pour les mappings **déjà persistés** au chargement de la page.

`_updateMappingOne` (appelée par le `<select>` de shop existant) persiste le mapping
location→shop mais ne touche jamais `floorMap`/`floorNameMap` — la valeur reste `undefined` pour
ce shop tant que la page n'a pas été rechargée. Même trou dans `executeBulk` pour les shops
matchés en masse mais non nouvellement créés (`r.created` falsy) : le backend
(`bulkQuickCreateAndMap`, `backend/src/features/spaces/spaces.service.ts:3477-3489`) force
explicitement `floorLevel: null` pour ces lignes (`p.created ? … : null`), même quand l'élément
existant appartient réellement à un floor.

En aval, `openFloorDialog` amorce `floorDialogLevel` depuis `floorMap[locationId]` (donc `null`
dans ce cas), et `onFloorDialogConfigChange` le remet **explicitement** à `null` avant de charger
les floors de la config, sans jamais le réamorcer après — donc même quand `floorMap` est
correctement rempli par ailleurs, aucune carte d'étage n'apparaît pré-sélectionnée dans le
dialogue.

## Correction

- `loadData()` conserve désormais `levelByShop` et `elementFloorIndex` sur l'instance
  (`this._levelByShop`, `this._elementFloorIndex`).
- Nouvelle méthode `getFloorInfoForElement(elementId)` qui combine les deux index (préfère
  `elementFloorIndex` pour le nom, retombe sur `levelByShop` pour le niveau seul).
- `_updateMappingOne` renseigne `floorMap`/`floorNameMap` immédiatement via ce helper quand un
  shop existant est choisi, avec rollback symétrique en cas d'échec de la persistance.
- `executeBulk` fait de même pour les shops matchés en masse non nouvellement créés.
- `onFloorDialogConfigChange` réamorce `floorDialogLevel` depuis la valeur réelle connue
  (`floorMap` ou `getFloorInfoForElement`) une fois les floors de la config chargés, au lieu de le
  laisser à `null`.

## Risque de régression / à surveiller

Tester l'association d'un shop existant (mono et multi-config utilisateur) sans recharger la
page : le badge d'étage doit apparaître immédiatement, et le dialogue d'assignation d'étage doit
pré-sélectionner la bonne carte. Tester aussi le bulk-matching (`executeBulk`) sur des shops
existants déjà positionnés sur un étage.

## Références

- [[03_badge_etage_reset_stepmapshops]] (bug d'origine, chemin `loadData`).
- [[208_stepmapshops_badge_etage_regression_multi_config]] (régression multi-config, même chemin
  `loadData`).
