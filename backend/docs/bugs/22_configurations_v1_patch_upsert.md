# BUG-022 — PATCH /configurations/:id (v1) se comporte comme un upsert

- **Statut** : 🟢 Corrigé (2026-07-22 — route supprimée, voir Correction)
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

2026-07-22 : la route `PATCH /configurations/:id` (`ConfigurationsController.updateConfiguration`)
a été supprimée — son seul appelant frontend connu était `SpaceBuilderViewRoute.vue` (builder v1,
retiré le même jour, voir
`datafriday-web/docs/adr/0002_builder_v2_relationnel_seul.md`). `saveConfiguration()` (le service
sous-jacent) reste intact : `POST /configurations` en dépend toujours (upsert par id, comportement
inchangé et volontaire pour ce chemin — `CreateConfigDto.id` reste un champ optionnel documenté).

## Risque de régression / à surveiller

Si un consommateur externe (hors `datafriday-web`) appelait `PATCH /configurations/:id`, il
recevrait désormais un 404 générique NestJS au lieu de l'upsert — aucun caller de ce type identifié
lors de cette passe (recherche exhaustive frontend + tests + docs).

## Références

- `datafriday-web/docs/modules/03_BUILDER_ESPACES.md` §"Récapitulatif — bugs actifs et risques confirmés" #2
