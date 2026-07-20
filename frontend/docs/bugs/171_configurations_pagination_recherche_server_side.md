# BUG-171 — Taxonomies Configurations : pagination + recherche réelles côté serveur pour les 10 écrans de liste

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (optimisation, pas une correction de comportement incorrect)
- **Domaine** : Menu & recettes / Achats & référentiels (Configurations)
- **Repo(s) concerné(s)** : `datafriday-web` + `api-datafriday-staging`
- **Découvert le** : 2026-07-19 (retour utilisateur en test live, suite au fix BUG-169)
- **Fichiers** : les 10 paires backend service/controller (`menu-items`, `menu-components`, `market-prices` taxonomy services, `brands`/`display-names`/`industrials`/`packing-types` services) + les 10 écrans de liste frontend (6 fichiers individuels Product/Component/MarketPrice + le composant générique partagé `FlatReferentialListView.vue` pour les 4 référentiels plats) + `MenuItemView.vue`/`componentListView.vue`/`MarketPriceListView.vue` (liens de suivi BUG-170, non retouchés ici)

## Symptôme

Après le fix BUG-169 (requêtes bornées à 200 lignes/appel, le store boucle pour reconstituer la
liste complète), l'utilisateur a fait remarquer que les 10 écrans de liste Configurations
téléchargeaient quand même **toute** la liste (juste en plusieurs appels bornés au lieu d'un seul
non borné) pour n'en afficher que 10 à la fois via la pagination client de `v-data-table`
(`Items per page: 10`) — inefficace dès qu'un tenant dépasse quelques centaines de lignes : chaque
visite de l'écran retélécharge tout, la recherche filtre côté client sur des données déjà
entièrement chargées.

## Cause racine

Le choix initial (BUG-169) de "tout charger dans le store, paginer/filtrer côté client" était
délibéré : ces mêmes modules Vuex sont aussi consommés comme source de `<select>` complète ailleurs
dans l'app (formulaires de création Menu Item/Component/MarketPrice, wizards d'import CSV — un audit
exhaustif a confirmé qu'aucun des 10 modules n'a moins de 2 consommateurs de ce type en dehors de
son propre écran de liste). Basculer directement en pagination serveur aurait cassé ces dropdowns
(qui ont besoin de la liste complète) ou la recherche existante (filtrage client sur tout ce qui est
chargé). D'où la nécessité de **découpler** : garder le mécanisme "liste complète" pour les
dropdowns, ajouter un mécanisme **séparé** de pagination+recherche serveur pour les écrans de liste
eux-mêmes.

## Correction

Implémenté en 4 chantiers parallèles (Product, Component, MarketPrice/Good, référentiels plats),
tous suivant **exactement** le pattern déjà en place et fonctionnel dans ce même projet pour
`/menu-items` (`MenuItemView.vue` + `getMenuItemsPage`) — mêmes noms de champs, même mécanique :

**Backend** (10 méthodes `findAll`/`getTypes`/`getCategories`, 10 contrôleurs) : ajout d'un
paramètre `search` optionnel, appliqué via `if (search) where.name = { contains: search, mode:
'insensitive' }` à l'intérieur du `where` existant (tenant scope + `typeId` pour les Category déjà
en place, non modifiés) — même idiome que `menu-items.service.ts` (`findAll` principal,
~ligne 483), lui-même déjà utilisé pour `/menu-items`.

**Frontend** — pour chacun des 10 écrans, remplacement du rendu basé sur le getter Vuex "liste
complète" par un état local dédié : `serverPage` (1), `serverItemsPerPage` (10, comme le footer
Vuetify par défaut), `serverTotal`, `serverLoading`, `serverRawItems`, avec `loadServerPage()` /
`reloadServerFirstPage()` / `onUpdateOptions()` (garde anti-double-fetch initial copiée de
`MenuItemView.vue`) et une recherche débouncée (300 ms) qui redéclenche un fetch serveur au lieu
d'un filtre client. `v-data-table` passe en mode serveur (`:items-length`, `@update:options`).

