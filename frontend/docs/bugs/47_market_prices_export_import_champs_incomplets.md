# BUG-047 — Export/Import CSV Market Prices : la moitié des champs du modèle absents (image, industriel, emballages, dimensions)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/views/MarketPriceListView.vue:573-635` (export, avant fix), `src/components/menu-fb/views/market-prices/drawers/MarketPriceCsvImportDrawer.vue:251-267` (import, avant fix)

## Symptôme

L'export CSV et le mapping d'import ne couvraient que 10-11 des ~20 champs utiles du modèle
`MarketPrice` (hors champs système) — un utilisateur exportant sa liste puis la réimportant
perdait silencieusement : l'image, le fabricant/façonnier (`industrialId`), l'emballage de
stockage (`inventoryPackaging`, distinct de `purchasePackaging` déjà géré), les unités
emballées/nombre d'unités, les dimensions de conditionnement (longueur/largeur/hauteur), et le
nombre d'unités par achat (`unitsPerPurchase`, techniquement déjà mappable côté import mais absent
du template et de l'export, donc jamais rempli en pratique).

## Cause racine

`exportToCSV()` (`MarketPriceListView.vue`, avant fix) et `priceFields`/`autoMap()`/
`downloadTemplate()` (`MarketPriceCsvImportDrawer.vue`, avant fix) n'avaient jamais été étendus au
fil des ajouts de champs au modèle `MarketPrice` (le DTO backend, lui, était à jour — cf.
`create-market-price.dto.ts`). Tous ces champs sont pourtant bien éditables manuellement via
`MarketPriceCreateDrawer.vue`/`MarketPriceEditSupplierDrawer.vue`.

Point notable sur `image` : le champ n'accepte qu'un upload de fichier dans l'UI manuelle (jamais
de saisie d'URL texte), mais `SupabaseStorageService.resolveImage()`
(`backend/src/core/supabase/supabase-storage.service.ts:78-119`) accepte déjà une URL http
classique telle quelle (seul un `data:` base64 déclenche un upload) — une colonne CSV avec une URL
d'image fonctionne donc nativement côté API, sans changement backend nécessaire.

## Correction

- **Export** (`exportToCSV`) : ajout des colonnes Image URL, Industrial, Units Per Purchase,
  Purchased In (Packaging), Stored In (Packaging), Packed Units, Number of Units, Packing
  Length/Width/Height (cm). `industrialName` résolu dans le computed `items` (nouveau lookup
  `industrialNameById`, même pattern que `supplierNameById` déjà existant).
- **Import** (`priceFields`/`autoMap`/`downloadTemplate`/`doImport`) : mêmes champs ajoutés comme
  cibles de mapping, avec alias d'auto-détection ; `industrialId` résolu par nom contre la liste
  des industriels du tenant (prop `industrials`, même principe que `suppliers`/`supplierId`).
- Nouvelle prop `industrials` sur `MarketPriceCsvImportDrawer.vue`, transmise depuis
  `MarketPriceListView.vue` (dispatch `industrials/fetchIndustrials` ajouté au `mounted()`, store
  déjà existant et utilisé ailleurs dans l'app).
- Clarification de la colonne prix : renommée "Price (Package Total) (EUR)" (au lieu de "Price Per
  Unit (EUR)") pour refléter sa vraie sémantique — c'est le champ `price` brut (montant payé pour
  le conditionnement d'achat), pas un prix par unité élémentaire. L'ancien libellé reste reconnu en
  alias pour la compatibilité avec les CSV déjà exportés avant ce fix. `pricePerUnit` reste
  toujours dérivé (`price / unitsPerPurchase`), jamais un champ d'entrée — cf.
  [[44_market_prices_import_csv_priceperunit_incoherent]].

## Risque de régression / à surveiller

- Vérifier qu'un export puis réimport immédiat du même fichier round-trip correctement tous les
  nouveaux champs (en particulier `unitsPerPurchase` + "Price (Package Total)" ensemble, pour
  confirmer que `pricePerUnit` recalculé est cohérent).
- Vérifier qu'une URL d'image dans la colonne "Image URL" est bien acceptée telle quelle par
  `resolveImage()` sans tentative d'upload.
- Le rapprochement `industrialId` par nom est un match exact (comme pour les fournisseurs) — pas
  de création automatique d'industriel si le nom ne correspond à rien d'existant.
- `MarketPriceEditDrawer.vue` (édition niveau item) n'expose pas tous ces champs dans son UI (ils
  sont gérés via `MarketPriceEditSupplierDrawer.vue`) — non modifié par ce fix, comportement
  existant inchangé.

## Références

- [[41_market_prices_import_csv_succes_partiel_invisible_et_doublons_mirror]], [[44_market_prices_import_csv_priceperunit_incoherent]] — même composant, analyses complémentaires.
