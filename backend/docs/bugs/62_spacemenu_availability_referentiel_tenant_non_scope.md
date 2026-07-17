# BUG-062 — `getItemsWithAvailabilityForSpace` charge tout le référentiel tenant sur chaque appel, sans cache

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix à faire)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes / Espaces & builder — module `SpaceMenus`
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/features/space-menus/space-menus.service.ts:407-462`

## Symptôme

Chaque ouverture du drawer « By Shop » (`getShopAvailableMenuItems`), chaque visite de la vue
« By Menu Item » (`getSpaceMenuItems`), et chaque bascule `enabledOnly` déclenche un rechargement
complet de 5 des 6 requêtes parallèles de `getItemsWithAvailabilityForSpace` sur **tout le
référentiel du tenant** (`ingredient`, `packaging`, `menuComponent`, `marketPrice`, `supplier`,
chacune filtrée seulement par `{ tenantId }`), sans aucun cache. Pour un tenant avec un catalogue
d'ingrédients/packagings/fournisseurs volumineux, c'est une lecture pleine table à chaque
interaction de l'écran, même si l'espace consulté n'utilise qu'une fraction de ce référentiel.

## Cause racine

Seule `menuItems` (la 6ᵉ requête) est scopée à l'espace via `spaceAssociationWhere(spaceId)`. Les
5 autres ne le sont pas — probablement parce que les items disponibles peuvent référencer
n'importe quel ingrédient/composant du tenant, et que scoper proprement demanderait un calcul en
deux temps (récupérer d'abord les ids référencés par les `menuItems` de l'espace, y compris
récursivement pour les composants imbriqués, puis ne charger que ces ids).

## Correction

**Non corrigé — décision volontaire de repousser, après mesure en base (2026-07-17, lecture seule,
requêtes directes sur la base pointée par `DATABASE_URL`)** :

| Table | Volume mesuré |
|---|---|
| Tenants | 21 |
| Ingrédients — le plus gros tenant | 54 (max observé) |
| Packagings — total tous tenants | 8 |
| MenuComponents — total tous tenants | 8 |
| MarketPrices — total tous tenants | 46 |
| Suppliers — total tous tenants | 16 |
| `SpaceMenuItem` (association espace) — total en base | 181 |
| Items associés à un espace — le plus chargé | 60 |

Les 5 requêtes non scopées de `getItemsWithAvailabilityForSpace` chargent donc, dans le pire cas
observable aujourd'hui, environ 54+8+8+46+16 ≈ 130 lignes plates (aucune n'a de jointure profonde
sauf `menuComponent` qui n'a que 8 lignes au total) — un coût réseau/mémoire négligeable, très loin
d'un scénario de « pleine table volumineuse ». Le défaut architectural reste réel (le pattern ne
scale pas), mais il n'a **aucun impact mesurable à l'échelle actuelle** : investir dans le fix
(scoping à deux temps avec fermeture transitive sur les composants imbriqués, cf. piste ci-dessous)
n'a pas de retour aujourd'hui et introduirait un risque réel sur un calcul business-critique
(disponibilité à la vente) pour un gain nul dans l'immédiat.

**Déclencheur explicite pour revisiter** : re-prioriser ce fix si l'une de ces conditions survient —
1. le référentiel cumulé d'un tenant (ingredients + packagings + components) dépasse ~500 lignes ;
2. la latence p95 de `GET /space-menu/shop/:id/items` ou `/space-menu/space/:id/items` devient
   mesurable/signalée ;
3. le nombre de tenants actifs simultanés augmente significativement (charge agrégée, même si
   chaque tenant reste petit individuellement).

**Piste de fix si le déclencheur survient** : calculer d'abord l'ensemble des
`ingredientId`/`packagingId`/`componentId` (avec fermeture transitive sur les enfants, même logique
de garde anti-cycle que `collectComponentIssues` existant) réellement référencés par les
`menuItems` de l'espace, puis filtrer les 5 requêtes de référentiel par ces ids au lieu de
`{ tenantId }` seul. Propriété rassurante sur le risque : une erreur dans le calcul de fermeture
ferait "échouer fermé" — un ingrédient non chargé par erreur est traité comme `undefined` par
`checkSupplyItem` (`item.deletedAt`/`item.active` undefined) → item marqué à tort indisponible,
jamais l'inverse (jamais un item réellement indisponible affiché comme disponible). Alternative plus
simple à isoler : un cache Redis court (quelques secondes) sur le référentiel complet par tenant.

## Risque de régression / à surveiller

- Revoir cette fiche si un des 3 déclencheurs ci-dessus survient — ne pas laisser ce report devenir
  permanent par défaut.

## Références

- [BUG-061](61_spacemenu_duplication_lookup_shop_tenant.md) — même fichier, refactor de dette
  connexe (celui-là corrigé, car mécanique et sans risque business).
