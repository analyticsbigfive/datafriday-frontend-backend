# BUG-018 — createMerchantElementMapping sans vérification d'ownership tenant

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur (sécurité — accès cross-tenant potentiel)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; corrigé le 2026-07-20
- **Fichiers** : `mappings.service.ts:364-455`

## Symptôme

Appeler l'endpoint avec un `spaceElementId` appartenant à un autre tenant (nécessite un accès API
direct, pas un chemin UI normal) l'accepte sans vérification.

## Cause racine

`createMerchantElementMapping`/`bulkMerchantElementMappings` (happy-path) n'imposent aucune
vérification que le `spaceElementId` fourni appartient bien au tenant de l'appelant.

## Correction

Repris le pattern déjà en place (et déjà correct) sur la fonction sœur `createLocationShopMapping`
(`mappings.service.ts:208-245`) : avant tout `upsert`, vérification que le `spaceElementId` fourni
correspond bien à un `SpaceElement` rattaché au tenant appelant, via un `findFirst` avec la même
clause `OR` couvrant les 4 chemins de rattachement possibles (`floor`/`forecourt`/`externalMerch`
en Builder v1, `zone` en Builder v2). `NotFoundException` si l'élément n'existe pas ou n'appartient
pas au tenant.

- `createMerchantElementMapping` : vérification unitaire avant l'`upsert`.
- `bulkMerchantElementMappings` : par chunk, un seul `findMany` (`id: { in: [...] }` + même `OR`)
  résout tous les `spaceElementId` possédés par le tenant en une requête ; les paires dont le
  `spaceElementId` n'est pas dans cet ensemble sont rejetées directement dans `errors` (pas de
  tentative d'upsert), les autres continuent vers le `$transaction` existant. Le fallback per-item
  (en cas d'échec de chunk) appelle maintenant `createMerchantElementMapping` au lieu de dupliquer
  l'`upsert` — même pattern que `bulkLocationShopMappings` qui appelle déjà `createLocationShopMapping`
  dans son propre fallback.

## Risque de régression / à surveiller

- Un appel avec un `spaceElementId` inexistant ou appartenant à un autre tenant renvoie désormais
  une erreur (404 en unitaire, entrée dans `errors[]` en bulk) au lieu d'être silencieusement
  accepté — c'est le comportement voulu, mais vérifier qu'aucun flux front légitime n'envoyait un
  `spaceElementId` non encore persisté au moment de l'appel (créerait un faux positif).
- Le `findMany` supplémentaire par chunk ajoute une requête DB par lot (négligeable face au
  `$transaction` qui suit).

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #5
- BUG-035 (`OrganizationsController`) — même famille de défaut d'isolation multi-tenant, déjà
  corrigé, pattern de référence.
- `mappings.service.ts:208-245` (`createLocationShopMapping`) — implémentation de référence
  répliquée ici.
