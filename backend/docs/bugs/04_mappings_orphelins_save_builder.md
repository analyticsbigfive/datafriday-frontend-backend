# BUG-004 — Mappings orphelins après sauvegarde du builder

- **Statut** : ⚪ Diagnostiqué (root cause identifiée, statut du fix à reconfirmer)
- **Sévérité** : 🟠 Majeur (démapping silencieux Data Integration)
- **Domaine** : Intégrations & ventes / Espaces & builder
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-06-28

## Symptôme

Après une sauvegarde de la configuration du builder (`saveConfiguration`), des mappings de
produits (Data Integration) deviennent orphelins : un produit apparaît "démappé" côté wizard alors
qu'il avait été mappé correctement avant la sauvegarde.

## Cause racine

`SpaceElement.id` est régénéré à chaque `saveConfiguration` — le backend fait un
`delete + recreate` des éléments plutôt qu'un `update`. Tout mapping qui référence l'ancien
`SpaceElement.id` devient donc orphelin dès qu'un utilisateur re-sauvegarde le builder, même sans
changement de fond sur cet élément.

## Correction

Root cause identifiée le 2026-06-28. **À reconfirmer** : aucune trace dans les notes de session
d'un fix appliqué depuis (ex. passer à un `update` au lieu de `delete+recreate`, ou remapper
automatiquement par nom après sauvegarde). À vérifier en priorité avant de considérer ce bug comme
clos.

## Risque de régression / à surveiller

Si non corrigé, **tout** save du builder sur un espace déjà mappé casse silencieusement
l'intégration Data Integration — reproduire : mapper un produit, sauvegarder le builder sans rien
changer, vérifier si le mapping survit.

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md`
