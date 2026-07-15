# ADR-0002 — Builder v2 : le relationnel devient l'unique source de vérité

- **Statut** : Accepté, migration en cours (v1/v2 cohabitent sans flag de rollout — dette assumée)
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

v1 et v2 **cohabitent aujourd'hui sans flag de rollout tenant** — dette assumée consciemment (voir
`docs/modules/03_BUILDER_ESPACES.md`). **Ne pas écrire de nouveau code sur v1** pour les
zones/éléments : tout nouveau développement passe par le chemin v2, les blocs v1 restent séparés.
Un plan de bascule complet (flag de rollout par tenant, dépréciation de v1) reste à faire.

## Références

- `docs/utiles/REFONTE_3D_BUILDER_V2.md`
- `docs/ARCHITECTURE_3D_BUILDER.md`
- `docs/modules/03_BUILDER_ESPACES.md`
