# BUG-048 — Import CSV Market Prices : alias d'auto-mapping des dimensions "(cm)" non reconnu

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/drawers/MarketPriceCsvImportDrawer.vue:516-520` (avant fix)

## Symptôme

En réimportant un fichier CSV tout juste exporté par l'app elle-même (round-trip export → import,
cf. [[47_market_prices_export_import_champs_incomplets]]), les colonnes "Packing Length (cm)",
"Packing Width (cm)" et "Packing Height (cm)" ne s'auto-mappaient pas à l'étape 2 — l'utilisateur
devait les associer manuellement à chaque import, sans message d'erreur expliquant pourquoi
l'auto-détection avait échoué sur ces trois colonnes précises.

## Cause racine

La fonction `normalize()` (`autoMap()`, ligne 483) retire les espaces, underscores, tirets et
parenthèses via `replace(/[\s_\-()]+/g, '')`, mais ne retire que les caractères de ponctuation —
pas le contenu textuel qui se trouvait entre les parenthèses. `"Packing Length (cm)"` se normalise
donc en `"packinglengthcm"` (le "cm" reste collé à la suite), et non `"packinglength"` comme les
listes d'alias `packingLength`/`packingWidth`/`packingHeight` le supposaient (avant fix, elles ne
contenaient que `'packinglength'`, `'packingwidth'`, `'packingheight'` sans le suffixe `cm`).
Repéré en simulant `normalize()` sur les 20 en-têtes réellement exportés pour vérifier qu'un
round-trip export→import fonctionnerait bien de bout en bout.

## Correction

Ajout des variantes avec suffixe `cm` collé (`'packinglengthcm'`, `'packingwidthcm'`,
`'packingheightcm'`) dans les trois listes d'alias concernées, en plus des formes déjà présentes.

## Risque de régression / à surveiller

- Vérifier qu'un export puis réimport immédiat mappe bien automatiquement les 3 colonnes de
  dimensions à l'étape 2, sans intervention manuelle.
- Attention si un futur ajout de colonne au template utilise une autre unité entre parenthèses
  (ex. "(kg)", "(mm)") : appliquer le même correctif (ajouter la forme avec suffixe collé) plutôt
  que de supposer que `normalize()` isole proprement le contenu entre parenthèses.

## Références

- [[47_market_prices_export_import_champs_incomplets]] — bug d'origine ayant introduit ces colonnes et leurs alias.
