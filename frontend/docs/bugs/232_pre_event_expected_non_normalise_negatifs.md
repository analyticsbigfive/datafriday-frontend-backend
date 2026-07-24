# BUG-232 — Pre-event Inventory : attendus « Expected » divergents de la Logistique, valeurs négatives (pas de casse de pack)

- **Statut** : 🟡 Corrigé non déployé (fix sur `feat/postEventInventory`, tests verts back 32/32 front 10/10 — backend à relancer/redéployer)
- **Sévérité** : 🔴 Bloquant/impact business (les attendus affichés au Directeur de site / Chef exécutif sont faux — négatifs impossibles physiquement, packs surestimés — et la réconciliation pre-event produit des écarts fantômes)
- **Domaine** : Stock — Pre/Post-event Inventory (voir `../modules/10_POST_EVENT_INVENTORY.md` §8) × Logistique
- **Repo(s) concerné(s)** : les deux (calcul backend + util front)
- **Découvert le** : 2026-07-23 (comparaison écran Pre-event ↔ module Logistique)
- **Fichiers** : `backend/src/features/inventory/inventory.service.ts:451-481` (recalcul attendu, somme brute), `backend/src/features/inventory/inventory.service.ts:368-391` (`aggregateMovementsSince`), `backend/src/features/logistics/logistics.service.ts:149-160` (`normalizeLevel`, la sémantique de référence), `src/utils/preEventExpected.js:34-67` (même somme brute côté front), `src/views/SpaceInventoryView.vue:1762-1771` (jointure par nom contre le référentiel affiché)

## Symptôme

Les quantités « attendues » affichées sous les champs Packed/Loose du Pre-event Inventory ne
correspondent pas aux stocks du module Logistique (source des mouvements), et peuvent être
**négatives** :

- Barre chocolatée (1A) : Logistique = 5 unités au total (3 boîtes, 2 en vrac) →
  Pre-event : « Expected » 5, « Loose » **-1**.
- Budweiser : Logistique = 2 unités, 0,5 en vrac → Pre-event : « Expected » **1**, « Loose » **-2**.

Mêmes valeurs fausses dans les lignes de la réconciliation pre-event (construites côté serveur
par la même logique), donc des `deltaPacked`/`deltaLoose` fantômes au save du comptage.

## Cause racine

Double cause, vérifiée dans le code :

1. **Pas de casse de pack ni de clamp dans le calcul des attendus.** L'attendu est une somme
   brute `baseline post-event + Σ packedDelta/looseDelta`
   (`inventory.service.ts:451-481` côté réconciliation, `preEventExpected.js:34-67` côté
   affichage), alors que la Logistique applique `normalizeLevel` **après chaque mouvement**
   (`logistics.service.ts:149-160` via `applyLevelDelta:197`) : quand le vrac passe négatif et
   qu'il reste des packs, elle « casse » des packs (`packed -= n ; loose += n × unitsPerPack`),
   puis clampe à 0. Un retrait de vrac servi par casse de pack côté Logistique apparaît donc en
   attendu comme un `loose` négatif avec un `packed` trop haut — exactement le symptôme.
   Le rejeu doit être **séquentiel** (mouvement par mouvement) : une normalisation unique en fin
   de somme diverge dès qu'un clamp/emprunt a eu lieu en cours de séquence.
   Note : l'en-tête de `preEventExpected.js` documentait « deltas négatifs conservés tels quels »
   comme décision du 2026-07-20 — **décision révoquée par l'utilisateur le 2026-07-23** (les
   négatifs sont un bug, pas un signal).
2. **Mouvements non joignables silencieusement ignorés.** La jointure `StockMovement.itemKey`
   (nom libre) → item se fait par nom normalisé, côté front contre le référentiel *affiché*
   (`SpaceInventoryView.vue:1762-1771`, drop silencieux `preEventExpected.js:58`) et côté backend
   contre les `MenuItem` du tenant seulement (`inventory.service.ts:473`) — alors que la
   Logistique résout ses `unitsPerPack` sur MarketPrice → MenuComponent → MenuItem
   (`resolveUnitsPerPackForItemKey`, `logistics.service.ts:232-253`). Un mouvement non joint
   n'entre jamais dans l'attendu → sous-estimation (Budweiser : packed 1 au lieu de 2).

Secondaire (non corrigé ici, à suivre) : fenêtre de mouvements sans borne haute
(`createdAt > snapshot.createdAt` jusqu'à « maintenant »), « événement précédent » ancré sur
`now` et non sur l'événement cible, consommation dérivée des ventes non rejouée.

## Correction

Sur `feat/postEventInventory` (même session que cette fiche) :

- **Backend, chemin unique** : nouvelle méthode `computeExpected` dans `InventoryService` qui
  rejoue les `StockMovement` **séquentiellement** depuis le snapshot post-event précédent en
  appliquant `LogisticsService.normalizeLevel` après chaque mouvement (mêmes `unitsPerPack` via
  `resolveUnitsPerPackForItemKey`, rendue publique ; `LogisticsService` exporté puis injecté).
  Jointure par mouvement (`menuItemId` d'abord, sinon nom normalisé → MenuItem) ; les non-joints
  sont **surfacés** (`unjoinedItemKeys` + warning log) au lieu d'être avalés.
- `GET /inventory/:spaceId/pre-event-baseline/:eventId` : réponse **additive** — champs
  `expected` (blob normalisé par élément × item) et `unjoinedItemKeys` ajoutés, `baseline` et
  `movements` conservés pour compat.
- `POST /inventory/:spaceId/pre-event-reconciliations` : consomme `computeExpected` — les hints
  à l'écran et les lignes de réconciliation ne peuvent plus diverger.
- **Front** : `buildPreEventExpected` consomme `expected` pré-normalisé quand présent (la
  jointure fragile côté front disparaît) ; l'ancienne somme brute reste en repli legacy tant que
  le backend n'est pas redéployé (leçon BUG-228 : build backend périmé = symptôme trompeur).

## Risque de régression / à surveiller

- Sémantique « baseline null → attendu — » (jamais de 0 fabriqué) : conservée, à re-vérifier.
- Tests ajoutés : repro barre chocolatée (casse de pack, jamais de vrac négatif), rejeu
  séquentiel ≠ somme finale, mouvement non joignable surfacé, `expected: null` sans snapshot,
  lignes de réconciliation = valeurs du GET ; côté front, passthrough du blob `expected` et
  conservation du repli legacy.
- **Redéployer/relancer le backend** après merge (réponse d'endpoint modifiée — cf. BUG-228).
- Vérifier en manuel les deux cas chiffrés ci-dessus contre le module Logistique.
- `unitsPerPack` non résolu (nom absent des trois référentiels) ⇒ pas de casse possible, clamp
  seul, comme en Logistique — surveiller les warnings `unjoinedItemKeys` dans les logs.

## Références

- [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) §8 (calcul
  des attendus, mis à jour avec cette correction).
- [`228_inventory_snapshot_kind_rejete_backend_perime.md`](228_inventory_snapshot_kind_rejete_backend_perime.md)
  (même flux, réflexe « build backend périmé »).
- [`222_inventory_reconciliation_fallback_plus_vieux_match.md`](222_inventory_reconciliation_fallback_plus_vieux_match.md)
  (création des réconciliations, session voisine).
- Fuite de permission associée (non corrigée ici) :
  [`233_pre_event_expected_fuite_via_reconciliations.md`](233_pre_event_expected_fuite_via_reconciliations.md).

---

Rédaction : **JLH**, 2026-07-23.
