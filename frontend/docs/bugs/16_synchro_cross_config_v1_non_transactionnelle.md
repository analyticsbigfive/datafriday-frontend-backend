# BUG-016 — Synchro cross-config v1 non transactionnelle

- **Statut** : 🟢 Corrigé (2026-07-22 — devenu sans objet : `PropertiesPanelView.vue` et
  `SpaceBuilderViewRoute.vue`, seuls porteurs de `syncConfigurationIdChanges`, ont été supprimés
  avec le retrait complet du frontend builder v1, voir
  [ADR-0002](../adr/0002_builder_v2_relationnel_seul.md))
- **Sévérité** : 🟠 Majeur (incohérence entre configs possible)
- **Domaine** : Espaces & builder
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `PropertiesPanelView.vue` (cross-config toggle), `SpaceBuilderViewRoute.vue` (`syncConfigurationIdChanges`)

## Symptôme

Un échec partiel pendant une bascule de visibilité multi-config laisse les configs incohérentes,
sans autre trace qu'un `console.warn`.

## Cause racine

`syncConfigurationIdChanges` = N `GET`+`PATCH` séquencés côté navigateur, matching par nom+type
(pas par id) — non transactionnel par construction, contrairement à ce que ferait une vraie
transaction serveur.

## Correction

2026-07-22 : le frontend builder v1 (`spaces/views/builder/`, dont `PropertiesPanelView.vue` et
`SpaceBuilderViewRoute.vue`) a été retiré du produit — `builder2` (qui corrige structurellement ce
problème via `ConfigurationElement`, voir [ADR-0002](../adr/0002_builder_v2_relationnel_seul.md))
est l'unique parcours restant. Aucun code client ne peut plus déclencher ce chemin.

## Risque de régression / à surveiller

Un échec réseau en plein toggle cross-config laisse l'état incohérent sans que l'utilisateur soit
prévenu autrement qu'en console.

## Références

- `docs/modules/03_BUILDER_ESPACES.md` §"Récapitulatif — bugs actifs et risques confirmés" #3
