# BUG-193 — La case "Supprimer aussi les données synchronisées" n'a aucun effet réel

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : les deux (frontend trompeur, backend responsable du comportement réel)
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/views/DataIntegrationView.vue:622-635` (checkbox), `:1331-1341` (flux de suppression)

## Symptôme

Le dialog de suppression d'une intégration affiche une case à cocher "Supprimer également toutes
les données synchronisées (transactions, produits, événements…)", laissant croire qu'un utilisateur
peut supprimer uniquement la configuration de l'intégration en laissant la case décochée, tout en
conservant les données de vente déjà synchronisées.

## Cause racine

D'après `docs/modules/05_INTEGRATIONS_VENTES.md` (modèle `Integration`, lignes 284-286 et 431), la
table `Integration` a `onDelete: Cascade` sur l'intégralité du lac de données (`SalesEvent`,
`SalesLocation`, `SalesTransaction`, `WeezeventProduct`, etc.). `deleteWeezeventInstance` est
appelé sans condition à la ligne 1341 de `DataIntegrationView.vue` — qu'importe l'état de la case —
et supprime donc systématiquement tout le lac de données par cascade. `purgeWeezeventData`
(appelé seulement si la case est cochée, ligne 1333, route `DELETE /weezevent/data`) devient
redondant : il purge exactement les mêmes tables que la suppression en cascade qui suit de toute
façon. Un utilisateur qui laisse la case décochée pour "garder les données" les perd quand même.

## Correction

Option (b) retenue par le PO : la case a été retirée de `DataIntegrationView.vue`, pas rendue
fonctionnelle côté backend. Le dialog affiche désormais un bandeau d'avertissement inconditionnel
(`diRemoveIntegrationDataWarning`, `cd-banner--error`) indiquant que la suppression de
l'intégration supprime aussi irréversiblement toutes ses données synchronisées. Le champ de données
`removeDeleteData` et l'appel `purgeWeezeventData` conditionné dessus ont été supprimés de
`confirmRemoveIntegration` — seul `deleteWeezeventInstance`/`deleteDigifoodInstance` reste, la
cascade backend fait le reste. Ceci résout aussi BUG-194 par effet de bord (plus d'appel de purge
séparé pouvant échouer silencieusement).

## Risque de régression / à surveiller

Impact direct sur la confiance utilisateur : un client qui pensait garder son historique de ventes
en décochant la case le perd silencieusement et de façon irréversible. À corriger avant toute
communication produit sur cette fonctionnalité.

## Références

- `docs/modules/05_INTEGRATIONS_VENTES.md` (modèle `Integration`, §"Ce qui en dépend").
- Audit du 2026-07-20 sur `docs/audit-data-integration-fb`.
