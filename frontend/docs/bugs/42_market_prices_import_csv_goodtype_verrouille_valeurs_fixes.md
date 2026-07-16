# BUG-042 — Import CSV Market Prices : `goodType` verrouillé à 4 valeurs fixes (référentiel pourtant dynamique)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/drawers/MarketPriceCsvImportDrawer.vue:514-568` (avant fix)

## Symptôme

Un tenant ayant créé ses propres Types de prix (ex. "Alcools", "Viande") dans
`marketPriceTypes` voit son import CSV rejeter systématiquement ces lignes avec l'erreur "Invalid
good type — must be Food, Beverage, Packaging or Other", alors que la création manuelle d'un
Market Price via le formulaire accepte très bien ces types.

## Cause racine

`doImport()` (avant fix) forçait `VALID_GOOD_TYPES = ['Food', 'Beverage', 'Packaging', 'Other']`
et un dictionnaire de synonymes fermé `GOOD_TYPE_NORM` (lignes 515-520). Or
`market-prices.service.ts:395-401` documente explicitement que `goodType` est un référentiel
**libre par tenant** (n'importe quel nom de `MarketPriceType` créé par le tenant), "Packaging"
étant la seule valeur réservée. Le DTO backend (`create-market-price.dto.ts`) confirme :
`@IsString()` simple sur `goodType`, pas d'enum.

## Correction

Ajout des props `goodTypeOptions` (liste des noms de `MarketPriceType` du tenant, même donnée que
`MarketPriceCreateDrawer.vue`) et `suppliers` sur `MarketPriceCsvImportDrawer.vue`, transmises
depuis `MarketPriceListView.vue` (`:good-type-options="goodTypeOptions"`, réutilisation du
computed déjà existant). `doImport()` valide désormais `goodType` par correspondance
insensible à la casse contre cette liste dynamique, "Packaging" restant toujours accepté en plus
(valeur réservée). Message d'erreur mis à jour : "Type de produit inconnu — créez-le d'abord dans
Types" (au lieu de citer une liste figée).

## Risque de régression / à surveiller

- Vérifier qu'un tenant avec les types par défaut (Food/Beverage/Packaging) importe toujours
  correctement (non-régression).
- Vérifier qu'un tenant avec des types personnalisés (ex. "Alcools") peut désormais importer des
  lignes avec ce `goodType`.
- Les anciens synonymes français codés en dur (`nourriture`→Food, `boisson`→Beverage, etc.) ont été
  retirés : si un tenant compte sur ces synonymes plutôt que sur le nom exact du type existant,
  l'import échouera désormais avec le nouveau message — comportement voulu (le référentiel fait
  foi), mais à surveiller si signalé par un utilisateur.

## Références

- [[41_market_prices_import_csv_succes_partiel_invisible_et_doublons_mirror]] — même composant, même analyse.
