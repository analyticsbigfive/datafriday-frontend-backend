# BUG-029 — Divergence de logique "mapping fait ?" dupliquée entre MappingsService et AggregationService

- **Statut** : 🟢 Corrigé (2026-07-21)
- **Sévérité** : 🟡 Faible/latent — pas de divergence observée aujourd'hui, risque futur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; corrigé le 2026-07-21
- **Fichiers** : `mappings.service.ts` (`hasShopMappingForIntegration`), `aggregation.service.ts`
  (`getStep4Context`)

## Symptôme

En creusant BUG-017 (même racine) : `AggregationService.getStep4Context` définissait `hasMappings`
comme `locationShopMapping.count({ tenantId }) > 0` — comptant sur le **tenant entier**, sans
scoping par intégration. Une intégration B du même tenant sans aucun mapping affichait donc
`hasMappings: true` dès qu'une intégration A en avait un — une divergence réelle par rapport à la
logique (plus précise, scopée par intégration) de `MappingsService`.

## Cause racine

Duplication de logique métier entre deux services au lieu d'une source unique — confirmée en
lisant le code des deux côtés (pas seulement supposée, comme documenté initialement).

## Correction

`AggregationService.getStep4Context` délègue maintenant à
`MappingsService.hasShopMappingForIntegration(tenantId, integrationId)` (nécessite d'injecter
`MappingsModule` dans `AggregationModule` — pas de dépendance circulaire, vérifié). Repli sur
l'ancien comptage tenant-wide uniquement quand `integrationId` n'est pas fourni (paramètre
optionnel de la route, cas legacy).

## Risque de régression / à surveiller

Tests ajoutés dans `aggregation.service.spec.ts` (`describe('getStep4Context')`) : vérifient que
`hasMappings` appelle bien `MappingsService.hasShopMappingForIntegration` quand `integrationId` est
fourni, et retombe sur le count tenant-wide sinon.

## Références

- `datafriday-web/docs/modules/05_INTEGRATIONS_VENTES.md` §"Récapitulatif — bugs actifs de ce domaine" #5
- BUG-017 (`17_step2_shops_mapped_incoherent.md`) — même cause racine, corrigé dans le même
  passage.
