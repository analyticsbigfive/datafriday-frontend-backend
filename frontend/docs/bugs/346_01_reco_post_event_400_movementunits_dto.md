# BUG-346-01 — Réconciliation post-event : 400 « lines.0.property movementUnits should not exist »

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant (impossible de créer une réconciliation post-event → pas de baseline
  pour les attendus du pre-event suivant)
- **Domaine** : Stock & inventaire (Post-event Inventory)
- **Repo(s) concerné(s)** : backend (`datafriday-frontend-backend/backend`) — le frontend est la
  source du champ mais n'a rien à changer
- **Découvert le** : 2026-08-20 (test JLH, space Auxerre, réconciliation du match du 05/08)
- **Fichiers** : backend `src/features/inventory/dto/create-post-event-reconciliation.dto.ts:55`,
  frontend `src/utils/postEventReconciliation.js:173`, `src/views/SpaceInventoryView.vue:2622`

## Symptôme

Clic « Create Reconciliation » sur un Post-event Inventory → erreur 400 :
`lines.0.property movementUnits should not exist`. Aucune réconciliation créée, le panneau
« Reconciliation » reste sur « No reconciliation yet ». Conséquence en cascade : sans snapshot
`kind='post-event'` sauvegardé, le pre-event de l'événement suivant n'a pas de baseline → aucune
quantité attendue affichée (bandeau « no-baseline », voir module 10 §8.3).

## Cause racine

Désynchronisation front/back introduite par le travail BUG-343-01 (branche
`fix/inventaire-attendus-packs-rearmement`) : le frontend archive désormais le terme
`movementUnits` (delta net des mouvements Logistic, en unités) dans chaque ligne de réconciliation
(`postEventReconciliation.js:173`) pour l'infobulle « détail du calcul », mais le DTO backend
`PostEventReconciliationLineDto` ne déclarait pas ce champ. Le `ValidationPipe` global
(whitelist + `forbidNonWhitelisted`) rejette tout champ inconnu → 400.

Piège déjà documenté sur le champ voisin `salesSource` (commentaire du DTO, Q35) : un backend
antérieur rejette tout champ que son DTO ne connaît pas.

**Pas un problème de migration** : les lignes sont persistées dans la colonne JSON
`StockReconciliation.lines` — aucun DDL requis. La colonne `InventorySnapshot.kind`
(prisma/sql/2026-07-20) était déjà appliquée (README migrations ✅).

## Correction

Commit `2d9812f` sur `fix/inventaire-attendus-packs-rearmement` (2026-08-20) : ajout du champ
optionnel nullable au DTO, après `leftFromSales` :

```ts
@ApiPropertyOptional({ description: 'Delta net des mouvements Logistic depuis le comptage pré-événement, en unités — null si baseline indisponible', type: Number })
@IsOptional()
@IsNumber()
@Type(() => Number)
movementUnits?: number | null;
```

Reste à faire : PR vers `staging`, merge, **déploiement Render** — tant que Render tourne sur
l'ancien code, l'erreur persiste quel que soit le frontend.

## Risque de régression / à surveiller

- Retester le parcours complet après déploiement : post-event 05/08 → « Create Reconciliation »
  sans erreur → pre-event 29/08 affiche l'attendu (compte Directeur de site ou Chef exécutif,
  cf. gating `front.fb.preInventoryExpected`).
- Toute nouvelle clé ajoutée aux lignes côté `postEventReconciliation.js` doit être déclarée dans
  le DTO **dans le même lot**, ou n'être envoyée que conditionnellement (pattern `salesSource`).
- Vieux documents sans `movementUnits` : champ absent = `null` à l'affichage, déjà géré
  (`buildExpectedCalcDetails`).

## Références

- [Module 10 — Post-event Inventory](../modules/10_POST_EVENT_INVENTORY.md) §8.3–8.4 (attendus,
  archivage `movementUnits`)
- [BUG-343-01](343_01_predicted_permission_dediee_details_calcul.md) (origine du champ côté front)
- [BUG-341-01](341_01_attendus_inventaire_sources_incorrectes.md) (sources des attendus)

— JLH
