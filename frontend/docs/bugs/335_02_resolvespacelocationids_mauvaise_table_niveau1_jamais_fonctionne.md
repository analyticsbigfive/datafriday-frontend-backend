# BUG-335-02 — Le "niveau 1" (ventes de CET espace) du cascade de prix n'a jamais fonctionné : mauvaise table, mauvais type d'id ; les niveaux 2/3 (autres espaces) faisaient tout le travail en silence

- **Statut** : 🟡 Corrigé non testé (2026-08-18, branche `fix/products-price-query-tenant-scope`)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes (wizard, étape 3) / Menu & recettes
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-18 — en implémentant la demande d'Ulrich de supprimer les niveaux de
  repli 2/3 du cascade de prix (BUG-332/333) et de se limiter STRICTEMENT aux ventes de l'espace
  courant. Avant de supprimer ces niveaux, vérification empirique du niveau 1 contre la base réelle
  ("tu es sûr que niveau 1 fonctionne ?" — pas la question posée mot pour mot, mais la vérification
  demandée par le fil de discussion) : niveau 1 renvoyait 0 résultat, systématiquement.
- **Fichiers** :
  - `backend/src/shared/pricing/menu-item-pricing.service.ts:147-180` (ancien
    `resolveSpaceLocationIds`/`resolveSpaceLocationScope`, corrigé)
  - `frontend/src/components/integration/wizard/StepMapSpace.vue:705`
    (`createLocationSpaceMapping(this.location.id, this.selectedSpaceId)` — confirme que
    `LocationSpaceMapping.salesLocationId` reçoit `integration.id`, pas un id de location)
  - `backend/prisma/schema.prisma` — modèles `LocationSpaceMapping` (étape 1) vs
    `LocationShopMapping` (étape 2), et `SpaceElement`/`Floor`/`Forecourt`/`ExternalMerch`/`Zone`

## Symptôme

Vérification directe en base pour l'espace signalé par l'utilisateur (BUG-332/333) :

```
LocationSpaceMapping pour cet espace :
  salesLocationId = "cmqqlxn0i0vxg13mbgdnplq9m"
  → correspond à une Integration ?  OUI
  → correspond à une SalesLocation (vrai point de vente) ?  NON
```

L'ancien `resolveSpaceLocationScope` construisait `spaceLocationIds` à partir de
`LocationSpaceMapping.salesLocationId`, puis les comparait à
`WeezeventTransaction.locationId` (`t."locationId" IN (spaceLocationIds)`) dans
`getLatestSalesPrices`/`getModalSalesPrices` (et leurs variantes ByName/ByWeezeventId). Un id
d'intégration ne pouvant jamais être égal à un id de location réelle, cette comparaison ne
retournait **jamais** de ligne — confirmé empiriquement : `LEVEL1 ... rows=0` sur le produit testé,
et ce pour n'importe quel espace, systématiquement, depuis la création de ce code.

