# BUG-316-01 — Mode estimation : Stock up identique dans tous les PDV (fan-out ×N + slider qui écrase) et Staff inerte

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🔴 Bloquant/impact business (quantités de stock-up fausses ×N + écrasement
  silencieux des saisies par PDV)
- **Domaine** : Prévision (Event Predict) / RH (Staffing)
- **Repo(s) concerné(s)** : `datafriday-web` (frontend seul — verrous backend du staffing
  documentés, non modifiés)
- **Découvert le** : 2026-08-11 (repro JLH, event « Nantes-Rodez », mode estimation)
- **Fichiers** : `src/components/EventPredictMenusSection.vue`, `src/utils/estimationMode.js`,
  `src/ui/slider.vue`, `src/components/EventPredictStaffSection.vue`,
  `src/i18n/translations.js` ; backend cité : `src/features/staffing/staffing.service.ts`

## Symptôme

Mode estimation (event futur sans historique comparable, fiches 311-01/311-02) :

1. **Stock up** : chaque PDV affiche « 1 element », le MÊME contenu partout (« 1 FICTIF
   LMFC/FCN », 350 Pc, depuis 129 Affligem + 221 Fanta) — sans rapport avec les quantités
   ajustées par PDV dans Configuration. Total global = valeur saisie × nombre de shops.
2. **Configuration** : des saisies par PDV faites à la ligne se retrouvent écrasées « toutes
   seules » (mêmes valeurs partout, parfois 0).
3. **Staff** : état vide « No staff lines yet » + erreur « Aucun goal TPE configuré (Settings
   RH) pour cet espace. » — rien ne s'adapte aux quantités estimées.

## Cause racine

Trois mécanismes indépendants (diagnostic 2 agents, ancré code — lignes AVANT correctif) :

1. **Fan-out absolu ×N** — le slider « par article » (`handleItemEstimationQty`,
   `EventPredictMenusSection.vue:2319-2324`) posait la MÊME quantité absolue sur chaque clé
   `${elementId}-${menuItemId}` de tous les PDV cochés (`applyFanoutQuantity`,
   `utils/estimationMode.js:102-107`). En estimation, tous les articles du Space Menu sont
   cochés dans tous leurs shops par défaut (`EventPredictView.vue:2497-2523`) → cible maximale.
   La « parité » avec le fan-out % (fiche 311-02) était le mauvais invariant : 150 % scale la
   base propre de chaque shop, 129 unités absolues multiplient le total par N. La lecture Stock
   up, elle, est correctement scopée (`EventPredictStockUpSection.vue:607-624`, clé
   `"elementId-menuItemId"`, aucun fallback global) — elle ne fait que refléter l'écriture.
2. **Émission slider non sollicitée** — `ui/slider.vue:160-162` : `watch: max → clampAll()`,
   et `clampAll` (:207-210) appelait `setValues` → `$emit('update:value')` (:222) **même sans
   changement**. Or `max` est dynamique (`estimationSliderMax` = max(échelle, valeur courante))
   et le champ « Échelle des curseurs (max) » du bandeau change le `max` de TOUS les sliders à
   la fois → chaque changement d'échelle déclenchait un fan-out silencieux sur chaque slider ;
   valeur émise = `uniformValue ?? 0` → un état « mixte » (saisies par PDV différentes) était
   écrasé par **0 partout**.
3. **Staff — trois verrous empilés** : (A) `HrGoal.goalPerTpe` / `HrStaffRatio` absents pour
   l'espace → 400 backend (`staffing.service.ts:353-360`) AVANT toute lecture de CA ; message
   brut affiché (`EventPredictStaffSection.vue:481`) ; l'état vide n'offrait AUCUN accès aux
   Settings RH (pill + drawer rendus seulement quand des lignes existent). (B) le CA prédit
   n'est lu que depuis la version sauvegardée `isDefault` (`staffing.service.ts:214-231`) —
   sans « Sauvegarder la version », CA 0 → PDV « fermés » → 0 ligne ; cache staffing TTL 15 min
   jamais invalidé au save. (C) volumétrie codée à 0 (`staffing.service.ts:432-433`), ratios
   Rôle↔MenuItem lus du Builder, pas d'Event Predict.

## Correction

Décisions JLH 2026-08-11 : slider article = **répartir le total** ; fix slider ; Staff =
frontend seul (accès Settings RH depuis l'état vide).

1. **Répartition du total** — nouvel util pur `splitQuantityAcrossKeys`
   (`utils/estimationMode.js`) : équiréparti au plus juste (base = floor(total/n), le reste aux
   premières clés, somme strictement égale au total). `handleItemEstimationQty` l'utilise ;
   `getItemEstimationQty` devient la SOMME des PDV cochés (le slider affiche le total, plus
   jamais « Mixed ») ; `itemEstimationSliderMax` couvre le total ; libellé
   `epmItemEstimationQty` reformulé (« Quantité totale, répartie sur les PDV »). Slider « par
   PDV » inchangé (sémantique à trancher — question no 55).
2. **Slider** — `clampAll()` ne fait plus rien si le clamp ne change aucune valeur : plus
   d'émission au changement de `min`/`max` sans dépassement réel. Consommateurs vérifiés
   (SpaceSelectionDialog, SpacePricingDialog, SpaceImageUpload, EventPredictMenusSection) —
   changement strictement soustractif (aucune émission ajoutée).
3. **Staff** — la pill réglages RH (goal TPE / staff par zone) + bouton engrenage sont rendus
   aussi dans l'état vide (`.eps-empty-settings`), réutilisant `openSettingsDrawer` /
   `HrSpaceEditDrawer` (déjà montés hors du `v-else`) ; `settingsError` affiché dans les deux
   états. Le GET staffing renvoie `settings` + `spaceId` même à 0 ligne
   (`staffing.service.ts:694`) → le drawer est utilisable pour poser le goal TPE sans quitter
   l'écran, puis relancer Generate.

Tests : `tests/unit/estimationMode.spec.js` complété (split : somme préservée, reste aux
premières clés, bords ; total/somme côté composant ; plafond au total) — 29/29 verts. Le test
qui verrouillait la duplication ×N a été retourné vers la répartition.

Non traité (documenté, décision en attente) : verrous Staff (B) et (C) — question no 56 ;
sémantique du slider PDV — question no 55.

## Risque de régression / à surveiller

- **Arrondis de répartition** : la somme vaut strictement le total saisi, mais les PDV ne sont
  pas égaux (33/32/32/32 pour 129 sur 4) — vérifier que personne n'attend une valeur uniforme.
- **Slider** : le no-op de `clampAll` s'applique à tous les consommateurs — vérifier qu'aucun
  ne dépendait de l'émission au changement de plage (aucun trouvé par lecture).
- **Mode normal (event avec historique)** : sliders % intacts (`applyFanoutQuantity` conservé
  pour le slider PDV, chemins % non touchés) — à retester.
- **Staff** : le goal TPE posé, la génération reste tributaire du verrou (B) — 0 ligne tant
  qu'aucune version par défaut ne porte de CA ; comportement connu, documenté question no 56.

## Références

- [311-01](311_01_eventpredict_estimation_zero_event_sans_historique.md),
  [311-02](311_02_eventpredict_estimation_sliders_absolus_et_couts.md) — mode estimation et
  sliders absolus (le fan-out ×N vient de la « parité » 311-02).
- [290-01](290_01_eventpredict_stockup_prediction_zero_et_decomposition.md) — chaîne de lecture
  des quantités du Stock up.
- `docs/QUESTIONS_A_BERTRAND.md` no 55 (slider PDV) et no 56 (CA manuel → staffing).

JLH
