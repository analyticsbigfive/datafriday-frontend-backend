# BUG-134-01 — Attendus Pre/Post-event Inventory : source = état Logistic « en l'état »

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant (aucune quantité attendue sur le Pre-event Inventory → réconciliation
  pre-event impossible)
- **Domaine** : Stock & inventaire (Pre/Post-event Inventory)
- **Repo(s) concerné(s)** : backend + frontend (`datafriday-frontend-backend`)
- **Découvert le** : 2026-08-20 (JLH, espace Auxerre, org Eat Is Family, base dev)
- **Fichiers** : backend `src/features/inventory/inventory.service.ts`
  (`computeLogisticExpected`, `netMovementUnitsForEventWindow`, `getPreEventBaseline`,
  `getPostEventBaseline`, `createPreEventReconciliation`, `getPreEventInventory`),
  `src/features/logistics/logistics.service.ts` (`getLevelsAndConsumption`,
  `getExpectedStockIndex`), `src/core/rbac/rbac-catalog-sync.service.ts` (nouveau) ;
  frontend `src/views/SpaceInventoryView.vue`, `src/utils/preEventExpected.js`,
  `src/i18n/translations.js`

## Symptôme

Pre-event Inventory d'AJA vs Angers (29/08) : aucune quantité attendue, bandeau « Aucun comptage
post-event sur le match précédent ([Simulé] 7 A B C D — 2026-08-07) ». Le comptage post-event de
« Test Live Inventory » (05/08, 20 packs de Bun - Burger sur le PDV 1 B) existe pourtant en base.
« Ça marche en local, pas en déployé » (call Bertrand 20/08).

## Causes racines (3, vérifiées en base dev)

1. **Ancre sans remontée.** `resolvePreEventBaseline` prenait LE dernier événement passé de
   l'espace et cherchait son snapshot post-event. Or le dernier événement passé était un événement
   **simulé** (outil QA « simuler une vente », `Event.isSimulated=true`), jamais compté → baseline
   null → aucun attendu. « Local OK / déployé KO » = problème de **données**, pas de déploiement :
   en local, pas d'événements simulés intercalés devant le dernier match compté.
2. **Fenêtre de rejeu depuis la saisie.** Les mouvements n'étaient rejoués que s'ils étaient
   postérieurs à `snapshot.createdAt` : un comptage saisi en retard (compté sur papier le soir du
   match, saisi des jours après) avalait les livraisons intermédiaires (vérifié : livraisons des
   13–20/08 vs snapshot saisi le 20/08 15h32 → attendu 20 packs au lieu de ~42-48 affichés par
   Logistic).
3. **Permission `front.fb.preInventoryPredicted` : 0 ligne en base** (tous tenants). Le catalogue
   RBAC n'était propagé qu'au seed/backfill manuels et à l'onboarding des nouveaux tenants — la
   « propagation automatique » promise par BUG-132-01 ne tournait jamais au déploiement. Les
   Admins ne le voyaient pas (bypass) ; les Directeurs de site n'auraient jamais eu le chip.

## Décision (JLH, 2026-08-20 — après 2 itérations chiffrées sur données réelles)

> **Attendu (pre-event ET post-event) = les chiffres de Logistic en l'état au moment où on ouvre
> l'écran** (StockLevel − ventes dérivées, casse de pack, clamp ≥ 0) — exactement ce que l'écran
> Logistic affiche.

Cette décision **remplace** le rejeu « comptage d'ancrage + mouvements » (BUG-232/239) et rend
sans objet deux décisions intermédiaires du même jour (walk-back d'ancre, fenêtre depuis la fin
du match). Justifications : demande initiale JLH (« l'attendu devrait être égal à ce que l'on
trouve dans Logistic »), call Bertrand (« la logistique est mise à jour en temps réel »),
simplicité (plus d'ancre → plus de cas « no-baseline », plus de sensibilité aux événements non
comptés). Cohérence PDF : au post-event, le registre vaut « pre-event (poussé à l'ouverture des
portes par `autoInitLiveStockFromPreEventInventory`) + mouvements − ventes », soit la formule
« Pre-event Inventory + Logistic (ventes en négatif) » du cadrage.

## Correction

- **`LogisticsService.getLevelsAndConsumption`** : extraction du calcul niveaux + consommation
  dérivée (ancre = dernier reset `kind:null`, sinon premier mouvement) — chemin UNIQUE partagé
  par `getStock` (écran Logistic) et le nouveau **`getExpectedStockIndex`** (attendus
  inventaire) : les deux écrans ne peuvent pas diverger.
