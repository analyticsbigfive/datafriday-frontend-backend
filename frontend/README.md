# datafriday-web

Frontend Vue 3 de DataFriday — plateforme de gestion d'événements et d'espaces de restauration
(prévision de fréquentation, builder d'espaces, catalogue menu/recettes, ventes & intégrations,
stock, logistique). Consomme l'API backend [`api-datafriday-staging`](../api-datafriday-staging)
(`https://datafriday-api.onrender.com/api/v1`).

## Stack

Vue 3 (Options API majoritaire, `<script setup>` accepté) · Vuetify 3 · Vuex 4 · Vue Router 4 ·
Axios · i18n maison · Vue CLI (webpack, pas Vite).

## Démarrer

```bash
pnpm install
pnpm dev      # vue-cli-service serve
```

Variable d'environnement requise (fichier `.env`, non versionné) : `VUE_APP_API_URL` — URL de
l'API backend.

## Tests

```bash
pnpm test:unit    # Jest (tests/unit)
pnpm test:e2e     # Cypress (tests/e2e/specs)
```

## Build & déploiement

```bash
pnpm build        # vue-cli-service build → dist/
```

## Documentation

Point d'entrée : [`docs/CARTOGRAPHIE_MODULES.md`](docs/CARTOGRAPHIE_MODULES.md).

| Besoin | Doc |
|---|---|
| Vue d'ensemble du projet (front + back) | [`docs/CARTOGRAPHIE_MODULES.md`](docs/CARTOGRAPHIE_MODULES.md) |
| Organisation technique du code front | [`docs/FRONTEND_ARCHITECTURE.md`](docs/FRONTEND_ARCHITECTURE.md) |
| Règles métier par domaine, bugs actifs, code mort | [`docs/modules/00_INDEX.md`](docs/modules/00_INDEX.md) |
| Bugs connus (tracker de correction) | [`docs/bugs/00_INDEX.md`](docs/bugs/00_INDEX.md) |
| Décisions d'architecture actées | [`docs/adr/00_INDEX.md`](docs/adr/00_INDEX.md) |
| Charte graphique / typographie | [`docs/CHARTE_GRAPHIQUE.md`](docs/CHARTE_GRAPHIQUE.md) |
| Contribuer (workflow complet, git, déploiement) | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Guide pour agents IA (Claude Code) | [`CLAUDE.md`](CLAUDE.md) |

## Domaines métier

Prévision (Event Predict) · Analyse & agrégation · Espaces & builder · Menu & recettes · Achats &
référentiels · Intégrations & ventes · Stock & logistique · Événements · Auth & onboarding (RBAC).
Détail de chaque domaine : [`docs/modules/`](docs/modules/00_INDEX.md).

## À ne pas utiliser comme référence

`versionReact/` et `api-datafriday-main/` (racine du repo parent) sont des prototypes/copies
archivés — ne jamais s'y référer pour comprendre le comportement actuel du produit
([ADR-0001](docs/adr/0001_vue_source_de_verite_unique.md)).
