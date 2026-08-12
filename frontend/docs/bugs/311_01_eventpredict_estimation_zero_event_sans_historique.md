# BUG-311-01 — Event Predict : « Estimation 0 » impossible pour un event futur sans historique

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant/impact business (démo FC Nantes du 2026-08-11, 15h00)
- **Domaine** : Event Predict
- **Repo(s) concerné(s)** : `datafriday-frontend-backend/frontend` (aucun changement backend)
- **Découvert le** : 2026-08-11
- **Fichiers** : `src/components/EventPredictView.vue`, `src/components/EventPredictMenusSection.vue`,
  `src/utils/estimationMode.js` (nouveau), `src/i18n/translations.js`

## Symptôme

Sur un event FUTUR qui ne ressemble à aucun event passé (ex. « FCN Test pas d'event passé »,
30/08/2026), l'écran Préd. Événement affiche « Timeline indisponible — Aucun événement comparable
pour la timeline » puis « Aucun article disponible pour cette prédiction… » : la grille PDV ×
articles est entièrement supprimée. Impossible de créer une prédiction manuelle — le mécanisme de
quantité manuelle (`manualQuantities`), pourtant conçu exactement pour « prédiction = 0 mais
l'utilisateur veut prévoir quand même », est inatteignable puisque les lignes ne se rendent pas.

Repro : `/spaces/cmrc4y89n000i11bs8a1nt88f?toolbox=event-predict&configuration=cmrc4yccm000m11bsfqlfk3ab`,
sélectionner l'event futur sans comparable.

## Cause racine

Chaîne vérifiée code :

1. Aucun event passé ne franchit les gates de scoring ET le pool de repli est vide →
   `usePredictiveTimeline.js:860` pose `insufficientData = true`, `predictedTimelineData = []`.
2. `activeTimelineData` = `[]` (`EventPredictView.vue`, computed `activeTimelineData`).
3. `predictionItemsContext` → `'not-calculated'` (branche « event futur + timeline vide »).
4. `EventPredictMenusSection.vue` et `EventPredictStockUpSection.vue` court-circuitent sur ce
   contexte vers l'empty state `epNoItemsPrediction` — la grille ne se rend jamais.

Or l'énumération PDV × articles **indépendante des ventes** est déjà chargée en mémoire au moment
où l'empty state s'affiche : `configShopElements` (via `GET /spaces/:id/shops?configId=`),
`shopMenuAssignmentItems` (via `GET /space-menu/shop/:id/items?configId=`), pré-cochage
`derivedMenuConfigFromRecords` depuis le Space Menu. La liste d'articles n'était simplement jamais
dérivée de cette source quand la timeline était vide.

## Correction

Feature « Estimation 0 » (branche `fix/bug-290-01-eventpredict-config-stockup`) — un pont entre
l'empty state et les mécanismes existants, aucun nouveau moteur :

- **`src/utils/estimationMode.js`** (nouveau, pur, testable) : `resolveItemsContext(...)`
  (transcription de l'ancien computed + règle : la branche `'not-calculated'` devient `'ready'`
  quand le mode estimation est actif) et `isEstimationEligible(...)` (event futur + timeline vide +
  assignation Space Menu chargée et non vide + ≥1 shop de config).
- **`EventPredictView.vue`** : data `estimationMode` (persisté dans le brouillon localStorage,
  clé additive) ; computeds `estimationEligible` / `estimationActive` / `canStartEstimation` ;
  `predictionItemsContext` délègue à l'util ; méthode `startEstimation()` ; sorties du mode dans
  `performReset()` et le watcher `selectedEventId`. **Ré-armement cross-device** : `estimationActive`
  se ré-arme dès que `manualQuantities` contient une valeur > 0 (une version rechargée sur un autre
  appareil n'a pas le flag, mais a les quantités).
- **`EventPredictMenusSection.vue`** : bouton « Démarrez une estimation » dans l'empty state
  `'not-calculated'` (émission `start-estimation`) ; bandeau info du mode ; onglet par défaut par
  shop `'noSales'` en mode estimation (l'onglet « ventes » est vide, badge 0) ; input
  `type="number"` à côté du slider manuel (volumes stade ≫ plafond slider 500) avec plafond slider
  dynamique `manualSliderMax`.
- **i18n** : `epStartEstimation`, `epStartEstimationHint`, `epEstimationModeBanner`,
  `epmManualQtyInputAria` (en + fr).

Tout l'aval est inchangé et réutilisé tel quel : `manualQuantities` → `manualQuantityRecords` →
totaux ajustés sidebar → `buildPredictedRecords()` (`isManual: true`) → snapshot version →
`EventPredictVersion.manualQuantities` (backend déjà en place) → Réappro.

## Risque de régression / à surveiller

- Tests ajoutés : `tests/unit/estimationMode.spec.js` (13 cas — priorités de contexte préservées,
  éligibilité, onglet par défaut, plafond slider, clamp valeur string de l'input).
- Hors mode estimation, comportement strictement inchangé : les deux points de code partagé touchés
  (`getShopTab`, empty state) sont gardés par des props à défaut `false` ; la branche
  `'not-calculated'` sans estimation garde son message historique.
- Anti-double-comptage : si l'event gagne un jour des comparables (timeline non vide),
  `estimationEligible` retombe à faux (mode auto-désactivé) et `manualQuantityRecords` saute déjà
  les clés couvertes par la prédiction.
- Limites connues, assumées :
  - Version sauvegardée avec toutes les quantités manuelles à 0 → pas de ré-armement sur un autre
    appareil (le bouton se réaffiche, rien n'est perdu).
  - Les records réappro (pont localStorage) ne s'écrivent qu'à la sauvegarde d'une version en mode
    estimation (le watcher `activeTimelineData` ne tire jamais avec une timeline vide).
  - Config dont tous les shops sont fermés : l'onglet « Ouverts » reste vide (donnée, pas code).
- À retester manuellement (staging) : parcours complet démo — bouton → grille à 0 → saisie
  (slider + input > 500) → CA ajusté sidebar → « Enregistrer sous » → reload (quantités + mode
  conservés) → onglet Réappro alimenté → « Réinitialiser » ressort du mode.

## Références

- `docs/modules/01_EVENT_PREDICT_ALGORITHME.md` (§ persistance `manualQuantities`, § moteur).
- Fiche 290-01 (index quantités partagé Config/Stock up — non affecté, index vide → 0).
- BUG-291-02 (articles indisponibles serveur → bucket « Sans ventes prévues », même onglet que les
  lignes d'estimation).

JLH
