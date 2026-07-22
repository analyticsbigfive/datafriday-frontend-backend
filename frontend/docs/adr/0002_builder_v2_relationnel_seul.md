# ADR-0002 — Builder v2 : le relationnel devient l'unique source de vérité

- **Statut** : Accepté. Frontend v1 retiré le 2026-07-22 (route + composants
  `spaces/views/builder/` supprimés — voir mise à jour en fin de document). Backend v1
  (`Config.data` JSON, `Floor`/`Forecourt`/`ExternalMerch`, reconcile) toujours vivant — migration
  des données existantes non faite.
- **Date** : 2026-07-04
- **Domaine** : Espaces & builder

## Contexte

Le builder v1 souffre de 4 problèmes structurels identifiés : (1) deux sources de vérité — le JSON
`Config.data` et les rows `Floor`/`SpaceElement` — à garder synchrones manuellement (reconcile au
save, fusion par level au get, verrou optimiste `Config.version`) ; (2) une visibilité multi-config
émulée côté client par duplication d'éléments et matching nom+type, non transactionnelle et
incohérente au premier échec partiel ; (3) un save en blob entier (transaction ~30s, prune
dangereux, double-save pour les floors neufs) ; (4) des résidus du portage React (props morts,
taxonomie dupliquée). Ces sources de vérité doubles sont la cause directe de plusieurs bugs corrigés
(floors dupliqués, badges perdus, PDV démappés — voir `docs/bugs/`).

## Décision

5 points structurants (détail complet dans `docs/utiles/REFONTE_3D_BUILDER_V2.md`) :

1. **Le relationnel devient l'unique source de vérité.** `Config.data` JSON disparaît (gardé en
   colonne backup le temps de la migration).
2. **Les éléments existent UNE fois par espace** (rattachés à une `Zone`) ; une configuration =
   une liste d'adhésions (table de jointure `ConfigurationElement`).
3. **API granulaire + autosave** : chaque geste = une petite mutation débouncée (create/patch/
   delete zone/élément, add/remove membership). Plus de save-blob.
4. **Les ids de `SpaceElement` sont conservés tels quels** (migration en place) — zéro impact sur
   les mappings Weezevent, `MenuAssignment` et l'analytique.
5. **Le menu d'un shop = `MenuAssignment`, point.** Suppression du doublon `menuItems` dans le JSON
   d'élément.

## Conséquences

v1 et v2 **cohabitaient sans flag de rollout tenant** — dette assumée consciemment (voir
`docs/modules/03_BUILDER_ESPACES.md`). **Ne pas écrire de nouveau code sur v1** pour les
zones/éléments : tout nouveau développement passe par le chemin v2, les blocs v1 restent séparés.

## Mise à jour — 2026-07-22 : retrait du frontend v1

Le builder v1 n'était plus utilisé en pratique (builder2 est l'unique parcours d'édition
d'espace) ; son UI a donc été retirée :

- Supprimé : `frontend/src/components/spaces/views/builder/` (5 fichiers Vue) et la route
  `SpaceBuilder` (`/spaces/:spaceId/builder`) dans `router/index.js`.
- Nettoyé (dead code devenu orphelin par la suppression) : `configuration.api.js`
  (`getAllConfigurations`, `getConfigurationsBySpace` — déjà mortes avant la suppression ;
  `updateConfiguration`, `deleteConfiguration` — dont le seul appelant était `SpaceBuilderViewRoute.vue`)
  et ~200 clés i18n `spaceBuilder*`/`elevationBuilder*`/`pp*` (EN+FR) qui n'étaient utilisées que
  par les composants supprimés.
- **Non touché, resté vivant côté backend** : le modèle v1 (`Config.data` JSON,
  `Floor`/`Forecourt`/`ExternalMerch`, `SpacesService.saveConfiguration`/`reconcileElement`) reste
  utilisé indépendamment de l'UI — `StepMapSpace.vue` (wizard Data Integration) crée la première
  config d'un espace via ce chemin (`POST /configurations`), et `SpaceInventoryView.vue` dépend de
  `assign-floor`/`floor-options`. La donnée `Config.data` de configs jamais migrées vers `Zone`
  reste lue par ce chemin. Un plan de bascule complet (migration des données existantes,
  dépréciation du backend v1) reste à faire — voir zones grises dans
  `docs/modules/03_BUILDER_ESPACES.md`.
- **Laissé en l'état, décision à prendre par un humain** : `PATCH /configurations/:id` et
  `DELETE /configurations/:id` (`ConfigurationsController`) n'ont plus de caller frontend connu
  (leur seul déclencheur était `SpaceBuilderViewRoute.vue`), mais ce sont des routes REST publiques
  documentées (Swagger) partageant leur logique avec la route `POST /configurations` (elle,
  vivante) — pas supprimées unilatéralement faute de certitude sur d'éventuels appelants externes.

## Références

- `docs/utiles/REFONTE_3D_BUILDER_V2.md`
- `docs/ARCHITECTURE_3D_BUILDER.md`
- `docs/modules/03_BUILDER_ESPACES.md`
