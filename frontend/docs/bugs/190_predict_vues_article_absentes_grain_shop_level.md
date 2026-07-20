# BUG-190 — Mode Predict : « Répartition du CA par article » et « Articles du menu par PdV » absents

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Analyse & agrégation (mode Predict) — pont avec Prévision (Event Predict)
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-07-20
- **Fichiers** :
  - `src/components/analyse/AnalyseView.vue:319-333` (rendu des 2 vues)
  - `src/store/modules/analyse.js:2033` (`regeneratePredictions`)
  - `src/utils/predictScenarioRecords.js` (nouveau)
  - `src/components/EventPredictView.vue:4265` (`buildPredictedRecords`, source du grain article)

## Symptôme

Sur l'écran Analyse en **mode Predict** (route `/spaces/:spaceId` avec `?toolbox=predict`), deux
blocs présents en mode Analyse disparaissent :

- `MenuItemRevenueDistribution` — « Répartition du CA par article »
- `MenuItemsByShopTable` — « Articles du menu par PdV »

L'utilisateur voit donc le CA prédit **par PdV** mais n'a aucun moyen de savoir *quels articles*
composent cette prévision — alors que c'est précisément l'information dont il a besoin pour
préparer un événement.

## Cause racine

Deux causes empilées.

**1. Masquage volontaire.** `v-if="!isPredictMode"` sur les deux composants
(`AnalyseView.vue:320` et `:329` avant correction). Décision documentée dans
`docs/modules/02_ANALYSE.md` (« masqué en mode Predict (pas de dimension article en prédiction
shop-level) »).

**2. La raison de ce masquage était réelle.** En mode Predict, `chartRecords` vaut
`filteredRecords` = `filteredShopGranularData`, alimenté par l'endpoint `shop-details`, qui est
**shop-level** : `menuItemId` et `menuItemName` y sont `null` pour toutes les lignes
(`store/modules/analyse.js:865` le documente déjà). Le moteur de prédiction hérite du même grain :
`generatePredictionsForEvent` agrège par `` `${r.shopName}-${r.elementName}-${r.menuItemId}` ``
(`predictiveAnalytics.js:592`) et repart d'un `{ ...baseRecord }` shop-level → les records
prédictifs n'ont pas davantage de dimension article. Démasquer les deux vues sans rien d'autre
aurait produit une seule part « Non rattachés » (`UNATTACHED_ITEM_KEY`) pour la totalité du CA.

Le grain article **existait pourtant déjà**, mais ailleurs : chaque scénario Event Predict persiste
`EventPredictVersion.predictedRecords`
(`[{ shopId, shop, menuItemId, mappedMenuItemId, itemName, totalQuantity, totalRevenue }]`), produit
par `EventPredictView.buildPredictedRecords()` depuis `activeTimelineData` + `manualQuantityRecords`
— donc **déjà ajusté par les sliders du scénario**. Jusqu'ici seul le module Réarmement le lisait.

## Correction

Décision utilisateur (2026-07-20) : afficher les prévisions de ventes **par article** en se basant
sur les quantités prédites du **scénario sélectionné** de chaque event.

1. **`src/utils/predictScenarioRecords.js` (nouveau)** — fonction pure
   `scenarioRecordsToAnalyseRecords(version, event, { elementNameById })` : traduit les
   `predictedRecords` compacts d'une version vers la forme consommée par les vues Analyse
   (`quantity`/`revenue`/`shopName`/`menuItemName`). Repli `shopId → nom de PdV` via
   `elementNameById`, indispensable car `buildPredictedRecords` met `shop: null` sur les items à
   quantité manuelle, et le NOM de PdV est la clé de jointure de `reconcileRecord`.
2. **Store** (`store/modules/analyse.js`) — nouveau bucket `predictScenarioItemRecords`, alimenté
   dans `regeneratePredictions` **au même endroit** où la version active/défaut est déjà résolue
   (la boucle qui rescale le CA), donc sans nouvelle lecture localStorage ni appel API. Purgé
   inconditionnellement par `clearPredictions` (il ne vit pas dans `shopGranularData`, le garde
   existant ne le couvre pas).
3. **`AnalyseView.vue`** — prédicat de filtrage item-level extrait en
   `buildItemFilterPredicate(filters, { skipMinute })`, **partagé** entre l'item-level réel et les
   records de scénario : sans ça, cliquer une part de donut filtrerait le passé mais pas les
   prévisions. Nouveau computed `articleRecords` : hors Predict → `chartRecords` (inchangé) ; en
   Predict → réel item-level des events **sans** scénario + records de scénario pour les autres.
