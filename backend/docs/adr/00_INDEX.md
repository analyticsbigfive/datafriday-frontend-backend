# Architecture Decision Records — index

> Une décision structurante par fichier (modèle de données, découpage de modules, choix d'infra,
> convention de déploiement) — pas pour un simple choix d'implémentation local. Format défini par
> [`TEMPLATE.md`](TEMPLATE.md). Décisions transverses (avec impact frontend) dupliquées ou
> référencées côté [`datafriday-web/docs/adr/00_INDEX.md`](../../../datafriday-web/docs/adr/00_INDEX.md).
>
> **But** : avant de remettre en cause une architecture existante (ou de la contourner), vérifier
> ici si elle résulte d'une décision déjà prise et pourquoi — pour ne pas la recontredire sans le
> savoir.

| # | Titre | Statut | Domaine |
|---|---|---|---|
| [0001](0001_architecture_heos.md) | Adopter un dispatch hybride orchestré (HEOS) | Accepté (implémentation partielle) | Architecture technique |
| [0002](0002_migrations_manuelles_jamais_plateforme.md) | Migrations Prisma jamais automatiques (toujours manuelles) | Accepté | Déploiement / DB |
| [0003](0003_spacemenuitem_source_verite_prix_espace.md) | SpaceMenuItem = source de vérité du prix par espace | Accepté, migré | Menu & recettes |
| [0004](0004_prisma_driver_adapter_pg.md) | Adopter @prisma/adapter-pg (retire le double-wrapping pgbouncer) | Accepté | Base de données / Perf |
| [0005](0005_restockplan_document_fige_vs_restockstate_session.md) | Séparer le plan de réarmement (document figé `RestockPlan`) de l'état de session (`RestockState`) | Accepté | Stock / Réarmement |
| [0006](0006_stock_identite_produit_polymorphe.md) | Identité produit polymorphe `(itemKind, itemRefId)` pour Logistic, en remplacement progressif d'`itemKey` (nom) | Accepté | Stock / Logistic |

## Comment ajouter une ADR

1. Copier [`TEMPLATE.md`](TEMPLATE.md) vers `NNNN_slug-court.md` (numéro suivant disponible).
2. Ne documenter que le réellement connu — ne pas inventer d'alternatives "pour faire complet".
3. Ajouter une ligne dans le tableau ci-dessus.
4. Si la décision a un impact frontend, ajouter une ligne/fichier miroir côté
   [`datafriday-web/docs/adr/`](../../../datafriday-web/docs/adr/).
