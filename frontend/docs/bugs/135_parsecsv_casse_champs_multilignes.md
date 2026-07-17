# BUG-135 — `utils/csv.js parseCSV` : casse sur un champ entre guillemets contenant un saut de ligne

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/utils/csv.js:44-64` (avant correction)

## Symptôme

`parseCSV` découpait le texte en "lignes" (`text.split(/\r?\n/).filter(l => l.trim())`) AVANT toute
prise en compte des guillemets. Un champ CSV valide contenant un retour à la ligne entre guillemets
(cas fréquent d'un export Excel/Google Sheets, ex. une description multi-lignes) est donc coupé en
deux lignes CSV distinctes, désalignant toutes les colonnes suivantes pour cette ligne et la
suivante ; une ligne vide au milieu d'un tel champ était même supprimée par le `.filter`. Utilisé
par les deux importeurs du domaine Événements (`CsvImportDrawer.vue`, `TaxonomyImportDrawer.vue`) —
seuls consommateurs de cette fonction dans tout le repo (grep exhaustif confirmé).

## Cause racine

Même classe de bug déjà rencontrée et corrigée sur les imports CSV Market Prices (BUG-045) et Menu
Items (BUG-084) — mais ces deux correctifs ont chacun réécrit leur PROPRE parseur local
(`MarketPriceCsvImportDrawer.vue`, `MenuItemCsvImportDrawer.vue`), sans jamais toucher ce fichier
utilitaire partagé `src/utils/csv.js`, qui restait donc cassé pour ses seuls consommateurs restants
(le domaine Événements).

## Correction

`parseCSV` réécrit en tokenizer caractère par caractère sur le texte brut complet (pas de split
préalable par `\n`), avec gestion de l'échappement `""` à l'intérieur d'un champ entre guillemets —
même approche que les fix BUG-045/BUG-084.

## Risque de régression / à surveiller

Testé unitairement (`tests/unit/csv.spec.js`, nouveau fichier) : champ multi-ligne entre guillemets,
guillemet échappé `""`, champ avec virgule entre guillemets, fins de ligne CRLF, ligne vide au
milieu d'un champ multi-ligne (préservée) vs ligne totalement vide (supprimée), fichier vide/
en-tête seul.

## Références

- `docs/bugs/45_market_prices_import_csv_parsing_champs_multilignes.md`
- `docs/bugs/84_menu_items_csv_parsing_casse_guillemets.md`
