# BUG-334-02 — `GET /weezevent/products?spaceId=...` bloque l'affichage du catalogue entier tant que le prix de CHAQUE produit n'est pas résolu

- **Statut** : ⚪ Diagnostiqué (proposition de conception, non implémentée — décision produit à
  valider avant de coder)
- **Sévérité** : 🟡 Mineur (UX — le fix BUG-332-02/333-02 a déjà ramené le pire cas mesuré à 13,7s,
  ce ticket porte sur le temps perçu et la résilience, pas sur un blocage fonctionnel)
- **Domaine** : Intégrations & ventes (wizard, étape 3) / Menu & recettes
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-08-18 — suite de BUG-332-02/333-02. Question d'Ulrich après le fix de
  perf : "pourquoi ne pas ramener progressivement les résultats au lieu de tout afficher un coup ?"
- **Fichiers** :
  - `backend/src/features/weezevent/weezevent.controller.ts:688-850` (`getProducts`)
  - `backend/src/shared/pricing/menu-item-pricing.service.ts` (les 6 fonctions de résolution de
    prix scopé espace, voir BUG-332-02/333-02)
  - `frontend/src/api/endpoints/aggregation.api.js:155-207` (`getWeezeventProducts`)
  - `frontend/src/components/integration/wizard/StepMapMenuItems.vue` (`loadData`, écran "Menu",
    étape 3 du wizard — affiche l'état vide "No product found for this integration" pendant toute
    la durée de l'appel)

## Symptôme (constat, pas un bug fonctionnel)

`GET /weezevent/products?spaceId=...` fait tout tenir dans **une seule requête synchrone** :
1. Lire le catalogue (`salesProduct.findMany` — quelques ms, déjà disponible).
2. Résoudre le prix de vente réel de **chaque** produit renvoyé (jusqu'à 500) via le cascade de
   repli à 3 niveaux × 3 recours (BUG-332-02/333-02) — le gros du temps de la requête.
3. Renvoyer catalogue + prix ensemble, d'un seul bloc.

Tant que l'étape 2 n'est pas intégralement terminée pour tous les produits, le front
(`StepMapMenuItems.vue`) n'a **rien** à afficher — l'utilisateur voit l'état vide "No product
found for this integration" pendant toute la durée de l'appel (jusqu'à 13,7s mesurés après
BUG-333-02, potentiellement plus sur un tenant encore plus gros), alors que le catalogue
lui-même est prêt en quelques millisecondes.

## Cause racine (design actuel, pas une erreur de code)

Le contrat de l'endpoint mélange deux opérations de nature très différente dans une seule requête
bloquante :
- **Rapide et stable** : lister les produits du catalogue (lecture indexée simple).
- **Lente et variable** : dériver un prix de vente réel par produit depuis l'historique de
  transactions (coût proportionnel au volume de ventes du tenant, voir BUG-332-02/333-02).

Cette seconde opération domine totalement le temps de réponse, et rien n'est renvoyé au client
avant qu'elle soit terminée pour l'ensemble des produits demandés.

## Proposition de conception (à valider avant implémentation)

Découpler catalogue et prix plutôt que les faire dépendre l'un de l'autre dans la même requête.
Deux niveaux d'ambition possibles :

**Option A — minimale (2 appels, pas de nouveau protocole)** :
1. `GET /weezevent/products` renvoie immédiatement le catalogue avec le prix catalogue
   (`basePrice` déjà en base), sans déclencher la résolution scopée-espace.
2. Un second appel (nouvel endpoint, ou le même avec un paramètre explicite) résout les prix de
   vente réels pour la liste de produits déjà affichée, et le front met à jour les lignes au fur
   et à mesure que la réponse arrive.
3. Le front (`StepMapMenuItems.vue`) affiche le catalogue dès l'étape 1 (fin de l'état vide
   immédiat), avec un indicateur de chargement par ligne/prix pendant l'étape 2.

**Option B — plus poussée (flux progressif réel)** : côté backend, traiter les produits par lots
(ex. 50 à la fois) et renvoyer chaque lot dès qu'il est prêt (SSE, réponse chunked, ou polling
d'un job). Résout aussi le cas où même le premier lot serait lent sur un tenant extrême, mais
demande un vrai changement de protocole HTTP et un travail front plus conséquent (gestion d'un
flux au lieu d'une promesse unique) — plus lourd, à réserver si l'option A s'avère insuffisante.

**Recommandation** : commencer par l'option A si validée — gain UX principal (le catalogue
n'attend plus le prix) pour un coût d'implémentation borné, sans casser le contrat des 3 autres
appelants de la cascade de prix (`menu-items.service.ts:1061,1218`, le endpoint de refresh produit
`weezevent.controller.ts:942`), qui n'ont pas le même besoin d'affichage progressif et peuvent
continuer à appeler le cascade de façon synchrone.

## Ce qu'il reste à trancher avant de coder

- Nouvel endpoint dédié, ou paramètre sur l'existant (`GET /weezevent/products` sans résolution de
  prix par défaut, prix résolu seulement si un flag est passé) ? Impact sur les autres consommateurs
  de cette route à vérifier avant de changer son comportement par défaut.
- Pagination des lots de prix côté front : tout envoyer en un seul second appel (simple, gain
  limité au "catalogue visible immédiatement"), ou vraiment par petits groupes (gain supplémentaire
  sur le temps total, complexité front supplémentaire) ?
- Cohérence avec les autres écrans qui consomment potentiellement le même contrat de données
  (`getWeezeventProducts` dans `aggregation.api.js` a d'autres appelants à vérifier avant de changer
  la forme de la réponse).

## Risque de régression / à surveiller

- Aucun code n'a été touché pour ce ticket — pure proposition de conception, à valider (Bertrand ?)
  avant tout travail d'implémentation.
- Si implémenté, bien vérifier que les 3 autres appelants de la cascade de prix
  (`menu-items.service.ts`, refresh produit) ne sont pas affectés par un changement de contrat sur
  l'endpoint catalogue.

## Références

- [BUG-332-02](332_02_getlatestsalesprices_seq_scan_sans_filtre_tenant_502.md),
  [BUG-333-02](333_02_pricing_cascade_3_niveaux_sequentiels_toujours_trop_lent.md) — les deux fixes
  de performance qui ont motivé cette question ; ce ticket porte sur le temps **perçu**, pas sur le
  temps de calcul brut déjà largement réduit par ces deux fixes.