**Conséquence directe sur BUG-332/333** : les "258/346 produits résolus" mesurés dans ces deux
tickets ne venaient PAS du niveau 1 ("ventes de cet espace", supposé prioritaire) — ils venaient
entièrement des niveaux 2/3 (déjà signalés comme le vrai problème par Ulrich : *"pourquoi tu veux
calculer les ventes dans un lieu qu'on refuse de gérer"*). Pire : comme le niveau 2 ("ventes NON
attribuées à un AUTRE espace") excluait lui aussi des ids d'intégration au lieu de vraies locations
(`otherSpaceLocationIds`, même défaut), son `NOT IN` n'excluait en pratique **jamais rien** — le
niveau 2 se comportait comme une recherche quasi globale déguisée, ce qui explique pourquoi son coût
mesuré (~5s) était comparable à celui du niveau 3, réellement global.

## Cause racine

Confusion entre deux tables de mapping distinctes, documentées dans `05_INTEGRATIONS_VENTES.md`
mais jamais recoupées avec le code de tarification :

- **`LocationSpaceMapping`** (étape 1 du wizard, "Space") : rattache toute une **intégration** à un
  espace en une seule ligne. `salesLocationId` y contient `Integration.id` — confirmé par
  `StepMapSpace.vue:705`, `createLocationSpaceMapping(this.location.id, this.selectedSpaceId)`, où
  `this.location` est l'objet `Integration` ouvert dans le wizard.
- **`LocationShopMapping`** (étape 2 du wizard, "Locations") : rattache une **location réelle**
  (`SalesLocation.id`, ex. "Buvette A") à un `SpaceElement` (un shop/PDV du builder). C'est la
  bonne table pour répondre à "quelles sont les vraies locations de cet espace ?" — mais il faut
  encore résoudre quels `SpaceElement` appartiennent à `spaceId` (4 chemins possibles : Floor/
  Forecourt/ExternalMerch via `Config.spaceId`, ou `Zone.spaceId` direct pour le builder v2 — même
  logique que `SpacesService.getSpaceShops`).

`resolveSpaceLocationIds`/`resolveSpaceLocationScope` interrogeaient la première table en croyant
lire la seconde.

## Correction

Corrigée en code le 2026-08-18. `resolveSpaceLocationIds` (fusion des deux anciennes fonctions,
`otherSpaceLocationIds` supprimé — devenu inutile suite à BUG-336-02, qui retire les niveaux 2/3)
résout maintenant :
1. Les `SpaceElement` de l'espace via les 4 chemins du builder (mêmes relations Prisma que
   `getSpaceShops`, exprimées en `OR` de filtres relationnels plutôt qu'en SQL brut).
2. Les `LocationShopMapping` pointant vers l'un de ces éléments → vraies `salesLocationId`.

**Vérifié empiriquement contre la base réelle** (même espace/produits que BUG-332/333) :
- ~97 vraies locations résolues pour l'espace (contre 1 "location" — en réalité l'id d'intégration
  — avec l'ancien code).
- Cascade complet (`getSpaceScopedLatestPrices`+`ModalPrices`) : **257/346 produits résolus** via de
  vraies ventes de cet espace — quasiment le même total qu'avant (258/346), mais désormais par la
  bonne voie plutôt que par la fuite des niveaux 2/3 (voir BUG-336-02, qui supprime ces niveaux
  maintenant que le niveau 1 fonctionne réellement).

## Risque de régression / à surveiller

- Ce fix change le résultat des requêtes existantes même AVANT la suppression des niveaux 2/3
  (BUG-336-02) : le niveau 1 "réveillé" peut désormais absorber des produits qui étaient
  auparavant résolus par le niveau 2/3 avec un prix différent (vente d'un autre espace) — le prix
  affiché peut changer même sans le fix BUG-336-02. Les deux fixes sont livrés ensemble dans cette
  session, testés conjointement.
- `resolveSpaceLocationIds` était déjà défini (mort, jamais appelé en dehors d'un mock de test) —
  ce nom est réutilisé pour la version corrigée et fusionnée ; `resolveSpaceLocationScope` (l'ancien
  nom réellement utilisé) a disparu, tous ses appelants mis à jour.
- Non testé en environnement réel — à vérifier sur l'écran "Menu" (étape 3) avec un espace connu
  avant de considérer BUG-332/333/335/336 pleinement clos.

## Références

- [BUG-332-02](332_02_getlatestsalesprices_seq_scan_sans_filtre_tenant_502.md),
  [BUG-333-02](333_02_pricing_cascade_3_niveaux_sequentiels_toujours_trop_lent.md) — les deux
  premiers fixes de performance de cette même chaîne d'incident, dont les résultats mesurés
  (258/346) s'expliquent rétrospectivement par ce bug.
- [BUG-336-02](336_02_pricing_espace_supprime_niveaux_repli_autres_espaces.md) — suppression des
  niveaux 2/3, rendue possible et correcte par ce fix (sans lui, la suppression aurait ramené 0
  prix résolu partout).
- `frontend/docs/modules/05_INTEGRATIONS_VENTES.md` — distinction `LocationSpaceMapping`/
  `LocationShopMapping`, déjà documentée mais jamais recoupée avec ce code avant cette session.
