# BUG-336-02 — Prix "de l'espace" : suppression des niveaux de repli 2/3 (ventes non attribuées / globales) — un produit jamais vendu dans CET espace n'emprunte plus le prix d'un autre

- **Statut** : 🟡 Corrigé non testé (2026-08-18, branche `fix/products-price-query-tenant-scope`)
- **Sévérité** : 🟠 Majeur (correction produit — la donnée n'était pas fausse techniquement, mais
  trompeuse : un prix affiché comme "de cet espace" pouvait venir d'ailleurs sans le signaler)
- **Domaine** : Intégrations & ventes (wizard, étape 3) / Menu & recettes
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-18 — décision explicite d'Ulrich après explication du fonctionnement
  du cascade de repli : *"la première erreur vient du niveau 2 ; tout élément non mappé à l'étape
  2, on ne doit même pas récupérer les ventes dans cette location. Pourquoi tu veux calculer les
  ventes dans un lieu qu'on refuse de gérer"* — et confirmation explicite de limiter au niveau 1
  seul (*"on doit limiter désormais qu'à cette espace ; et rien d'autre"*).
- **Fichiers** :
  - `backend/src/shared/pricing/menu-item-pricing.service.ts` — les 6 fonctions
    `getSpaceScopedLatestPrices`/`ModalPrices` et leurs variantes `ByName`/`ByWeezeventId`

## Symptôme (avant fix)

`GET /weezevent/products?spaceId=...` (étape 3 du wizard) pouvait afficher, pour un produit jamais
vendu sur les points de vente de l'espace courant, un prix pêché ailleurs :
- Niveau 2 : ventes de locations **non mappées à aucun espace** — supposé "probablement cet espace,
  juste pas encore mappé", en réalité indiscernable d'un point de vente délibérément exclu.
- Niveau 3 : ventes de **n'importe quelle location, y compris celles d'un AUTRE espace/événement**
  géré sous la même intégration Weezevent.

Rien à l'écran ne distinguait un prix "réellement vendu ici" d'un prix "emprunté" (voir échange
précédent : le champ `priceSource` existe côté backend mais n'est lu nulle part côté front,
`StepMapMenuItems.vue`).

## Cause racine

Design d'origine documenté en commentaire : *"jamais 0 si une vente existe"* — un choix délibéré de
ne jamais afficher un prix vide/nul tant qu'une vente existait quelque part, quitte à l'attribuer à
tort à cet espace. Ce choix supposait implicitement qu'une location non mappée à un espace était
"probablement la nôtre, juste pas encore rattachée" — une hypothèse qui ne tient pas : l'étape 2 du
wizard (`LocationShopMapping`) est l'endroit où l'utilisateur choisit explicitement quelles
locations appartiennent à quel espace. Une location non mappée n'est pas un oubli par défaut, c'est
un point de vente que l'espace ne gère pas (ou pas encore, mais dans ce cas le prix RESTERA vide
jusqu'à ce que le mapping soit fait — ce qui est le signal correct pour agir, pas un prix deviné qui
masque le problème).

Ce choix reposait par ailleurs sur un niveau 1 qui, avant BUG-335-02, ne fonctionnait jamais — donc
en pratique, TOUT produit avec une vente quelque part dans le compte passait systématiquement par
les niveaux 2/3, jamais par le vrai niveau 1. Le "filet de sécurité" était devenu le chemin normal.

## Correction

Corrigée en code le 2026-08-18, en même temps que BUG-335-02 (prérequis : le niveau 1 doit
fonctionner réellement avant de pouvoir supprimer les autres sans tout casser). Les 6 fonctions de
prix scopé-espace ne font plus qu'une seule requête, restreinte aux vraies locations de l'espace
(`resolveSpaceLocationIds`, corrigé par BUG-335-02) :

```ts
async getSpaceScopedLatestPrices(tenantId, spaceId, productIds, opts = {}) {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const spaceLocationIds = await this.resolveSpaceLocationIds(tenantId, spaceId);
  if (!spaceLocationIds.length) return new Map();
  return this.getLatestSalesPrices(tenantId, ids, { locationIds: spaceLocationIds, eventIds: opts.eventIds });
}
```

Un produit sans vente sur les locations mappées à cet espace n'a plus de prix résolu ici — le
contrôleur (`weezevent.controller.ts::getProducts`) retombe alors sur `priceSource: 'catalog'`
(prix catalogue figé, déjà le comportement existant pour ce cas), sans emprunter la valeur d'un
autre espace.

**Vérifié empiriquement contre la base réelle**, même espace/produits que BUG-332/333/335 :
257/346 produits résolus (quasiment inchangé par rapport aux 258/346 mesurés avant — la fuite des
niveaux 2/3 atterrissait déjà, par accident, sur des valeurs proches de la bonne réponse la plupart
du temps ; les ~89 produits restants affichent maintenant honnêtement "pas de vente ici" au lieu
d'un prix potentiellement emprunté à un autre événement).

**Gain de performance en prime** : chaque fonction ne fait plus qu'1 requête au lieu de 3 —
le cascade complet (les 3 étapes du contrôleur : par produit, par item Weezevent, par nom) devrait
mesurer nettement moins que les 13,7s de BUG-333-02, puisque 2 des 3 niveaux de chaque étage ont
disparu. Non re-mesuré séparément dans ce ticket (mesure combinée avec BUG-335-02 ci-dessus).

## Risque de régression / à surveiller

- **Changement de donnée visible** : des produits qui affichaient un prix (emprunté) afficheront
  désormais `0`/catalogue. C'est le comportement voulu, mais à annoncer si des utilisateurs
  s'attendaient à voir "un" prix plutôt que "pas de prix" pour ces cas.
- Pas de distinction visuelle ajoutée entre "jamais vendu ici" et "prix catalogue à 0 par défaut" —
  reste la même limitation qu'avant (identifiée mais non traitée, voir BUG-334-02 sur
  l'affichage progressif, sujet voisin mais distinct).
- Non testé en environnement réel.

## Références

- [BUG-335-02](335_02_resolvespacelocationids_mauvaise_table_niveau1_jamais_fonctionne.md) —
  prérequis direct : sans lui, ce ticket viderait tous les prix au lieu de les rendre honnêtes.
- [BUG-332-02](332_02_getlatestsalesprices_seq_scan_sans_filtre_tenant_502.md),
  [BUG-333-02](333_02_pricing_cascade_3_niveaux_sequentiels_toujours_trop_lent.md) — chaîne
  d'incident complète sur cette même route.