- **`InventoryService.computeLogisticExpected`** : traduit l'index (clé = nom libre, unité =
  paquet Logistic) vers le référentiel compté — jointure nom → `menuItemId`
  (`menuItemIdByNormName`), re-découpage dans la taille de paquet de l'INVENTAIRE
  (`resolveInventoryUnitsPerPack`, BUG-239). Consommé par les TROIS chemins (GET pre, GET post,
  réconciliation pre-event). `computeExpected`/`resolvePreEventBaseline`/`resolvePostEventBaseline`
  supprimés (code mort).
- **`movementUnits` du post-event conservé** via `netMovementUnitsForEventWindow` (fenêtre du
  match : comptage pre-event → `eventEndDate + 1 j`, `SALE` exclues, non clampé) — c'est le terme
  « mouvements » des lignes de réconciliation post-event (BUG-343-01/346-01), pas l'attendu.
- **`getPreEventInventory`** (pré-remplissage du comptage, BUG-241) : repli « match précédent »
  filtré `isSimulated: false` — les événements de l'outil QA ne participent plus au cycle
  d'inventaire (ils étaient déjà exclus d'Event Predict et du Live).
- **`RbacCatalogSyncService`** (`OnApplicationBootstrap`) : `ensureSystemPermissionCatalog` à
  chaque boot, sous `pg_advisory_xact_lock` (l'unique `[tenantId, code]` ne dédoublonne pas
  `tenantId=null` ; deux instances bootant en parallèle dupliqueraient), échec loggé non
  bloquant. Hébergé dans `PermissionsModule`.
- **Frontend** : état `no-baseline` et bandeau supprimés (l'attendu existe toujours) ; cartouche
  de provenance « Attendu = stock Logistic au chargement de l'écran » (`invExpectedSource`, même
  gabarit v-alert que les autres bandeaux) ; infobulle par article = identité chiffrée
  « packs × conditionnement + vrac = total » (la décomposition « comptage + mouvements − vendu »
  n'existe plus) ; repli legacy de `preEventExpected.js` supprimé ; réponse serveur garde
  `baseline: {}` truthy pour un vieux front (gate `baseline?.baseline`), un nouveau front sur un
  vieux serveur affiche « serveur non à jour ».

## Limites connues (assumées par la décision)

- Un comptage qui contredit le registre Logistic est **ignoré par l'attendu suivant** tant qu'un
  recalage Logistic (reset) n'est pas fait — l'écart ressort à la réconciliation. Piste « recaler
  le stock Logistic sur le comptage post-event à la sauvegarde » consignée dans
  `QUESTIONS_A_BERTRAND.md`.
- Article compté mais **jamais suivi par la Logistique** (aucun StockLevel — ex. réel : Cheddar
  Tranche à 1 B) → attendu « — » (décision « jamais de 0 fabriqué », 2026-07-20). Bascule vers 0
  triviale si le métier préfère.
- L'attendu est figé au chargement de l'écran (pas de refresh live) — comportement identique à
  l'écran Logistic.
- `expectedUnits` du post-event est désormais **clampé ≥ 0** (c'est le chiffre Logistic) — l'ancien
  indice signé (négatif = incohérence de sources, décision 2026-07-30 #3) disparaît avec le rejeu.

## Vérification

- `backend` : `pnpm test` — specs `inventory.service`, `logistics.service`
  (`getExpectedStockIndex`), `rbac-catalog-sync.service`. ⚠️ 4 tests `logistics.service.spec`
  (« Gap 2 » explosion des recettes) échouent **déjà sur origin/develop** (indépendant de ce
  fix — voir tâche dédiée).
- Base dev, espace Auxerre `cms81a2…654z` : pre-event AJA vs Angers → Bun - Burger 1 B = chiffre
  de l'écran Logistic à l'instant T (≈ 42 packs au 20/08, transferts pending inclus), Tsingtao
  1 A = 8, 6 A = 4 ; Cheddar 1 B = « — » (hors registre). Plus de bandeau « [Simulé] ».
- Post-event Test Live Inventory : attendus = état Logistic courant (n'est plus « — » — changement
  voulu par la décision).
- Après un boot backend : `Permission(front.fb.preInventoryPredicted)` existe et chaque
  « Directeur de site » porte la `RolePermission` ; re-boot → pas de doublon.

## Références

- [BUG-341-01](../../frontend/docs/bugs/341_01_attendus_inventaire_sources_incorrectes.md),
  [BUG-346-01](../../frontend/docs/bugs/346_01_reco_post_event_400_movementunits_dto.md),
  [BUG-132-01](132_01_permission_dediee_preinventorypredicted.md) (corrigé par ce fix),
  [Module 10 §8](../../frontend/docs/modules/10_POST_EVENT_INVENTORY.md)

— Claude (session JLH 2026-08-20)
