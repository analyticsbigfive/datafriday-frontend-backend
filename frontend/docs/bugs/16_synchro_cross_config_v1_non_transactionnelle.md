# BUG-016 — Synchro cross-config v1 non transactionnelle

- **Statut** : 🔴 Ouvert
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

Aucune à ce jour — c'est exactement le problème que le Builder v2 corrige structurellement (voir
[ADR-0002](../adr/0002_builder_v2_relationnel_seul.md)) ; en attendant la bascule complète, ce
risque reste actif sur v1.

## Risque de régression / à surveiller

Un échec réseau en plein toggle cross-config laisse l'état incohérent sans que l'utilisateur soit
prévenu autrement qu'en console.

## Références

- `docs/modules/03_BUILDER_ESPACES.md` §"Récapitulatif — bugs actifs et risques confirmés" #3
