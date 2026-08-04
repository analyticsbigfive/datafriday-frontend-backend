# 13 — Rapport Saison (périodes personnalisées)

> Rédigé le 2026-08-04 (demande Bertrand, réunion du 04/08 — spec « Copie de RH.pdf » p.2). — JLH

## 1. Quoi

Des **périodes personnalisées nommées** (« Saison 2025-2026 », 1er juillet → 30 juin), paramétrées
dans **Settings > Configuration > Saisons**, rattachées à un ou plusieurs espaces (ou tous), et
proposées comme **presets de dates** dans les pickers d'**Analyse** et de **Predict**.

## 2. Modèle

`Season` (`id`, `tenantId`, `name`, `startDate`, `endDate`, `allSpaces`) + jointure `SeasonSpace`
— clone du schéma `HrGoal`/`HrGoalSpace` (jamais de `spaceIds` JSON, ADR-0003 ; `allSpaces=true`
= jointure vide). **Différence assumée avec les Settings HR : les saisons se chevauchent**
(2024-25 et 2025-26 coexistent sur le même espace) — aucune règle d'unicité, pas de
`assertNoOverlap`.

Migration : `backend/prisma/sql/2026-08-04_seasons.sql` (idempotente, **à appliquer à la main
AVANT de déployer le module backend** — ADR-0002, sinon P2022 → 500). Ligne #12 du README.

## 3. Où (fichiers)

| Rôle | Fichier |
|---|---|
| Modèles Prisma | `backend/prisma/schema.prisma` (`Season`, `SeasonSpace`, relation sur `Space`) |
| Module NestJS | `backend/src/features/seasons/` (module + service + controller), enregistré dans `app.module.ts` |
| API front | `src/api/endpoints/seasons.api.js` |
| Store | `src/store/modules/seasons.js` (TTL 15 min, getters `seasonsForSpace`, `seasonById`) |
| Page Settings | `src/components/seasons/views/SeasonsListView.vue` + `SeasonFormDrawer.vue` |
| Nav + route | `constants/navigation.js` (`navSeasons`), `router/index.js` (`/configurations/seasons`) |
| Picker Analyse | `analyse/filters/FilterPanel.vue`, `AnalyseView.vue` (`dateRangeItems`), `FilterBottomSheet.vue` (mobile) |
| Résolution de plage | `store/modules/analyse.js` getter `dateBounds` (branche `season:<id>`) |
| i18n | `translations.js`, clés `navSeasons` + `season*` (EN + FR) |

## 4. Règles

- **Valeur de preset** : `season:<id>` dans `filters.timeRange`. Résolue par le getter `dateBounds`
  → `{ start: startDate, end: endDate à 23:59:59 }`.
- **Saison supprimée / id orphelin** : `dateBounds` retombe sur « tout l'historique »
  (`{null, null}`) — jamais sur le `default` du switch (année en cours) ; un watcher de
  `FilterPanel` remet en plus le filtre à `'all'` une fois le store seasons chargé.
- **Scope** : le picker ne liste que les saisons couvrant l'espace courant (`allSpaces` OU
  jointure). Une saison d'un autre espace n'apparaît pas.
- **Analyse ET Predict** : les saisons sont appendées aux deux listes de presets (décision JLH
  2026-08-04, conforme à la spec p.2 « Analyse > Dates, Predict > Dates »).
- **Permissions** : `GET /seasons` = tout utilisateur authentifié du tenant (le picker en dépend) ;
  POST/PATCH/DELETE = `menu.config.manage`. Question #45.
- **Chip / libellés** : le chip de période et la bottom-sheet mobile affichent le **nom** de la
  saison (résolu via le store), pas la valeur technique.
- Le libellé de la saison est libre — recommandation : « Saison AAAA-AAAA ».

## 5. Vérification

1. SQL rejouable deux fois sans erreur (`SELECT to_regclass('"Season"')` non NULL).
2. Créer « Saison 2025-2026 » sur un espace → visible dans le picker de cet espace uniquement ;
   `allSpaces` → visible partout.
3. Sélection saison = mêmes données qu'un custom range équivalent (mêmes bornes).
4. Supprimer la saison sélectionnée → retour « Tout l'historique » sans erreur.
5. Utilisateur sans `menu.config.manage` : pas d'accès à la page Settings, mais saisons visibles
   dans le picker.
