# BUG-064 — SpaceMenus backend : nettoyages mineurs (logs verbeux, doc Swagger désynchronisée)

- **Statut** : 🟢 Corrigé (logs + Swagger) / ⚫ Won't fix (magic string `isMerch`)
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes / Espaces & builder — module `SpaceMenus`
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/space-menus/space-menus.service.ts:77,590-592,672-674,777-779,968,987,1094`
  (logs), `src/features/space-menus/space-menus.controller.ts:49-64` (Swagger), `:828` (magic string)

## Symptôme / Cause racine

Trois petits points de dette relevés lors de l'audit complet du module, sans lien de cause entre
eux :

1. **Logs verbeux sur des lectures chaudes** : chaque `GET` (y compris ceux déclenchés par un
   simple toggle ou l'ouverture d'un drawer) passe par `this.logger.log(...)` — niveau INFO — avec
   shopId/tenantId/configId, alors que ce sont des chemins de lecture fréquents pendant la
   navigation sur `/space-menus`.
2. **Doc Swagger désynchronisée du schéma Prisma réel** (`space-menus.controller.ts:49-64`, dans le
   schéma de réponse documenté de `getShopMenu`) : `diet` documente
   `['VEGAN','VEGETARIAN','HALAL','KOSHER','NONE']` alors que l'enum réel
   (`schema.prisma:58-64`) est `Vegetarian|Vegan|GlutenFree|Halal|Kosher` (pas de `NONE`, `GlutenFree`
   manquant, casse différente) ; `storageType` documente
   `['FROZEN','REFRIGERATED','DRY','AMBIENT']` alors que l'enum réel est `Cold|Dry|Frozen`
   uniquement ; `allergens` est documenté comme un enum fermé à 7 valeurs alors que le champ réel
   est un `String[]` libre.
3. **Magic string** (`space-menus.service.ts:828`) :
   `const isMerch = String(shop.type ?? '').toLowerCase().startsWith('merch');` — une branche
   métier centrale (décomposition recette vs ligne « article ») basée sur un préfixe de string brut
   plutôt qu'un enum/constante partagée.

## Correction

- Logs de lecture passés de `.log()` à `.debug()` sur les 7 occurrences listées ci-dessus.
- Schéma Swagger de `getShopMenu` corrigé pour refléter les vraies valeurs d'enum Prisma
  (`diet`, `storageType`) et `allergens` redocumenté comme `string[]` libre.
- Le point 3 (magic string `isMerch`) n'est **pas** corrigé : le commentaire du code indique déjà
  que c'est un choix délibéré calqué sur le prototype (« la règle est portée par le TYPE du shop »)
  — changer ça pour un enum/constante partagée est un refactor de modélisation plus large, hors
  périmètre de ce nettoyage.

## Risque de régression / à surveiller

- Vérifier que le niveau de log configuré en prod (`LOG_LEVEL`) inclut toujours les erreurs/warnings
  de ce module (seul le niveau `.log()`→`.debug()` change, pas les `.error()`/`.warn()` s'il y en a).

## Références

- Aucune.
