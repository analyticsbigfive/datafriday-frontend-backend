# ADR-0003 — SpaceMenuItem comme source de vérité relationnelle du prix par espace

- **Statut** : Accepté, migration effectuée
- **Date** : 2026-07-05
- **Domaine** : Menu & recettes / Espaces

## Contexte

Le prix d'un menu item par espace était porté par des colonnes JSON `spacePrices`/`spaceIds` sur
`MenuItem` — peu interrogeables (pas de jointure ni d'index efficace), sujettes à désynchronisation
et impossibles à contraindre par unicité `(menuItemId, spaceId)` au niveau base de données.

Alternatives non documentées (le choix de passer par une table relationnelle plutôt que de
continuer à patcher le JSON n'est pas détaillé au-delà du constat ci-dessus).

## Décision

`SpaceMenuItem(spaceId, menuItemId, priceTtc, vatRate)` devient la source de vérité relationnelle,
unique par `(menuItemId, spaceId)`. Les colonnes `spacePrices`/`spaceIds` sur `MenuItem` sont
**gelées en base** (colonnes conservées mais plus jamais lues ni écrites par le code vivant). Le
contrat API sérialise dynamiquement un objet `spacePrices`-like pour compatibilité descendante avec
les consommateurs existants — aucune migration front nécessaire au moment du switch.
`MenuItemPriceHistory.spaceId` est également porté par ce modèle.

## Conséquences

Tout nouveau code doit lire/écrire le prix par espace via `SpaceMenuItem`, **jamais** via les
colonnes JSON gelées `spacePrices`/`spaceIds` — écrire à nouveau dedans réintroduirait la
désynchronisation que cette migration a résolue. Le contrat API public reste stable, donc pas
d'impact direct sur les intégrations tierces.

## Références

- `datafriday-web/docs/CARTOGRAPHIE_MODULES.md` §"Prix par espace"
- `datafriday-web/docs/modules/04_MENU_CATALOGUE.md`
