# BUG-259-02 — Transfert PDV/Storage immédiat et non confirmé par le destinataire (+ suppression prévue des raisons "Transfert d'un PDV/Storage" en ajout)

<!-- AA = 02 (Ulrich) -->

- **Statut** : 🟡 Corrigé non testé (code écrit sur `fix/logistique-transferts-composants`, migration Prisma **appliquée** le 2026-08-13 via `pnpm db:deploy` — colonne/index vérifiés en base ; pas de `pnpm dev`/build lancé dans cette session, reste à valider manuellement en navigateur)
- **Sévérité** : 🟠 Majeur (fiabilité des stocks entre PDV/storage, aucune traçabilité des écarts de transfert)
- **Domaine** : Stock (Logistique)
- **Repo(s) concerné(s)** : les deux (`frontend/`, `backend/` — même repo `datafriday-frontend-backend`)
- **Découvert le** : 2026-08-13
- **Fichiers** :
  - `frontend/src/components/LogisticMovementDialog.vue:100-128,232,270-287,326,415-433` (drawer "Ajouter/Supprimer un produit", champ Raison, options `TRANSFER_SHOP`/`TRANSFER_STORAGE`)
  - `frontend/src/store/modules/logistics.js:169` (action `createMovement`)
  - `backend/src/features/logistics/logistics.controller.ts` (`POST /logistics/movements`)
  - `backend/src/features/logistics/logistics.service.ts:299-421` (`createMovement`)
  - `backend/prisma/schema.prisma:3078-3100` (`StockMovement`, pas de champ statut), `:3127-3150` (`StockReconciliation`)
  - `frontend/src/views/SpaceLogisticView.vue:123-141` (bloc Réconciliation, `canReconcile`, `logiReconciliationEmpty`)

## Symptôme

Aujourd'hui, choisir la raison "Transfert d'un PDV" / "Transfert d'un Storage" dans le drawer
"Ajouter un produit" (ou "Transfert vers un PDV/Storage" côté "Supprimer un produit") débite la
source et crédite la destination **immédiatement et atomiquement**, dans la même transaction Prisma
(`createMovement`, `logistics.service.ts:389-420`) : deux `StockMovement` "miroirs" liés par
`transferGroupId` sont créés en un seul appel API, sans aucune validation par le PDV/storage
destinataire. Celui qui saisit le transfert (souvent la source, ou n'importe qui ayant accès au
PDV A) déclare à la fois ce qui sort de A et ce qui entre sur B, sans que B confirme avoir
effectivement reçu la marchandise, ni puisse corriger la quantité réellement reçue.

La capture d'écran de référence montre une section "Transferts en attente de confirmation" sur la
fiche d'un produit (liste "Provenance : 1B — Sac de 0,5 Kg : 3" avec un bouton flèche verte pour
confirmer). **Cette section n'existe nulle part dans le code** (recherche exhaustive `pending`,
`attente`, `confirm`, `transferGroupId`, y compris le bundle compilé) — c'est la maquette de la
fonctionnalité demandée ci-dessous, pas quelque chose de déjà construit et caché.

## Cause racine

`StockMovement` (`schema.prisma:3078-3100`) n'a pas de notion d'état : ni `status`, ni `confirmed`,
ni `pending`. Le transfert est modélisé comme un mouvement de stock ordinaire (delta signé), pas
comme un flux en deux temps émission → réception. Structurellement, rien dans le modèle actuel ne
permet de distinguer "j'ai déclaré un transfert" de "le destinataire a confirmé l'avoir reçu".

## Correction — spec produit demandée (Ulrich, 2026-08-13)

Remplacer le débit/crédit immédiat par un flux en deux temps :

