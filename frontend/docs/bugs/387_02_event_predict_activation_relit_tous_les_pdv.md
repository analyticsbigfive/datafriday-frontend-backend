# BUG-387-02 — Event Predict : activer un article ou un PDV relisait le menu de TOUS les PdV de la config

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (remontée client, confort de saisie)
- **Domaine** : Event Predict
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-09-22 (suite du retour Bertrand du 2026-09-17)
- **Fichiers** : `src/utils/shopMenuAssignmentMaps.js` (nouveau),
  `src/store/modules/shopMenuAvailability.js`,
  `src/components/space-workspace/event-predict/views/EventPredictView.vue`
  (`loadShopMenuAssignment`, `_patchAssignmentForShops`, `handleAssignShopItem`,
  `handleAssignShopItems`, `handleAssignItemAllShops`)

## Symptôme

« Quand on active un Menu Item ou un PDV dans Event Predict (colonne de gauche) ça recharge
toute la page. La personne ne sait plus sur quel PDV ou Menu Item elle était en train de
travailler. »

Deux gênes distinctes sous une même phrase :

1. **la perte du repère** : l'onglet Configuration entier était remplacé par un skeleton
   (`v-if="predictSectionTab === 'configuration' && !adjustedReady"`), donc démonté, scroll et
   PdV dépliés perdus. **Corrigé le 2026-09-17** (`5fb0000f`, en production) : `_assignmentLoaded`
   ne repasse plus à `false` sur un simple rafraîchissement ;
2. **l'attente**, qui restait entière et se lit toujours comme un rechargement. C'est l'objet de
   cette fiche.

## Cause racine

Chaque activation faisait, après le PATCH : purge de `_shopMenuAssignmentCache[cfgId]`, purge du
store `shopMenuAvailability` pour le shop, puis `loadShopMenuAssignment()` complet, c'est-à-dire
`/shops` pour l'espace **puis `GET /space-menu/shop/:id/items` pour CHAQUE PdV de la config**,
3 en vol. Stade Jean Bouin compte 53 éléments PdV : quelques dizaines de requêtes pour un seul
article coché, alors que le delta était parfaitement connu (un couple PdV × article, déjà écrit
en base par le PATCH qui vient de réussir).

La purge du store de disponibilité (BUG-291-02, pour qu'un article réactivé ne reste pas exclu
jusqu'au TTL de 15 min) rendait en plus le clic suivant aussi coûteux que le premier.

## Correction

Correctif du 2026-09-22.

1. **Dérivation extraite et partagée** : `utils/shopMenuAssignmentMaps.js` porte
   `deriveShopMenuEntry` (les 4 index d'un shop : auto-sélectionnables, liste affichée,
   appartenance, indisponibilité), `patchShopMenuMaps` (réécrit UN shop, renvoie des Map neuves)
   et `applyEnabledChanges` (applique un delta d'activation à des lignes `/items`).
   `loadShopMenuAssignment` consomme la même fonction : une seule implémentation des règles
   d'inclusion, qui ont déjà bougé deux fois (BUG-291-02 et son correctif v2 le même jour).
2. **Patch en mémoire** : `_patchAssignmentForShops(entries)` reconstruit le seul PdV touché
   depuis les lignes déjà en cache, et met à jour `shopMenuAvailability` par le même delta
   (nouvelle action `patchEnabledForShop`, `cachedAt` conservé) au lieu de le purger. Branché sur
   les trois écritures : toggle unitaire, « Select All » d'un PdV, et article ajouté à tous les
   PdV. Zéro requête de relecture.
3. **Repli conservé** : le lot est vérifié à sec avant toute écriture ; assignation pas encore
   chargée, cache du shop vide ou expiré, ou article hors roster (cas du remap, qui change
   l'appartenance) → `loadShopMenuAssignment()` complet, comme avant. `applyRemap` reste sur ce
   chemin par construction.

## Risque de régression / à surveiller

- Tests : `tests/unit/shopMenuAssignmentMaps.spec.js` (13 cas : dérivation, gardes
  anti-backend-legacy, suppression de clé quand le dernier article est décoché, Map neuves,
  article hors roster non patchable) et 2 cas ajoutés à
  `tests/unit/shopMenuAvailabilityStore.spec.js`.
- À retester à la main : cocher/décocher un article (la ligne bascule sans attente ni saut),
  fermer un PdV en décochant son dernier article (il doit repasser « Closed »), « Select All »,
  « ajouter l'article à tous les PdV », puis changer d'event et revenir (le cache par config doit
  servir l'état patché, pas celui d'avant le clic).
- Point de vigilance : `available` est supposé indépendant de `enabled` (la produisibilité
  dépend de la recette, des ingrédients et du fournisseur). Si le backend venait à faire dépendre
  l'une de l'autre, le patch local divergerait et il faudrait revenir au refetch.
- Le store lourd `shopMenuItems` (recettes, Inventaire/Restock) reste purgé à chaque écriture :
  inchangé, il n'alimente pas cet écran.

## Références

- Commit `5fb0000f` (2026-09-17) — volet « perte du repère » : plus de skeleton à l'activation.
- [BUG-291-02](291_02_eventpredict_menuitem_indisponible_compte_comme_vente.md) — `available` fait foi,
  source de la purge du cache de disponibilité que ce lot remplace par un patch.
- [BUG-364-01](364_01_analyse_payload_memoire_concurrence.md) — même famille : le grain demandé
  au serveur doit être celui dont l'écran a besoin.