4. **Les 2 composants** — prop `missingEventsCount` + sous-titre discret (clé i18n
   `anPredictNoItemDetail`, FR + EN, avec `anEventsPlural`/`anEventSingular`). Libellé
   volontairement « sans détail article » et non « sans scénario » : le compteur inclut aussi les
   events dont le scénario existe mais a `predictedRecords: []` (sauvegardé avant calcul de la
   timeline).
5. **`ShopItemEventsDialog`** — passé à `articleRecords` lui aussi : le drill-down d'une cellule de
   la table doit interroger le MÊME dataset, sinon en Predict il lisait le shop-level sans nom
   d'article → toujours 0 event.

### Limites connues (assumées, pas des oublis)

- **localStorage-only.** La résolution du scénario actif/défaut lit
  `analyse:event-predict-{active,default}-version:{eventId}` et `analyse:event-predict-versions:{eventId}`
  (contrat implicite décrit dans `docs/modules/01_EVENT_PREDICT_ALGORITHME.md`). Sur un autre
  navigateur/appareil, ni la rescale du CA (comportement déjà existant) ni les articles n'apparaissent.
  Passer par l'API coûterait un appel **par event** — écarté.
- **Events prédits sans scénario exclus.** Le moteur seul ne produit aucune dimension article. Ces
  events sont comptés et affichés (`missingEventsCount`), pas silencieusement omis.
- **Slider horaire.** Les records de scénario sont pré-agrégés et n'ont pas de champ `minute` ;
  `isMinuteInRange` renvoie `false` pour un `minute` absent dès qu'une borne est posée
  (`timelineBucketing.js:97`). Le prédicat les exempte donc (`skipMinute: true`) — sinon poser le
  slider les ferait tous disparaître. La fenêtre du scénario est déjà appliquée en amont côté
  EventPredict (`windowedPredictedRecords`).

## Risque de régression / à surveiller

- **Double comptage.** Un event **passé avec scénario** existe en double côté shop-level (ventes
  réelles + copie prédictive scalée, `pastPredictive`). `articleRecords` l'évite via
  `scenarioEventIds`, **dérivé du state brut** et non des records déjà filtrés : sinon un event dont
  les filtres excluent tous les articles ressortirait de l'ensemble et ses ventes réelles
  rentreraient par la porte de derrière. Ne pas « simplifier » cette dérivation.
- **Fraîcheur du scénario** (vérifiée, pas seulement supposée). La reconstruction dépend de
  `regeneratePredictions`, déclenché par le watcher `AnalyseView.vue` gardé par
  `if (!hasEnginePredictive)`. Au retour d'Event Predict, `loadSpace` — même en cache frais (< 15 min)
  — dispatche `useSpaceDataFetch`, qui commit `SET_SHOP_GRANULAR` **inconditionnellement**
  (`analyse.js:1786`). Les records `_engine` sont donc écrasés, le garde retombe et la régénération
  a lieu. Fenêtre courte où l'ancien scénario reste affiché (revalidation asynchrone) — comportement
  préexistant, identique pour la rescale du CA. Si quelqu'un rend ce commit conditionnel, les
  articles ET le CA prédit se figeront ensemble sur l'ancien scénario.
- **Mode Analyse inchangé** : `articleRecords` y retourne `chartRecords` à l'identique. À revérifier
  si quelqu'un touche ce computed.
- Test : `tests/unit/predictScenarioRecords.spec.js` (8 cas — mapping, replis, entrées ignorées).
  Suite complète : 3 suites en échec **préexistantes** et sans rapport (`apiOrMock`,
  `spaceMenusInventory`, `eventDetailsEditor` — axios ESM sous Jest 27).

## Références

- `docs/modules/02_ANALYSE.md` — tableau des composants Analyse (ligne mise à jour).
- `docs/modules/01_EVENT_PREDICT_ALGORITHME.md` — « Ce qui dépend d'EventPredictVersion » : le mode
  Predict d'Analyse est désormais un **consommateur de `predictedRecords`**, en plus du Réarmement.
- Fiche [08](08_manualquantities_jamais_envoye_backend.md) — même colonne de version, historique de
  la persistance backend.
