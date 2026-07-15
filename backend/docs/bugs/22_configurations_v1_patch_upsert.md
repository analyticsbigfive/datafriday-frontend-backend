# BUG-022 — PATCH /configurations/:id (v1) se comporte comme un upsert

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur
- **Domaine** : Espaces & builder
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `spaces.controller.ts` (`updateConfiguration`), `spaces.service.ts:1508` (`saveConfiguration` → `config.upsert`)

## Symptôme

Appeler `PATCH /configurations/:id` avec un id inexistant **crée** la config au lieu de renvoyer
404.

## Cause racine

`saveConfiguration` utilise `config.upsert` sans distinguer création/mise à jour — contraste
volontaire ou non avec le builder v2 (`PATCH /builder-v2/configurations/:id`), qui lui renvoie une
404 stricte sur un id inconnu.

## Correction

Aucune à ce jour — décider si c'est le comportement voulu pour v1 (legacy, pas de changement) ou si
ça doit être aligné sur v2.

## Risque de régression / à surveiller

Aligner sur du 404 strict changerait le comportement pour tout client existant qui dépendrait
(volontairement ou non) de l'upsert.

## Références

- `datafriday-web/docs/modules/03_BUILDER_ESPACES.md` §"Récapitulatif — bugs actifs et risques confirmés" #2
