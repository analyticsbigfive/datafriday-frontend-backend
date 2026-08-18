# BUG-333-02 — Le fix BUG-332-02 (tenantId) était nécessaire mais insuffisant : le cascade de repli à 3 niveaux, exécuté séquentiellement 3 fois (Latest/Modal × ProductId/WeezeventId/Name), dépassait encore 60s

- **Statut** : 🟡 Corrigé non testé (2026-08-18, branche `fix/products-price-query-tenant-scope`)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes (wizard, étape 3) / Menu & recettes
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-18 — après déploiement de BUG-332-02, l'utilisateur a reconfirmé le
  même symptôme sur le même tenant : "pareil" (capture d'écran), mais l'erreur avait changé de
  `502 Bad Gateway` à `timeout of 60000ms exceeded` côté client (Axios) — signe que la requête
  s'exécutait enfin sans crasher, mais restait trop lente.
- **Fichiers** :
  - `backend/src/shared/pricing/menu-item-pricing.service.ts:190-260` (`getSpaceScopedLatestPrices`,
    `getSpaceScopedModalPrices`)
  - `backend/src/shared/pricing/menu-item-pricing.service.ts:339-410` (variantes `ByName`)
  - `backend/src/shared/pricing/menu-item-pricing.service.ts:471-540` (variantes `ByWeezeventId`)
  - `backend/src/features/weezevent/weezevent.controller.ts:738-812` (`getProducts`, enchaînement
    des 3 cascades successives : par `productId`, puis par `weezeventId` pour les manquants, puis
    par `name` pour ce qui manque encore)

## Symptôme

Après BUG-332-02, `GET /weezevent/products?spaceId=...` ne renvoie plus de 502, mais dépasse
toujours le timeout client de 60s sur le tenant qui a signalé le problème. Mesuré en isolant
chaque étape réelle du contrôleur (mêmes 346 produits) :

| Étape | Avant (BUG-332-02 seul) | Repli si non résolu |
|---|---|---|
| 1. `getSpaceScopedLatestPrices`/`ModalPrices` (par `productId`) | 8,4 s | résout 258/346 |
| 2. `…ByWeezeventId` (88 produits restants) | 5,2 s | résout 0/88 |
| 3. `…ByName` (88 produits toujours sans prix) | non mesuré avant ce fix | — |

Rien qu'aux étapes 1+2, déjà 13,6 s — et l'étape 3 (jamais isolée avant ce fix) s'ajoute derrière.
BUG-332-02 avait résolu la cause la plus grave (Seq Scan sans filtre tenant, seul responsable du
502), mais l'architecture même du cascade — trois niveaux de repli (espace → non-attribué à un
autre espace → global), attendus **séquentiellement** — reste coûteuse à ce volume : chaque niveau
coûte plusieurs secondes (dominé par le JOIN vers `WeezeventTransaction`, pas par la taille de la
liste d'ids), et le contrôleur enchaîne ce cascade **trois fois** (par `productId`, puis par
`weezeventId` pour les manquants, puis par `name` pour ce qui manque encore).

## Cause racine

Chacune des 6 fonctions `getSpaceScopedLatestPrices(ByName|ByWeezeventId)` /
`getSpaceScopedModalPrices(ByName|ByWeezeventId)` attend le niveau 1, vérifie ce qui manque,
attend le niveau 2 (seulement si nécessaire), vérifie à nouveau, attend le niveau 3. Cette
optimisation ("ne pas requêter le niveau suivant si le précédent a déjà tout résolu") a un coût
caché : sur un tenant où le niveau 1 ne résout presque rien (ex. peu de ventes attribuées
explicitement à l'espace) et où le niveau 3 doit de toute façon s'exécuter, les 3 requêtes —
chacune dominée par le même coût de JOIN — s'exécutent **en série** alors qu'elles sont
**indépendantes** (chacune porte sa propre restriction de location, aucune ne dépend du résultat
d'une autre pour être construite).

## Correction

Corrigée en code le 2026-08-18 : les 3 niveaux de chacune des 6 fonctions sont désormais lancés en
parallèle (`Promise.all`), puis fusionnés dans le même ordre de priorité qu'avant (espace >
non-attribué > global — `merge()` ne réécrit jamais une clé déjà posée, donc le résultat final est
identique à la version séquentielle). Seul le **temps d'attente** change : le coût total d'un
niveau à 3 branches passe de la **somme** des 3 temps au **maximum** des 3 temps.

**Vérifié empiriquement contre la base réelle**, cascade complet (les 3 étapes du contrôleur, y
compris l'étape "ByName" jamais mesurée avant ce fix) :

```
STEP 1 (Latest+Modal, parallèle)      : 7,2 s  — résout 258/346
STEP 2 (ByWeezeventId, parallèle)     : 3,0 s  — résout 0/88
STEP 3 (ByName, parallèle)            : 3,5 s  — résout 1/88
TOTAL                                 : 13,7 s
```

Contre ~19 s+ estimé pour le même cascade complet en séquentiel (13,6 s mesurés pour les 2
premières étapes seules avant ce fix, étape 3 jamais isolée). Sous le timeout client (60 s) avec
une marge confortable.

**Compromis assumé** : les 3 niveaux s'exécutent maintenant TOUJOURS, même quand le niveau 1 aurait
suffi à tout résoudre (avant : le niveau 2/3 était sauté si `missing` était vide). Pour un tenant
dont le niveau 1 résout déjà tout rapidement, cela ajoute désormais un coût fixe (les niveaux 2 et
3 tournent "pour rien" en arrière-plan du niveau 1, mais en parallèle donc sans ralentir le
résultat final) — accepté au profit de la résolution de l'incident en cours, plutôt qu'une
optimisation conditionnelle plus fine (hors périmètre de ce fix).

## Risque de régression / à surveiller

- Charge DB accrue : chaque appel exécute maintenant systématiquement 3 requêtes par niveau au lieu
  de 1 à 3 selon les cas — à surveiller sur la consommation de connexions/CPU Postgres si le volume
  d'appels à cette route est élevé.
- `getLatestSalesPricesByWeezeventId`/`ModalSalesPricesByWeezeventId` extraient
  `ti."rawData"->>'item_id'` sans index fonctionnel dédié — coût par ligne plus élevé qu'une simple
  comparaison de `productId`, resté non optimisé dans ce fix (déjà scopé par `tenantId`, donc pas
  catastrophique, mais pas aussi rapide que possible sur un très gros tenant). Piste de suivi si
  cette route reste lente pour d'autres tenants : index sur `(tenantId, (rawData->>'item_id'))`.
- Non testé en environnement réel au moment de la rédaction — mesures faites en local contre la
  base de production/staging en lecture seule.

## Références

- [BUG-332-02](332_02_getlatestsalesprices_seq_scan_sans_filtre_tenant_502.md) — le fix préalable
  (filtre `tenantId` manquant), nécessaire mais qui ne suffisait pas seul à passer sous les 60s sur
  ce tenant.
