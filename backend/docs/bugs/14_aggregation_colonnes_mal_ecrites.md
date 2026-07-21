# BUG-014 — AggregationService écrit menuItemId dans spaceElementId, duplique locationId dans weezeventMerchantId

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🔴 Bloquant (CA affiché à 0 alors que des ventes existent)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; re-confirmé et corrigé le 2026-07-20 en direct sur un cas réel
  (voir symptôme précis ci-dessous, découvert via l'onglet "Par shop" de l'écran de traitement des
  événements affichant 86 "shops" pour 5 locations réelles)
- **Fichiers** : `aggregation.service.ts:264-306` (`executeProcessEvents`)

## Symptôme

Lancer "Traiter les événements" dans le wizard sur un espace, puis observer `shops[].revenue` dans
la réponse `GET /spaces/:id/shop-details` : à 0 ou incohérent malgré des ventes réelles agrégées.

**Symptôme concret observé le 2026-07-20** : l'onglet "Par shop" du drawer d'analyse d'un événement
("Match Noel", Aix Arena) affichait **86 "shops"** alors que l'espace n'a que **5 locations
Weezevent réelles** mappées. Vérifié en base : pour une seule location, `SpaceRevenueMinuteAgg`
contenait 19 valeurs de `spaceElementId` distinctes, **toutes non résolvables** dans la table
`SpaceElement` (jointure `LEFT JOIN` → toujours `NULL`) — parce que ce ne sont pas des ids de
`SpaceElement` mais des ids de `MenuItem` (confirmé par recoupement direct avec
`WeezeventProductMapping`). Le nom affiché pour chaque "shop" dupliqué est en réalité toujours le
nom de la *location* (résolu via `weezeventLocationId`, seule clé utilisée côté lecture pour le
libellé) — d'où l'impression de shops strictement dupliqués avec des CA fractionnés.

## Cause racine

Le pipeline d'agrégation réellement exécuté (`AggregationService.executeProcessEvents`,
lignes 264-293) écrivait `pm."menuItemId"` — récupéré via une `JOIN` vers
`WeezeventProductMapping` — dans la colonne `spaceElementId` de `SpaceRevenueMinuteAgg`, et
dupliquait `t."locationId"` dans `weezeventMerchantId` (au lieu de `t."merchantId"`, colonne
existante et inutilisée). Aucune jointure vers `WeezeventLocationShopMapping` (la table qui porte
le vrai mapping location→shop, posé à l'étape 2 du wizard) n'existait dans cette requête.

Deux conséquences distinctes :
1. **"Par shop" groupait en réalité par article vendu**, pas par shop physique : une location
   vendant N articles différents produisait N lignes "shop" fantômes (d'où 86 pour 5 locations
   réelles — 5 locations × ~17 articles vendus en moyenne).
2. **Ventes de produits non mappés à un MenuItem silencieusement exclues** de l'agrégat
   shop-level : la `JOIN` vers `WeezeventProductMapping` était une `INNER JOIN`, donc toute ligne
   de vente dont le produit n'avait pas encore de mapping (étape 3 du wizard non faite ou
   incomplète) ne remontait jamais dans `SpaceRevenueMinuteAgg`, même si le shop lui-même
   (étape 2) était correctement mappé.

La jointure "shops list" de la RPC de lecture (`get_space_shop_details`) attendait un vrai
`spaceElementId`/`weezeventMerchantId` — elle ne pouvait donc jamais matcher ces lignes, confirmant
le symptôme "CA à 0" décrit dès la découverte initiale.

## Correction

`aggregation.service.ts` (`executeProcessEvents`) : remplacé la `JOIN "WeezeventProductMapping"`
(qui ne sert à rien pour un agrégat shop/minute — cette table n'a pas de rôle ici) par une
`LEFT JOIN "WeezeventLocationShopMapping" lsm ON lsm."weezeventLocationId" = t."locationId" AND
lsm."tenantId" = tenantId`, et écrit désormais `lsm."spaceElementId"` (`NULL` si la location n'est
pas encore mappée — cohérent avec le comportement déjà documenté de la RPC de lecture pour les
locations non rattachées) au lieu de `pm."menuItemId"`. `weezeventMerchantId` écrit maintenant
`t."merchantId"` au lieu de dupliquer `t."locationId"`. Le `GROUP BY` mis à jour en conséquence.

**Aucun backfill manuel nécessaire** : `executeProcessEvents` supprime déjà toutes les lignes
`SpaceRevenueMinuteAgg` de l'événement avant de ré-agréger (`deleteMany` juste avant l'`INSERT`,
lignes 252-255) — un simple clic sur "Re-traiter" (déjà présent dans l'UI de l'étape 4 du wizard)
sur chaque événement concerné suffit à effacer les lignes fantômes et réécrire des données
correctes avec le code corrigé.

## Risque de régression / à surveiller

- Vérifier après un "Re-traiter" qu'un event déjà traité voit son nombre de "shops" chuter à un
  nombre cohérent avec ses locations réellement mappées (≤ nombre de locations, jamais un multiple
  lié au nombre d'articles).
- Vérifier que les ventes de produits non mappés (étape 3 incomplète) apparaissent maintenant dans
  le CA shop-level (elles ne l'étaient pas avant, via l'`INNER JOIN` supprimée) — à comparer avec
  le CA total déjà correct côté agrégat par article (`SpaceProductRevenueDailyAgg`, lui non
  affecté par ce bug).
- `get_space_shop_details` (RPC) et tout endpoint consommant `SpaceRevenueMinuteAgg.spaceElementId`
  doivent être revérifiés après un re-traitement réel — non retesté bout-en-bout dans cette session
  (pas de build/dev server lancé, correctif appliqué par lecture de code + vérification SQL directe
  en base uniquement).
- Les événements **jamais re-traités** après ce fix conservent leurs lignes fantômes existantes
  (elles ne disparaissent que sur un nouveau passage de `processEvents`) — pas un risque de
  régression, mais un rappel que le fix est "au prochain traitement", pas rétroactif automatique.

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #1
