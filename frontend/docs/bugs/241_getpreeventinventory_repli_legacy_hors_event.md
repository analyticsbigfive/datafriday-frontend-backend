# BUG-241 — `getPreEventInventory` : le repli legacy prend n'importe quel snapshot du space, tous events et toutes phases confondus

- **Statut** : 🟡 Corrigé non déployé (2026-07-24, branche `feat/postEventInventory` — migration SQL + redéploiement backend requis)
- **Sévérité** : 🟠 Majeur (le « stock de départ » d'une réconciliation post-event peut venir d'un **autre match** sans que rien ne l'indique — `Qty left`, `Missing` et `Miss €` sont alors calculés contre un stock étranger ; contredit la règle owner « un match = un eventId, aucune bascule silencieuse »)
- **Domaine** : Stock — Post-event Inventory (voir `../modules/10_POST_EVENT_INVENTORY.md` §7.2, §12.4)
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-07-24 (vérification de l'implémentation Pre/Post-event contre la doc)
- **Fichiers** : `backend/src/features/inventory/inventory.service.ts:318-358` (`getPreEventInventory`), en particulier `:340-351` (repli legacy) et le commentaire `:340-343`

## Symptôme

Génération d'une réconciliation post-event pour le match N, alors qu'aucun comptage Pre-event
Inventory n'a été clôturé pour N (cas courant : l'écran Pre-event n'est pas encore dans les
habitudes, ou l'équipe a compté sans cliquer « Générer la réconciliation »).

Le document est produit avec des colonnes `Qty left` / `Missing` / `Miss €` **renseignées** — donc
crédibles — alors que le « pré-event » utilisé est en réalité le dernier snapshot du space antérieur
au jour du match : typiquement le snapshot **post-event du match N−1**, éventuellement un snapshot
pre-event d'un match encore plus ancien. Rien dans le document, la vue ou un log ne dit de quel
snapshot il s'agit.

Conséquence chiffrée : `Missing = (stock d'un autre match − ventes de N) − compté`. L'écart absorbe
tout ce qui s'est passé entre les deux dates (livraisons, transferts, pertes Logistic), sans lien
avec un manquant réel.

## Cause racine

```ts
// 2) Legacy : heuristique de date (un comptage fait le jour du match est
// considéré post-match). kind:null uniquement — …
const snapshot = await this.prisma.inventorySnapshot.findFirst({
  where: { tenantId, spaceId, createdAt: { lt: dayStart } },
  orderBy: { createdAt: 'desc' },
});
```

(`inventory.service.ts:340-351`)

Le filtre ne porte **ni sur `eventId` ni sur `kind`** — contrairement à ce que son propre
commentaire annonce (« kind:null uniquement »). Toute la sélection repose sur `createdAt < dayStart`,
c'est-à-dire sur une heuristique de date à l'échelle du space entier.

Ce repli est antérieur à la décision owner du 2026-07-24 (§12.4 : « un match = un eventId, aucune
bascule silencieuse »), qui a supprimé les replis silencieux **côté front** (`resolveEventContext`,
`resolveReconciliationEvent`) sans que le pendant serveur soit revu. Le chemin nominal
(`:327-338`, snapshot `kind='pre-event'` du même event) est, lui, correct et ferme bien le cycle.

La doc l'annonce comme un comportement voulu (§7.2 « repli legacy = dernier snapshot antérieur au
jour de l'event » et §7.5 limite 1 « définition par défaut à valider ») — la fiche existe pour
signaler que ce défaut est devenu **incohérent** avec une décision prise depuis, et qu'il est
aujourd'hui le chemin **le plus fréquent**, pas un cas résiduel de données historiques.

## Correction

Corrigé le 2026-07-24 en combinant les options 3 et 2 ci-dessus : repli scopé au cycle documenté,
et provenance tracée jusqu'à l'écran.

- `getPreEventInventory` ([inventory.service.ts](../../../backend/src/features/inventory/inventory.service.ts)) :
  1. snapshot `kind='pre-event'` du **même** event → `source: 'pre-event'` ;
  2. sinon snapshot `kind='post-event'` du **match précédent** (`eventDate` strictement antérieure à
     celle de la cible) → `source: 'previous-post-event'` + `previousEvent` renvoyé ;
  3. sinon `null` → colonnes « — ».

  L'heuristique « dernier snapshot du space avant le jour du match », tous events et toutes phases
  confondus, disparaît. Le commentaire mensonger (`kind:null uniquement`) aussi.
- La provenance voyage avec le document : le front la transmet (`preEventSource`), le backend
  l'archive dans `StockReconciliation.meta` (migration
  [`2026-07-24_stockreconciliation_meta.sql`](../../../backend/prisma/sql/2026-07-24_stockreconciliation_meta.sql)),
  et `InventoryReconciliationView` affiche un bandeau explicite quand le stock de départ vient du
  match précédent (« les mouvements Logistic intermédiaires ne sont pas déduits ») ou qu'il n'y en a
  pas du tout.

Conséquence assumée : un document créé sans comptage d'avant-match affiche désormais un
avertissement, ou « — » là où il affichait des nombres silencieusement approximatifs. Si le métier
préfère l'option 1 (strict, aucun repli), c'est l'objet de la question #38.

Tests : 3 cas backend (`getPreEventInventory — provenance du stock de départ`).

## Risque de régression / à surveiller

- Option 1 : des documents jusque-là « complets » deviennent partiellement « — ». Prévenir les
  utilisateurs, sinon le changement passera pour une régression.
- Vérifier `tests/unit/postEventReconciliation.spec.js` (11 tests) : la sémantique `preEventUnitsByKey = null`
  → `leftFromSales`/`missingUnits`/`missingValue` à `null` est déjà couverte côté front, c'est le
  test backend de `getPreEventInventory` qui doit être étendu.
- Les documents déjà archivés gardent leurs valeurs (photo figée) : ils ne sont pas recalculés.

## Références

- [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) §7.2 (tableau des
  sources), §7.5 (limite 1), §8.1 (cycle), §12.4 (ancrage strict)
- [BUG-237](237_post_event_prerempli_par_comptage_pre_event.md) (même racine produit : les deux
  phases ne sont pas distinguées dans la donnée)
- [`../QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md) #38
