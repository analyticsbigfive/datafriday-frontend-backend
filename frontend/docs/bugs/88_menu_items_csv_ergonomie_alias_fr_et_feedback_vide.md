# BUG-088 — Import CSV MenuItem : ergonomie (alias FR absents, pas de feedback fichier invalide)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue:259-274,381-382`

## Symptôme

Deux problèmes d'ergonomie constatés :
1. `HEADER_MAP` ne reconnaît quasiment aucun alias français (seul `'recette' → recipe` existe) —
   un export CSV avec en-têtes français usuels ("nom", "type", "catégorie", "prix de base", "prêt
   à la vente") n'est pas auto-mappé, ratant potentiellement la colonne `name` obligatoire.
2. Un CSV vide, mal délimité, ou dont l'en-tête ne contient pas de colonne `name` reconnue aboutit
   silencieusement à 0 ligne valide et 0 erreur affichées, sans indiquer pourquoi.

## Cause racine

`HEADER_MAP` incomplet côté alias FR ; aucun message explicite quand `csvRows.length === 0` après
parsing.

## Correction

`HEADER_MAP` étendu avec les alias FR équivalents (nom, type, catégorie, prix de base, prêt à la
vente, etc.), sur le même modèle que l'alias `recette` déjà présent. Un message explicite s'affiche
désormais quand le parsing produit 0 ligne (fichier vide, en-têtes non reconnus).

## Risque de régression / à surveiller

Vérifier qu'un en-tête ambigu (ex. "type" pouvant désigner `type` OU `kitchenType`) ne se fait pas
mal mapper par le nouvel alias — privilégier des alias explicites plutôt que des raccourcis trop
génériques.

## Références

- [[48_market_prices_import_csv_alias_dimensions_cm_non_reconnu]] (même classe de bug sur
  `/market-prices`).
