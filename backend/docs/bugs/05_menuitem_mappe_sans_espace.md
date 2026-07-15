# BUG-005 — Menu item mappé sans association Espace

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-06-28

## Symptôme

Un menu item pouvait être marqué "mappé" par le wizard d'intégration sans être associé à aucun
Espace (`spaceIds` vide), le rendant en réalité invisible/indisponible partout où le scoping par
espace est appliqué.

## Cause racine

`bulkProductMappings` n'écrivait pas `spaceIds` lors du mapping en masse.

## Correction

Fix back+front, plus un script de réparation (`heal`) pour corriger les mappings déjà affectés en
base.

## Risque de régression / à surveiller

Vérifier que tout nouveau chemin de mapping en masse écrit systématiquement `spaceIds`.

## Références

- —
