# BUG-391-02 : Event Predict, Generate Staff : « aucune ligne » alors que les PDV ont un CA prédit

- **Statut** : 🟡 Corrigé non déployé (branche `fix/bug-391-02-staff-ca-ecran`, non commité, 2026-10-01)
- **Sévérité** : 🔴 Bloquant (onglet Staff inutilisable sur tout match sans version enregistrée)
- **Domaine** : Event Predict / RH Staffing
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-10-01 (signalement Skype, Jean Bouin, SFP-Montpellier)
- **Fichiers** : `backend/src/features/staffing/staffing.service.ts:156` et `:292`,
  `backend/src/features/staffing/staffing.controller.ts:74`, `frontend/src/api/endpoints/staffing.api.js:18`,
  `frontend/src/store/modules/staffing.js:73`,
  `frontend/src/components/space-workspace/event-predict/sections/EventPredictStaffSection.vue:503`,
  `frontend/src/components/space-workspace/event-predict/views/EventPredictView.vue:966` et `:5272`

## Symptôme

Onglet Staff, « Generate Staff » : bandeau « Generation produced no staff lines. La génération n'a produit aucune
ligne : les effectifs calculés sont tous à 0 (CA prédictif / pic de transactions absents pour les PDV de cette
configuration) ». Pourtant l'onglet Configuration affiche un CA prédit par PDV (111 760 € prédit, 76 313 €
ajusté sur SFP-Montpellier).

## Cause racine

Le bouton n'utilise pas le CA affiché. Le front n'envoie que l'`eventId`
(`POST /events/:eventId/staffing/generate`, sans corps), et le backend cherche le CA ailleurs, dans cet ordre
(`staffing.service.ts:156`, `:346`) :

1. `EventPredictVersion.predictedRecords` de la version **enregistrée en base et marquée par défaut** ;
2. sinon `ElementPerformance.revenue` de la configuration.

Vérifié en production le 2026-10-01 (lecture seule) :

- SFP-Montpellier (`c468eb67-…`) : **aucune** `EventPredictVersion`, ni par défaut ni autre.
- Repli : 36 `ElementPerformance` sur la configuration `cmt7frv1p0022m36lcsxqo5zq`, **toutes à 0** (CA et
  tx/min).
- `ElementPerformance.revenue` n'est écrit que par la saisie manuelle du Builder v2
  (`builder-v2.service.ts:953`) et par la duplication d'espace. Event Predict ne l'alimente jamais. Le repli
  vaut donc 0 en pratique.
- Calcul : `n = floor(CA / goalTpe)` (`staffing-calculator.service.ts`), avec `goalTpe = 1000` pour Jean Bouin.
  Avec un CA de 0, aucun PDV n'ouvre, aucune ligne n'est créée, d'où l'avertissement `AUCUNE_LIGNE_GENEREE`.
- Contre-épreuve : les matchs de Jean Bouin **avec** une version par défaut génèrent bien du staff
  (SFP-Lyon : 96 lignes, PFC-Strasbourg : 51). Seuls 5 matchs de l'espace ont une version enregistrée.

D'où le « souvent » du signalement : ça marche uniquement quand quelqu'un a enregistré une version et l'a mise
par défaut. Une version restée en localStorage (repli hors ligne de `useEventPredictVersions.js`) n'est pas
vue non plus.

BUG-258-01 avait classé ce cas en « problème de données en amont (ElementPerformance à 0) ». C'est en réalité
un défaut de conception : la source attendue (ElementPerformance) n'est alimentée par aucun flux.

Pistes écartées :

- Correspondance des identifiants : les PDV des versions sans élément dans la configuration (SFP-Lyon : 9 sur
  39, ex. Parvis bar, Foodtrucks) sont des PDV **absents de la configuration du match**, présents dans
  d'anciennes versions enregistrées avant le filtrage par périmètre (`restrictRecordsToMenuConfig`). Les ignorer
  est correct.
- Pic de transactions : il ne sert qu'à l'avertissement « TPE supplémentaire », pas au nombre de staff.

## Correction

Principe : générer à partir **du CA que l'utilisateur voit**, avec le même agrégat que la version enregistrée.

Front :
1. `EventPredictView.vue` : nouveau `computed` `predictedRevenueByElement`, qui agrège
   `buildPredictedRecords()` (`:5272`, déjà la source de `snapshotForVersion.predictedRecords`) par `shopId`.
   L'agrégation va dans un util à part (`src/utils/staffingPredictedRevenue.js`), avec des tests.
2. Le passer en prop à `EventPredictStaffSection` (`:966`).
3. `onGenerate` → `staffing/generate` → `generateEventStaffing(eventId, { predictedRevenueByElement })`.
   Le corps est envoyé seulement s'il n'est pas vide (timeline pas encore calculée : on garde le comportement
   actuel).

Backend :
4. `GenerateStaffingDto` optionnel : `predictedRevenueByElement?: Record<string, number>` (nombres finis ≥ 0).
5. `generate(eventId, tenantId, user, dto)` : priorité **corps de la requête > version par défaut >
   ElementPerformance**. Les clés qui ne sont pas des éléments de la configuration sont ignorées.
6. Message `AUCUNE_LIGNE_GENEREE` plus juste : distinguer « aucun CA prédit » de « aucun PDV n'atteint
   l'objectif de {goalTpe} € par TPE », avec le CA maximum trouvé.
7. Tests `staffing.service.spec.ts` : corps prioritaire, repli version, repli ElementPerformance, clés hors
   configuration ignorées.

Ce choix ne change pas la règle métier : le CA envoyé est celui qu'aurait figé une version enregistrée au même
moment (CA ajusté, issu de `activeTimelineData`).

## Risque de régression / à surveiller

- Les lignes MANUAL ou modifiées à la main ne sont jamais écrasées par la génération : comportement inchangé à
  vérifier.
- Match avec version par défaut **et** écran modifié depuis : c'est l'écran qui l'emporte (voulu). À dire à
  Bertrand.
- Le coût staff réinjecté dans `ElementPerformance.staffCost` (`staffing.service.ts:516`) suit le nouveau calcul.
- Après déploiement, regénérer SFP-Montpellier : on attend des lignes sur les PDV à 1 000 € de CA ou plus.

## Références

- BUG-258-01 (bandeau d'avertissement, diagnostic « données » de juillet, à relire avec celui-ci).
- Question Bertrand #43 (RH staffing, source du CA prédictif) : option (b) « agréger `predictedRecords` par élément »
  implémentée (commentaire `staffing.service.ts:150`), mais la ligne est restée 🔴 dans `QUESTIONS_A_BERTRAND.md`.
  Ce fix reste dans l'option (b) (prévision de l'événement) ; à mettre à jour en même temps.
- `docs/modules/11_RH_STAFFING.md` §10.5 (constat initial : `ElementPerformance` vide).
- Fiche miroir backend à créer (`backend/docs/bugs/`), qui renvoie à celle-ci.

## Mise en œuvre (2026-10-01)

Branche `fix/bug-391-02-staff-ca-ecran` : CA par PDV de l'écran envoyé au generate (`src/utils/staffingPredictedRevenue.js`), `GenerateStaffingDto` backend, priorité corps > version par défaut > ElementPerformance, nouvel avertissement `CA_SOUS_OBJECTIF_TPE`. Tests : staffingPredictedRevenue.spec.js (front), staffing.service.spec.ts (9 nouveaux tests). Reste : regénérer SFP-Montpellier après déploiement, passer la question #43 en résolue.