1. **Émission (côté A)** : choisir "Transfert vers un PDV/Storage" (drawer "Supprimer un produit")
   débite A immédiatement (comme aujourd'hui) mais crée un **transfert en attente** ciblant B,
   plutôt qu'un crédit immédiat et définitif sur B.
2. **Réception (côté B)** : la fiche produit de B liste ses transferts entrants non confirmés
   ("Transferts en attente de confirmation"). Cliquer dessus ouvre un drawer avec :
   - les quantités attendues (héritées de l'émission), **modifiables**,
   - un bouton "Confirmer".
3. **Confirmation sans modification** : crédite B des quantités déclarées à l'émission. Rien
   d'autre.
4. **Confirmation avec quantités modifiées** : crédite B des quantités **modifiées** (pas celles
   déclarées à l'émission), et ajoute une entrée dans la section **Pertes**, sous
   **Réconciliation** de l'interface Logistique (`SpaceLogisticView.vue:123-141`, aujourd'hui
   "Aucune réconciliation pour le moment" faute de données) : date, PDV/storage A (source),
   PDV/storage B (destination), nom de l'élément transféré, quantité perdue (attendu − reçu).
5. **Conséquence sur le drawer "Ajouter un produit"** : une fois ce flux de confirmation en place,
   les raisons **"Transfert d'un PDV" et "Transfert d'un Storage" doivent être retirées du mode
   Ajout** (`LogisticMovementDialog.vue:276-277`, `reasonOptions()`) — un ajout manuel de stock
   "au nom d'un transfert" n'a plus de sens dès que la réception passe par confirmation. Les
   raisons côté mode Suppression ("Transfert vers un PDV/Storage", lignes 281-282) restent : c'est
   elles qui déclenchent l'émission.

## Implémentation (2026-08-13)

- **Modèle** : nouveau champ `status StockTransferStatus?` (`PENDING`/`CONFIRMED`, `null` pour
  toute raison non-transfert) + `confirmedAt`/`confirmedBy` sur `StockMovement`. Migration écrite à
  la main : `backend/prisma/migrations/20260813130000_stockmovement_transfer_status/migration.sql`
  — **appliquée le 2026-08-13** via `pnpm db:deploy` (confirmation explicite d'Ulrich, modification
  de schéma sur la base partagée) ; colonne/enum/index vérifiés en base après coup.
- **Backend** (`logistics.service.ts`) :
  - `createMovement` refuse désormais un transfert en mode "ajout" (`isTransfer && direction !==
    'remove'` → 400) : un transfert ne peut plus s'émettre que depuis la Suppression. La source est
    débitée immédiatement comme avant, mais la ligne posée est `status: PENDING` et **aucune ligne
    miroir n'est plus créée côté contrepartie** à ce stade.
  - Nouvelle méthode `confirmTransfer(movementId, {packed?, loose?}, tenantId, userId)` : charge le
    mouvement source PENDING, calcule les quantités confirmées (déclarées par défaut), crée la ligne
    miroir côté contrepartie (`status: CONFIRMED`), crédite son `StockLevel`, clôt la source
    (`status: CONFIRMED`, `confirmedAt`, `confirmedBy`). Si confirmé < déclaré, écrit une
    `StockReconciliation` (`kind: 'transfer-loss'`, une ligne au format identique à celui du reset
    — `expectedPacked/Loose` = déclaré, `countedPacked/Loose` = confirmé, `deltaPacked/Loose` =
    l'écart — pour réutiliser tel quel l'export CSV existant, qui ne connaissait que ce format).
  - Nouvelle méthode `getPendingTransfersForElement(elementId, tenantId)` : transferts `PENDING`
    ciblant cet élément, noms de la source résolus.
  - `listReconciliations` élargi de `kind: null` à `kind: { in: [null, 'transfer-loss'] }` — les
    pertes de transfert apparaissent donc dans la section Réconciliation existante de la Logistique
    **sans aucun changement frontend** : l'`eventName` généré (`"Transfert {item} : {A} → {B}"`)
    tient lieu de libellé de ligne dans la liste déjà existante.
  - Nouveaux endpoints : `POST /logistics/movements/:id/confirm` (`ConfirmTransferDto`), `GET
    /logistics/element/:elementId/pending-transfers`. Gatés par la permission de base
    `front.fb.logistic` (comme `createMovement`), **pas** `front.fb.logisticReconcile` — choix
    délibéré pour que confirmer une réception reste une action de logistique courante, pas une
    action de réconciliation ; à reconsidérer si ce n'est pas le niveau d'accès voulu.
- **Frontend** :
  - `LogisticMovementDialog.vue` : `reasonOptions()` ne propose plus `TRANSFER_SHOP`/`TRANSFER_STORAGE`
    en mode Ajout (reste Delivery/Autre) ; conservées en mode Suppression.
  - Nouveau composant `LogisticTransferConfirmDrawer.vue` : drawer quantités éditables (pré-remplies
    aux valeurs déclarées, plafonnées à ne pas les dépasser) + bouton Confirmer.
  - `LogisticItemCard.vue` : nouvelle section "Transferts en attente de confirmation" (prop
    `pendingTransfers`), une ligne cliquable par transfert entrant, ouvre le drawer ci-dessus.
  - `SpaceLogisticView.vue` : charge les transferts en attente à l'entrée en drill-in d'un élément
    (watcher sur `drillElement.element.id`), câble le drawer, recharge stock + réconciliations après
    confirmation.
  - `store/modules/logistics.js` : actions `loadPendingTransfers`/`confirmTransfer`, état
    `pendingTransfers` par élément.

**Non fait / à valider manuellement** : `pnpm dev` non lancé (règle CLAUDE.md), aucun test
end-to-end en navigateur. À tester avant merge : émission d'un transfert (débit immédiat de A, rien
côté B), apparition dans "Transferts en attente" de B, confirmation sans écart (crédite B, pas de
ligne Réconciliation), confirmation avec écart (crédite B du montant réduit, ligne "Pertes" visible
dans Réconciliation avec export CSV cohérent).

## Risque de régression / à surveiller

- Le retrait des raisons `TRANSFER_SHOP`/`TRANSFER_STORAGE` du mode Ajout ne doit **pas** casser le
  mode Suppression, qui les garde comme déclencheur d'émission.
- L'historique existant (transferts déjà réalisés en immédiat, `transferGroupId` déjà posés) doit
  rester lisible tel quel dans `Historique` — pas de migration/backfill à faire sur les
  `StockMovement` déjà créés, seul le comportement des **nouveaux** transferts change.
- Vérifier l'articulation avec `StockReconciliation.kind` existant (`null` = reset logistique,
  `'post-event'` = document Post-event) : une 3ᵉ nature de ligne ("perte de transfert") doit être
  distinguable des deux autres dans `lines`/`meta`.

## Références

- Capture d'écran de référence fournie par Ulrich (2026-08-13) : fiche "1 A" avec section
  "Transferts en attente de confirmation" (Provenance 1B / Stockage Central) et drawer "Ajouter un
  produit" avec les raisons à retirer surlignées.
