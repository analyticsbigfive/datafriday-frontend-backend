# BUG-029 — Divergence de logique "mapping fait ?" dupliquée entre MappingsService et AggregationService

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Faible/latent — pas de divergence observée aujourd'hui, risque futur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `mappings.service.ts:735-941` vs `aggregation.service.ts:233`

## Symptôme

Aucun aujourd'hui — c'est un risque latent : les deux services réimplémentent chacun leur propre
logique pour déterminer si un mapping est "fait".

## Cause racine

Duplication de logique métier entre deux services au lieu d'une source unique.

## Correction

Aucune à ce jour — factoriser en une seule fonction partagée avant qu'une des deux implémentations
ne dérive de l'autre.

## Risque de régression / à surveiller

Toute modification future de l'une des deux logiques sans répercuter sur l'autre créera une
divergence silencieuse.

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md` §"Récapitulatif — bugs actifs de ce domaine" #5
