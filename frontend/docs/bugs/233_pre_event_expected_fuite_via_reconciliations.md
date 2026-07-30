# BUG-233 — Pre-event Inventory : les attendus fuient via les documents de réconciliation (gating `preInventoryExpected` contournable)

- **Statut** : 🟡 Corrigé non déployé (2026-07-24, branche `feat/postEventInventory`)
- **Sévérité** : 🟠 Majeur (contournement du gating serveur des quantités attendues — biais de comptage possible, la raison d'être du gating)
- **Domaine** : Stock — Pre-event Inventory / RBAC (voir `../modules/10_POST_EVENT_INVENTORY.md` §8.3)
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-07-23 (exploration BUG-232)
- **Fichiers** : `backend/src/features/inventory/inventory.controller.ts:50-62` (GET `:spaceId/reconciliations`, permission de classe seule), `:82-97` (POST `:spaceId/pre-event-reconciliations`, idem), `:64-65` (le GET pre-event-baseline, lui, correctement gaté), `backend/src/features/inventory/inventory.service.ts` (`listInventoryReconciliations`, `createPreEventReconciliation` — lignes avec `expectedPacked/Loose`)

## Symptôme

La permission `front.fb.preInventoryExpected` gate le GET `pre-event-baseline` (403 pour un
compteur sans le droit — voulu : il doit compter à l'aveugle, § 8.3). Mais les MÊMES quantités
attendues sont accessibles à tout porteur de `front.fb.spaceInventory` (la permission de classe,
que tout compteur possède) par deux autres chemins :

1. `POST /inventory/:spaceId/pre-event-reconciliations` — la réponse contient les `lines[]`
   construites côté serveur avec `expectedPacked`/`expectedLoose` par PDV × article ;
2. `GET /inventory/:spaceId/reconciliations` — le listing renvoie les documents pre-event
   complets, `lines` incluses.

Un compteur peut donc générer (ou simplement lister) une réconciliation pre-event et lire les
attendus qu'on lui cache à l'écran de comptage — le biais que le gating serveur devait empêcher.

## Cause racine

Aucun décorateur méthode sur ces deux routes : elles héritent de la permission de **classe**
`@RequirePermissions('front.fb.spaceInventory')` (`inventory.controller.ts:25`). Le gating
`preInventoryExpected` n'a été posé que sur `GET pre-event-baseline` (`:64-65`). La construction
des lignes côté serveur (voulue précisément parce que le client peut ne pas avoir la permission)
rend la fuite d'autant plus directe : le serveur fabrique et renvoie ce qu'il refuse par ailleurs.

Nuance métier : le workflow VEUT qu'un compteur puisse déclencher le save + la réconciliation
(fin de comptage) — gater le POST entier sur `preInventoryExpected` casserait le flux. Le
problème est la **réponse** (et le listing), pas l'existence de l'action.

## Correction (2026-07-24)

Piste (a) retenue et implémentée — **expurgation conditionnelle des réponses**, l'action reste
ouverte à tout compteur (le flux « Sauvegarder → réconciliation » ne casse pas) :

- `inventory.controller.ts` : helper `canSeeExpected(user)` (même logique que
  `PermissionsGuard` : ADMIN systemKey = tout, sinon `user.role.permissions` contient
  `front.fb.preInventoryExpected`), booléen passé au service par
  `listInventoryReconciliations` et `createPreEventReconciliation`.
- `inventory.service.ts` : `redactPreEventDoc()` — sur les documents `kind='pre-event'`
  uniquement, retire des `lines[]` : `expectedPacked/Loose` **ET** `deltaPacked/Loose`
  (delta seul suffirait à reconstruire : `expected = counted − delta`). Les post-event
  (lignes fournies par le client, aucune donnée cachée) passent inchangés. **Le document
  persisté reste complet** — seule la réponse est expurgée.
- Front : `InventoryReconciliationView` déjà tolérant (`expectedPacked == null` couvre
  l'absence, `undefined == null` → colonnes « — ») — aucun changement requis, vérifié.
- Tests : `inventory.service.spec.ts` — 3 tests (listing expurgé/complet selon permission,
  création : réponse expurgée + persistance complète).

Reste ouvert (question métier, pas re-fiché) : faut-il gater la **consultation** des
réconciliations dans son ensemble (écran de supervision ?) — cf. `QUESTIONS_A_BERTRAND.md`.

## Risque de régression / à surveiller

- Ne pas casser le flux « Sauvegarder → réconciliation » des compteurs sans la permission
  (le POST doit rester autorisé, seule la réponse change).
- Post-event non concerné : ses lignes sont fournies par le client (pas de donnée cachée).
- Tester les deux profils (avec/sans `preInventoryExpected`) sur POST + GET après fix.

## Références

- [`232_pre_event_expected_non_normalise_negatifs.md`](232_pre_event_expected_non_normalise_negatifs.md)
  (session de découverte ; le fix BUG-232 centralise le calcul dans `computeExpected` — point
  unique où brancher l'expurgation).
- [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) §8.3 (gating), §8.4 (lignes serveur).
- `QUESTIONS_A_BERTRAND.md` #23 (attribution des rôles porteurs de `preInventoryExpected`).

---

Rédaction : **JLH**, 2026-07-23.
