# ADR-0007 — Migrer les configurations v1 vers le modèle relationnel v2, puis retirer `Config.data`

- **Statut** : Proposé
- **Date** : 2026-10-02
- **Domaine** : Espaces & builder (backend)

## Contexte

L'ADR frontend [0002](../../../frontend/docs/adr/0002_builder_v2_relationnel_seul.md) a fait du
relationnel (`Zone`, `SpaceElement.zoneId`, `ConfigurationElement`) l'unique source de vérité du
builder, et l'interface v1 a été retirée le 2026-07-22. Côté backend, le modèle v1 reste vivant :
`Config.data` (JSON), `Floor`, `Forecourt`, `ExternalMerch`, et l'enregistrement
`SpaceConfigurationSaveService.saveConfiguration` qui réconcilie JSON et tables (environ 450 lignes,
recherche des éléments existants, ré-injection dans le JSON, suppressions et recréations).

Mesures sur la copie locale de la production (2026-10-02) :

| Donnée | Lignes |
|---|---|
| `Config` | 84 |
| `Config.data` non vide | 16 |
| `Floor` | 28 |
| `Forecourt` | 2 |
| `ExternalMerch` | 0 |
| `Zone` (v2) | 91 |
| `SpaceElement` rattachés en v1 (étage, parvis, merch) | 255 |
| `SpaceElement` rattachés en v2 (zone) | 1119 |

Appelants frontend encore branchés sur le chemin v1 :

- `POST /configurations` : `StepMapSpace.vue` (création de la première configuration dans le
  wizard d'intégration) et `SpacesPage.vue` (`api.saveConfiguration`).
- `POST /spaces/:id/assign-floor` et `GET /spaces/:id/floor-options` : `SpaceInventoryView.vue`.
  Ces routes savent déjà écrire en v2 quand l'espace a des zones.

Tant que les deux modèles coexistent, chaque lecture fusionne JSON et tables (`getConfiguration`)
et chaque écriture v1 doit garder les deux synchrones. C'est la cause documentée de plusieurs bugs
(étages dupliqués, PDV démappés) et le code le plus lourd du module.

## Décision

1. Écrire un script de migration idempotent, rejouable, qui convertit chaque configuration v1 :
   `Floor` vers `Zone` de type `FLOOR` (même niveau, mêmes dimensions), `Forecourt` vers `FORECOURT`,
   `ExternalMerch` vers `EXTERNAL`. Les `SpaceElement` gardent leurs identifiants (mappings
   Weezevent, `MenuAssignment` et agrégats intacts) et reçoivent `zoneId` plus une adhésion
   `ConfigurationElement` par configuration où ils figuraient. Le JSON reste en colonne de secours.
2. Valider le script sur la base locale (comparaison avant et après des lectures `GET
   /configurations/:id`, `GET /builder-v2/spaces/:id/state` et des routes d'inventaire), puis
   l'exécuter en production à la main, conformément à l'ADR 0002 (migrations jamais
   automatiques).
3. Basculer les deux appelants de `POST /configurations` vers `POST
   /builder-v2/spaces/:spaceId/configurations` (déjà utilisé par `StepMapShops.vue`).
4. Une fois aucune configuration v1 restante et aucun appelant v1 : retirer
   `SpaceConfigurationSaveService`, la fusion v1 de `getConfiguration`, les chemins v1 de
   l'affectation d'éléments, puis, dans une migration séparée, les tables `Floor`, `Forecourt`,
   `ExternalMerch` et la colonne `Config.data`.

## Conséquences

- Plus aucun nouveau code sur le chemin v1 (déjà la règle de l'ADR frontend 0002).
- Le retrait des tables est irréversible : il n'intervient qu'après une période d'observation avec
  la colonne JSON conservée en secours.
- Les étapes 1 à 3 demandent une coordination frontend et une fenêtre d'exécution en production :
  décision et calendrier à valider avec le produit avant tout lancement.

## Références

- ADR frontend 0002 (builder v2 relationnel seul), ADR backend 0002 (migrations manuelles).
- `docs/architecture/PLAN_REMEDIATION_BACKEND_2026-10.md`, section D4.
- `src/features/spaces/services/space-configuration-save.service.ts`,
  `src/features/spaces/services/space-configuration.service.ts`.
