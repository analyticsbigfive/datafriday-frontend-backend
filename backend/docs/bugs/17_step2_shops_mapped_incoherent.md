# BUG-017 — step2_shops_mapped calculé différemment entre route unitaire et route bulk

- **Statut** : 🟢 Corrigé (2026-07-21)
- **Sévérité** : 🟡 Mineur
- **Domaine** : Analyse & agrégation (wizard Mappings)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; corrigé le 2026-07-21
- **Fichiers** : `mappings.service.ts` (`hasShopMappingForIntegration`,
  `getShopMappedIntegrationIds`, `getIntegrationProgress`, `getAllIntegrationProgress`)

## Symptôme

Comparer `GET /mappings/progress/:locationId` et `GET /mappings/progress` pour la même location
après un mapping fait uniquement via l'endpoint merchant-element : les deux donnent un
`step2_shops_mapped` différent.

## Cause racine

Deux implémentations distinctes, et **toutes deux fausses différemment** (vérifié en base) :
- Route unitaire (`getIntegrationProgress`) : comptait les mappings par **merchantId**, en
  filtrant `WeezeventTransaction.locationId` avec le param reçu — qui est en réalité
  l'`integrationId` (convention step1 documentée dans le fichier), pas un merchantId ni un
  `WeezeventLocation.id`. Un mauvais espace d'id, sur le mauvais champ.
- Route bulk (`getAllIntegrationProgress`) : comptait uniquement les mappings par **location
  cuid** (`WeezeventLocation.id`), ignorant totalement les mappings faits via la route merchant.

Vérifié en base le 2026-07-21 : sur 417 lignes `LocationShopMapping` réelles, 247 correspondent à
des location cuids, **0** à des merchantId — la route unitaire renvoyait donc quasi toujours
`step2=false` en pratique. Les deux routes de progression ne sont aujourd'hui appelées par aucun
écran frontend (confirmé par recherche), donc aucun impact utilisateur observé malgré le défaut.

## Correction

Unifié dans deux nouvelles méthodes de `MappingsService` :
- `hasShopMappingForIntegration(tenantId, integrationId)` : vérifie les deux conventions
  (location cuid ET merchant id) pour une intégration donnée.
- `getShopMappedIntegrationIds(tenantId, integrationIds)` : version batchée (une seule volée de
  requêtes pour N intégrations), utilisée par `getAllIntegrationProgress` pour éviter un retour à
  du N×2 queries.

`getIntegrationProgress` et `getAllIntegrationProgress` délèguent maintenant tous les deux à cette
source unique pour `step2_shops_mapped`. `AggregationService.getStep4Context` (BUG-029) utilise la
même source pour `hasMappings`.

## Risque de régression / à surveiller

Tests unitaires ajoutés (`mappings.service.spec.ts`, nouveau fichier) : les deux conventions
(location cuid / merchant id), l'isolation multi-intégration (un mapping d'une intégration ne doit
pas "déteindre" sur une autre du même tenant), et le comportement des deux routes existantes.

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #4
- BUG-029 (`29_mapping_fait_logique_dupliquee.md`) — même cause racine, corrigé dans le même
  passage.
