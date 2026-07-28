# BUG-237 — Post-event Inventory s'ouvre pré-rempli et « 100 % compté » avec les saisies du Pre-event du même match

- **Statut** : 🟡 Corrigé non déployé (2026-07-24, branche `feat/postEventInventory` — backend à redéployer)
- **Sévérité** : 🟠 Majeur (un clic sur « Générer la réconciliation » archive un snapshot post-event **égal au comptage d'avant-match** ; la garde « comptage incomplet » ne se déclenche jamais, et ce faux post-event devient la baseline de l'attendu du match suivant)
- **Domaine** : Stock — Pre/Post-event Inventory (voir `../modules/10_POST_EVENT_INVENTORY.md` §8.5)
- **Repo(s) concerné(s)** : les deux (modèle backend + affichage front)
- **Découvert le** : 2026-07-24 (vérification de l'implémentation Pre/Post-event contre la doc)
- **Fichiers** :
  - `src/store/modules/inventory.js:111` (`loadInventory` — clé `(spaceId, eventId)`, aucune notion de phase)
  - `src/store/modules/inventory.js:176` (`upsertCount` — le payload `POST /inventory-counts` ne porte pas `kind`)
  - `backend/src/features/inventory/inventory.service.ts:21-66` (`getBySpaceAndEvent`), `:691-708` (`buildInventoryCounts` renvoie `isCounted`/`countingStatus`)
  - `src/views/SpaceInventoryView.vue:1415` (ancrage post = `past[0]`, soit le MÊME event que le pre une fois le match passé), `:1547` (`isItemCounted`), `:1234` (`isCountComplete`), `:1701` (garde douce)

## Symptôme

Cycle nominal d'un match N :

1. Avant le match, `/spaces/:spaceId/pre-inventory` (event N) — l'équipe compte, chaque article
   passe à « compté ».
2. Après le match, `/spaces/:spaceId/inventory` (ancrage strict « dernier event fini » = **event N**,
   §12.4) : l'écran s'ouvre avec **toutes les quantités du comptage d'avant-match déjà saisies**,
   tous les articles marqués « Comptés », le compteur du bouton affichant « 128/128 ».

Conséquences immédiates :

- l'onglet « À compter » est vide : impossible de savoir ce qui reste réellement à recompter ;
- la garde douce d'`onSaveAll` (dialog « comptage incomplet ») ne s'affiche jamais, puisque
  l'inventaire est vu comme complet ;
- un clic direct sur « Générer la réconciliation » sauvegarde un snapshot `kind='post-event'`
  strictement égal au comptage pre-event.

Effet chiffré sur le document produit dans ce cas (formules §9.1) :
`missing = (preEvent − sold) − counted` avec `counted = preEvent` → `missing = −sold`, c'est-à-dire
un **surplus égal au volume vendu** sur chaque ligne. Et au cycle suivant, l'attendu du pre-event
N+1 part de ce snapshot : stock surestimé exactement du volume vendu pendant N.

## Cause racine

`InventoryCount` est keyé `(tenantId, spaceId, eventId, shopId, itemId)` — **la phase n'entre pas
dans la clé**. Or, depuis l'ancrage strict « un match = un eventId » (§12.4), le Pre-event du match
N et le Post-event du match N portent volontairement le **même `eventId`**. Les deux écrans lisent
et écrivent donc les mêmes lignes :

- `loadInventory` (`src/store/modules/inventory.js:111`) charge `GET /inventory/:spaceId/:eventId`
  sans discriminant de phase ;
- `getBySpaceAndEvent` donne la priorité aux lignes `InventoryCount` sur le snapshot
  (`inventory.service.ts:39-51`) et renvoie `isCounted` tel quel (`:691-708`) ;
- rien, à l'ouverture du mode post, ne remet à zéro ni les quantités ni le flag `isCounted`.

La doc mentionne le partage des lignes (`10_POST_EVENT_INVENTORY.md` §8.5, limite 1) mais dans le
**sens inverse** (« rouvrir l'écran Pre-event après le début du comptage post affiche les saisies
post — assumé »). Le sens dangereux — le post démarre pré-rempli ET déjà validé — n'était ni
documenté ni tranché.

## Correction

Corrigé le 2026-07-24 **sans changement de schéma** : la phase du comptage est déduite des
horodatages existants, ce qui évite la migration + backfill de l'option 3 tout en supprimant le
danger.

- `GET /inventory/:spaceId/:eventId?phase=pre-event|post-event`
  ([inventory.controller.ts](../../../backend/src/features/inventory/inventory.controller.ts)) —
  paramètre optionnel, absence = comportement historique.
- `getBySpaceAndEvent(..., phase)` ([inventory.service.ts](../../../backend/src/features/inventory/inventory.service.ts)) :
  en phase `post-event`, charge le dernier snapshot `kind='pre-event'` de l'événement et traite
  toute ligne `InventoryCount` dont l'`updatedAt` lui est **antérieur** comme une saisie
  d'avant-match → `isCounted: false`, `countingStatus: 'pending'`, drapeau `carriedFromPreEvent`.
  Les **valeurs** sont conservées (proposition utile au recomptage). Même règle sur le repli
  snapshot (`asProposal`).
- Front : `loadInventory` transmet la phase (`isPreMode ? 'pre-event' : 'post-event'`,
  [SpaceInventoryView.vue](../../src/views/SpaceInventoryView.vue)) ; la phase entre dans la clé de
  déduplication du store ([inventory.js](../../src/store/modules/inventory.js)) ; bandeau
  `invPostCarriedHint` (« les quantités affichées viennent du comptage d'avant-match — recomptez »)
  dès qu'une ligne est reprise.

Effets : l'onglet « À compter » retrouve son sens, la garde douce se redéclenche, et un clic sans
recomptage ne peut plus archiver un post-event égal au pre-event.

Reste ouvert (question #38) : faut-il aller jusqu'à **ne plus pré-remplir** les valeurs ? Le
correctif retient la variante la moins destructive.

Tests : 4 cas dans `backend/src/features/inventory/inventory.service.spec.ts`
(« getBySpaceAndEvent — phase de comptage ») — ligne antérieure requalifiée, ligne postérieure
intacte, absence de phase = comportement historique, absence de snapshot pre-event = no-op.

## Risque de régression / à surveiller

- Option 2 et 3 : vérifier que la réconciliation **post-event** continue de lire le pre-event via
  `getPreEventInventory` (snapshot kindé, pas les `InventoryCount`) — c'est déjà le cas
  (`inventory.service.ts:318-338`), donc le reset ne casse pas le calcul de `leftFromSales`.
- Option 3 : `saveInventoryCounts` a une gestion TOCTOU/P2002 adossée à l'index unique
  (`inventory.service.ts:162-200`) — l'index `NULLS NOT DISTINCT` doit être recréé avec la nouvelle
  colonne.
- Données déjà produites : les snapshots `kind='post-event'` créés depuis la mise en service des
  deux écrans peuvent être des copies du pre-event. À vérifier avant de s'appuyer dessus comme
  baseline (requête : snapshots post-event dont le blob est identique au snapshot pre-event du même
  event).

## Références

- [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) §8.5 (limite 1),
  §12.4 (ancrage strict, chantier « séparation physique des `InventoryCount` pre/post »)
- [`../QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md) #38
- Voisin : [BUG-236](236_reconciliation_section_inaccessible_mobile.md), [`033`](33_exceedscap_ignore_casse_de_pack_bloque_retrait_valide.md)