Les dispatches Vuex de création/édition/suppression (`addX`/`updateX`/`removeX`) sont **conservés**
— le cache "liste complète" du store reste à jour pour les dropdowns ailleurs dans l'app — mais
après succès, l'écran recharge sa propre page courante (`loadServerPage()`) au lieu de compter sur
la mutation optimiste du store pour son propre affichage. Le chip "N catégories" (Product/Component/
MarketPrice Type) continue de fonctionner : le backend inclut toujours `categories` sur la réponse
paginée des Types.

Pour les 4 référentiels plats, un seul point de changement grâce au refactor BUG-165 :
`FlatReferentialListView.vue` (composant générique) a reçu une nouvelle prop requise `getFn` (la
fonction GET paginée de l'entité) et porte tout le mécanisme ci-dessus une seule fois pour les 4
écrans. Cas particulier détecté et traité : `PackingTypeListView.vue` affichait le total *non
filtré* dans sa barre de recherche (`search-count-mode="total"`, divergence déjà connue depuis
BUG-165) — comme `serverTotal` reflète maintenant le compte *filtré* par la recherche, une méthode
`loadGrandTotal()` dédiée (`getFn({page:1, limit:1})`, léger) a été ajoutée pour ce mode spécifique
plutôt que de retélécharger toute la liste juste pour un compteur.

Le comportement de blocage de suppression (BUG-79/81/82 + le lien "Voir les N ... concernés" de
BUG-170) est **inchangé** sur les 3 paires Type/Category qui l'ont : seul le chemin de succès a été
modifié (rechargement de la page courante au lieu du mécanisme précédent), le `catch` n'a pas été
touché. Confirmé : les 4 référentiels plats n'avaient pas cette logique `blockedBy`/`actionLink`
(hors périmètre de BUG-170, qui ciblait uniquement les 3 paires ayant un écran cible filtrable).

## Risque de régression / à surveiller

Non testé en navigateur (pas de `pnpm dev` dans cette session) — à valider manuellement sur les 10
écrans, en particulier :
- Recherche : taper un terme doit filtrer côté serveur (pas de latence de frappe non désirée grâce
  au debounce 300 ms), le compteur doit refléter le total filtré (sauf PackingType, qui affiche le
  total non filtré via `loadGrandTotal()`).
- Changer de page / de taille de page doit déclencher un nouvel appel réseau, pas un simple
  re-slice côté client.
- Créer/éditer/supprimer une ligne doit rafraîchir la page actuellement affichée immédiatement,
  sans halluciner un doublon ni faire disparaître une ligne à tort.
- Les dropdowns ailleurs dans l'app (sélecteur de type/catégorie dans les formulaires Menu Item/
  Component/Market Price, wizards CSV) doivent toujours afficher la liste **complète** — vérifier
  qu'ils n'ont pas été affectés puisqu'ils continuent de lire le store Vuex "liste complète"
  inchangé.
- Le lien "Voir les N ... concernés" (BUG-170) doit continuer à fonctionner sur les 3 paires
  Type/Category lors d'une suppression bloquée.
- `PackingTypeListView.vue` : vérifier que le compteur "total" (non filtré) reste correct après
  une recherche active.

## Références

- [BUG-169](169_taxonomies_configurations_requetes_non_paginees.md) — le fix précédent (pagination bornée + boucle client) que ce fix complète, sans le remplacer : le mécanisme "liste complète" pour les dropdowns reste celui de BUG-169.
- [BUG-170](170_delete_bloque_sans_moyen_de_trouver_les_dependants.md) — comportement de suppression bloquée préservé à l'identique.
- [BUG-165](165_referentiels_plats_duplication_non_factorisee.md) — le refactor qui a permis un correctif unique pour les 4 référentiels plats au lieu de 4 séparés.
- Pattern de référence copié : `frontend/src/components/menu-fb/views/menu-items/views/MenuItemView.vue` + `frontend/src/api/endpoints/menu-item.api.js` (`getMenuItemsPage`), déjà en production pour `/menu-items`.
- Retour utilisateur direct en session de test live, 2026-07-19.
