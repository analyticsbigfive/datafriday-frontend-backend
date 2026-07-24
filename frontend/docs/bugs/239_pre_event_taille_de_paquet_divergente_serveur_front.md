# BUG-239 — Pre-event : la casse de pack serveur et la conversion packed→unités du front n'utilisent pas la même taille de paquet

- **Statut** : 🟡 Corrigé non déployé (2026-07-24, branche `feat/postEventInventory` — backend à redéployer)
- **Sévérité** : 🟠 Majeur (attendus affichés et écarts de la réconciliation pre-event faux dès qu'un article porte une quantité/paquet saisie sur le menu item ≠ celle du MarketPrice — même classe de symptôme que [BUG-232](232_pre_event_expected_non_normalise_negatifs.md), cause différente et non corrigée par lui)
- **Domaine** : Stock — Pre-event Inventory × Logistique (voir `../modules/10_POST_EVENT_INVENTORY.md` §8.3/§8.4)
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-24 (vérification de l'implémentation Pre/Post-event contre la doc)
- **Fichiers** :
  - `backend/src/features/logistics/logistics.service.ts:232-253` (`resolveUnitsPerPackForItemKey` — MarketPrice.packedUnits → MenuComponent.packedUnits → MenuItem.inventoryNumberOfUnits), `:149-160` (`normalizeLevel`)
  - `backend/src/features/inventory/inventory.service.ts:447-504` (`computeExpected` — casse de pack avec la valeur ci-dessus)
  - `src/utils/inventoryUtils.js:486-491`, `:523-545` (résolution front d'`inventoryQuantityPackaged` — **MenuItem.inventoryNumberOfUnits prioritaire** dès qu'il vaut ≠ 1, décision dir 2026-07-13)
  - `src/views/SpaceInventoryView.vue:914-924` (`unitsPerItemIdMap`), `src/components/InventoryReconciliationView.vue:191-198` (conversion `packed × q + loose`)

## Symptôme

Sur un article dont la quantité/paquet a été saisie sur la fiche **menu item** (« Inventory
Information » → `inventoryNumberOfUnits`) avec une valeur différente de celle du **MarketPrice**
(`packedUnits`), l'écran Pre-event et son document de réconciliation affichent des attendus faux —
sans valeur négative cette fois (BUG-232 a supprimé ce symptôme-là), donc sans rien qui saute aux
yeux.

Exemple reproductible : article « Coca-Cola CAN 33cl », MarketPrice `packedUnits = 12`,
MenuItem `inventoryNumberOfUnits = 24`, attendu réel 36 unités.

| Étape | Taille de paquet utilisée | Résultat |
|---|---|---|
| Serveur : rejeu des mouvements + `normalizeLevel` | **12** (MarketPrice) | `expected = { packed: 3, loose: 0 }` |
| Front : caption « Attendu » sous le champ Packed | — | « Attendu : 3 » (packs de **24** à l'écran) |
| Front : vue réconciliation, colonne Attendu | **24** (menu item) | 3 × 24 = **72 unités** au lieu de 36 |

L'Écart (`compté − attendu`) et l'Écart € héritent de l'erreur : un comptage exact de 36 unités
s'affiche en manquant de 36 unités.

## Cause racine

Deux chaînes de résolution de la taille de paquet, de **priorités inverses**, appliquées de part et
d'autre de la même donnée :

- **Backend** (`logistics.service.ts:232-253`, consommé par `computeExpected`) :
  `MarketPrice.packedUnits` → `MenuComponent.packedUnits` → `MenuItem.inventoryNumberOfUnits`.
- **Front** (`inventoryUtils.js:523-545`) : `MenuItem.inventoryNumberOfUnits` **d'abord** (gate
  anti-défaut : uniquement si `> 0 && !== 1`), sinon `MarketPrice.inventoryQuantityPackaged` puis
  `MarketPrice.packedUnits`.

Les lignes pre-event sont volontairement persistées en **packed/loose bruts**, la conversion en
unités étant laissée au front (« le conditionnement est un référentiel front »,
`inventory.service.ts:566-568`). Ce partage n'est cohérent que si les deux côtés s'accordent sur le
diviseur — ce que rien ne garantit aujourd'hui, et que la doc §8.3 suppose implicitement en
affirmant « même chaîne MarketPrice → MenuComponent → MenuItem que la Logistique » (vrai du serveur,
faux du front).

Cas nominal non touché : le commentaire d'`inventoryUtils.js:523-528` note que « quasi tous les menu
items portent 1 » (valeur par défaut du formulaire) — l'override ne s'applique alors pas et les deux
chaînes convergent sur le MarketPrice. Le bug ne se manifeste que sur les articles où quelqu'un a
**réellement** saisi la quantité/paquet sur le menu item, c'est-à-dire les articles les plus
suivis.

## Correction

Corrigé le 2026-07-24 en rendant la **grandeur physique** (les unités) commune aux deux
référentiels, plutôt qu'en arbitrant lequel gagne — cet arbitrage reste ouvert (question #39) et
n'est plus bloquant pour la justesse des nombres.

- Nouveau `resolveInventoryUnitsPerPack(itemIds, tenantId)`
  ([inventory.service.ts](../../../backend/src/features/inventory/inventory.service.ts)) — miroir de
  la résolution front (`MenuItem.inventoryNumberOfUnits` si valeur d'intention `> 0 && ≠ 1`, sinon
  MarketPrice puis MenuComponent), résolu **en lot**.
- `computeExpected` fonctionne à deux régimes :
  - conditionnement d'inventaire **connu** (> 1) → calcul **en unités** : baseline convertie avec la
    taille de paquet de l'inventaire, chaque mouvement converti avec celle de la **Logistique**
    (l'unité dans laquelle il a été saisi), clamp ≥ 0 après chaque mouvement (équivalent unitaire de
    `normalizeLevel`), puis re-découpage final dans l'unité de l'écran ;
  - conditionnement **inconnu** → canaux packed/loose séparés, sémantique `normalizeLevel`
    historique strictement inchangée (aucune conversion fabriquée).
- Le blob `expected` et les lignes de réconciliation pre-event transportent `units` et
  `unitsPerPack` (null si inconnu) : `expectedUnits`, `countedUnits` et `deltaUnits` viennent du
  serveur, dans la même unité que le calcul.
- Front : `buildPreEventExpected` re-découpe le **même total d'unités** dans la taille de paquet du
  champ Packed affiché ([preEventExpected.js](../../src/utils/preEventExpected.js)) ;
  `InventoryReconciliationView` convertit avec le `unitsPerPack` **de la ligne** (photo figée) et ne
  retombe sur le référentiel courant que pour les documents antérieurs.

Exemple du symptôme, après correctif : baseline 5 cartons de 24 (120 u.) + livraison Logistic d'1
pack de 12 → 132 unités → « 5 cartons + 12 » à l'écran (avant : 6 « packs » d'une taille indécidable
selon le bout de la chaîne qu'on regardait).

Tests : 3 cas backend (`computeExpected — conditionnement inventaire vs logistique`) + 4 cas front
(`preEventExpected.spec.js` : re-découpage, accord des deux côtés, référentiel absent, `units` omis).

## Risque de régression / à surveiller

- Toute correction change les nombres affichés sur les documents pre-event **existants** (option 1)
  ou seulement sur les nouveaux (option 2) : choisir en connaissance de cause, et le dire aux
  utilisateurs qui ont déjà exploité un document.
- Vérifier au passage la cohérence avec la Logistique elle-même : `StockLevel` est normalisé avec la
  chaîne backend — si le front d'inventaire retient une autre taille de paquet, les deux modules
  continueront d'afficher des nombres de packs différents pour le même stock physique.
- Tests : `tests/unit/preEventExpected.spec.js` (10 tests) ne couvre que l'aplatissement du blob
  serveur, aucune conversion en unités — ajouter un test de bout en bout packed→unités avec deux
  référentiels divergents.

## Références

- [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) §8.3, §8.4
- [BUG-232](232_pre_event_expected_non_normalise_negatifs.md) (normalisation serveur — corrige la
  casse de pack, pas le désaccord sur sa valeur)
- [`../QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md) #39
- Voisin : [BUG-033](33_exceedscap_ignore_casse_de_pack_bloque_retrait_valide.md) (même famille
  « casse de pack »)
