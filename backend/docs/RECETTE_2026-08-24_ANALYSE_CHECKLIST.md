# Liste de contrôle — correctifs Analyse du 24/08 (branche `fix/event-predict-deeplink-event-passe`)

Espace témoin : **La Beaujoire Nantes**, event **Nantes-Rodez** (22/08/2026).
Cible source : 4 204 tx, ventes 11:58 → 16:20 (heures Digifood strictes).

## 0. Prérequis
- [ ] `git status` : correctifs présents (359/360/361/362 front, 140 back, fiches).
- [ ] **Redis démarré AVANT le backend** (sinon 500 « Connection is closed » sur toute route authentifiée).
- [ ] Backend démarré, front `pnpm dev`.

## 1. Réparation des données (ordre STRICT)
- [ ] **1a. Réimporter le CSV Digifood** La Beaujoire (BUG-140-01) — d'abord en **dry-run** :
      la période affichée dans l'aperçu doit reculer de 2 h (bornes en vrai UTC).
- [ ] **1b. Re-agréger** : `POST /aggregation/process-events` avec `spaceId` La Beaujoire,
      suivre `GET /aggregation/progress/:jobId` (répare à la fois BUG-140-01 et BUG-141-01).
- [ ] 1c. Base : `transactionDate` min/max du 22/08 = **09:58 / 14:20 UTC** (plus 11:58/16:20).

## 2. Timeline & heures (BUG-140-01 / BUG-141-01)
- [ ] Timeline Nantes-Rodez affichée **11:58 → 16:20** (heures source strictes, plus 13:58 → 18:20).
- [ ] KPIs et timeline non vides après import + re-agrégation (« Aucun détail de vente disponible » disparu).

## 3. Changement d'espace (BUG-359-01 / BUG-360-01)
- [ ] La Beaujoire → clic sur une barre de la timeline (détail ouvert) → sélecteur → autre espace :
      - [ ] **aucun détail timeline fantôme** (pas de « Nantes-Rodez » sur l'autre espace) ;
      - [ ] **KPIs et ventes s'affichent SANS hard refresh** ;
      - [ ] chip « 1 event(s) selected » disparue (filtres remis à zéro).
- [ ] Retour La Beaujoire : page saine, filtres vierges (comportement hard-refresh, assumé).
- [ ] Deep-link `?config=<id>` sur un espace : la config est bien restaurée après chargement.
- [ ] Route Live : scoping live intact (reset Live inchangé).

## 4. Performance (BUG-361-01)
- [ ] DevTools Network à l'ouverture d'Analyse : paquets `event-timeline`/`transaction-baskets`
      par **2 en parallèle** (plus un par un) ; temps de chargement nettement réduit.
- [ ] CPU : plus de chauffe après changement d'espace (conséquence 360-01).
- [ ] Espace Stade Jean Bouin (77 events) : pas d'OOM Render / pas de page à 0 € (borne 2×15 tient).

## 5. Crash charts (BUG-362-01)
- [ ] Changement d'espace répété + ouverture d'un outil keep-alive avec graphes, puis retour :
      **plus d'overlay « ownerDocument »**, graphes redessinés avec les bonnes données (pas figés).

## 6. Déconsignes (fix Ulrich + réimport Bertrand)
- [ ] Après réimport : « Retour Consigne » en **négatif** dans Item Performance ; CA total = source.
- [ ] Prod : contrôle après le réimport CSV FC Nantes par Bertrand.

## 7. Produits non mappés (AUCUN code — décision 24/08 maintenue)
- [ ] Mapper les **21 produits** listés dans `REQUETE_2026-08-24_PRODUITS_NON_MAPPES_LA_BEAUJOIRE.md`
      (wizard étape 3), dont « Gallia nouveau western IPA 45cL + Consigne » (1 392 lignes).
- [ ] Après mapping + rechargement : bandeau « Non mappées » en baisse, produits visibles sous leur nom.

## 8. TX/MIN (déjà implémenté, fiche 358-01)
- [ ] Carte TX/MIN identique panneau Shop Performance **ouvert et fermé** (Σ des moyennes par PdV).

## 9. Deux events même jour (BUG-142-01 — prod, diagnostic)
- [ ] SQL read-only prod : `eventEndTime`/`sessions` des deux events du 06/09 (Jean Bouin) —
      attendu : au moins un sans heure de fin.
- [ ] Renseigner les heures manquantes → re-agréger → chaque match retrouve ses ventes.

## 10. Non-régression
- [ ] `pnpm test:unit` (au minimum : analyseStore, spaceApiTimelineBatch, analyseFiltersState,
      analyseKpiSourceGating, shopPerformanceCompute — 81+ tests) : verts.
- [ ] Backend : spec `digifood-csv-import.service.spec.ts` : verte.

— JLH
