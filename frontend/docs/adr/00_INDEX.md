# Architecture Decision Records — index

> Une décision structurante par fichier (modèle de données, découpage de modules, choix d'infra,
> convention front) — pas pour un simple choix d'implémentation local. Format défini par
> [`TEMPLATE.md`](TEMPLATE.md). Décisions transverses (avec impact backend) dupliquées ou
> référencées côté [`api-datafriday-staging/docs/adr/00_INDEX.md`](../../../api-datafriday-staging/docs/adr/00_INDEX.md).
>
> **But** : avant de remettre en cause une architecture existante (ou de la contourner), vérifier
> ici si elle résulte d'une décision déjà prise et pourquoi — pour ne pas la recontredire sans le
> savoir.

| # | Titre | Statut | Domaine |
|---|---|---|---|
| [0001](0001_vue_source_de_verite_unique.md) | `src/` = unique source de vérité front | Accepté | Architecture technique |
| [0002](0002_builder_v2_relationnel_seul.md) | Builder v2 : le relationnel devient l'unique source de vérité | Accepté, migration en cours | Espaces & builder |
| [0003](0003_charte_graphique_typographie.md) | Charte graphique typographique unique (1 police UI + 1 police technique) | Accepté, migration opportuniste | Architecture technique (transverse) |

Voir aussi côté backend : [ADR-0003 SpaceMenuItem](../../../api-datafriday-staging/docs/adr/0003_spacemenuitem_source_verite_prix_espace.md)
(impacte directement le contrat prix par espace consommé par le front).

## Comment ajouter une ADR

1. Copier [`TEMPLATE.md`](TEMPLATE.md) vers `NNNN_slug-court.md` (numéro suivant disponible).
2. Ne documenter que le réellement connu — ne pas inventer d'alternatives "pour faire complet".
3. Ajouter une ligne dans le tableau ci-dessus.
4. Si la décision a un impact backend, ajouter une ligne/fichier miroir côté
   [`api-datafriday-staging/docs/adr/`](../../../api-datafriday-staging/docs/adr/).
