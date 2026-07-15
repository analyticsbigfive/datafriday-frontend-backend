# Rapport de confrontation — Wizard d'intégration React vs docs actuelles

> Docs de référence : `LOCATION_INTEGRATION_WIZARD.md`, `DATA_INTEGRATION_FB.md`,
> `02_AGREGATION_REVENUS_WEEZEVENT.md` (confrontation du backend KV).
>
> Fichiers cités (sous `datafriday-web/old/versionReact/src/app/`) :
> `components/LocationIntegrationWizard.tsx`, `components/ShopMappingDialog.tsx`,
> `components/FBIntegrationView.tsx`, `components/TransactionProcessingStep.tsx`,
> `components/MenuMappingStep.tsx`, `components/MenuRevenueStep.tsx`,
> `components/CSVMappingDialog.tsx`, `components/AggregationQueuePanel.tsx`,
> `components/EventsImportWizard.tsx`, `utils/levenshtein.ts`, `utils/eventApi.ts`,
> `utils/eventTypeDiagnostics.ts`.

## 1. Correspondances confirmées

**Algorithme de similarité — la doc décrit le bon algorithme, mais pas le bon fichier.**

`LOCATION_INTEGRATION_WIZARD.md:67-69` documente : *« exact match → 1.0 | substring → 0.8 | mots
communs → score proportionnel, seuil 0.6 »*. Ce comportement est **exact**, mais il ne provient
**pas** de `utils/levenshtein.ts`. Il correspond à une fonction locale, redéclarée dans
`LocationIntegrationWizard.tsx:276-293` :

```ts
// components/LocationIntegrationWizard.tsx:276-293
const calculateSimilarity = (str1, str2) => {
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  // ratio de mots en commun (includes bidirectionnel)
  return matchingWords / Math.max(words1.length, words2.length);
};
```

Les seuils confirmés par site d'appel :
- `findBestElementMatch` (mapping shops, étape 2) : seuil **0.6**, commentaire *"Raised threshold
  from 0.5 to 0.6"* — `LocationIntegrationWizard.tsx:990`
- `getSuggestedMenuItem` (mapping menu, étape 3) : seuil **0.6** —
  `LocationIntegrationWizard.tsx:2471`
- Badge ⭐ dans le dropdown manuel : `isSuggested = similarity > 0.6` —
  `LocationIntegrationWizard.tsx:4281`
- `getSuggestedSpace` (étape 1, suggestion d'espace) : seuil **0.3**, non documenté dans
  LOCATION_INTEGRATION_WIZARD.md — `LocationIntegrationWizard.tsx:301`

**5 phases de `loadShopMappingData`** (`LocationIntegrationWizard.tsx:624-973`) : confirmées dans
leur séquence (chargement sources → extraction registre → traduction floor-id→registry-id →
auto-matching → fusion non-sauvegardé), avec des nuances importantes (voir §3).

**6 étapes / logique de navigation** : confirmées pour partie — `handleMapSpace` (`:359`),
`handleSaveShopMappings` (`:1406`), `handleNext`/`canProceed` (`:3709`, `:3821`),
`migrateShopElementIds` + `Promise.all([rebuildShopMappings, rebuildMenuMappings])`
(`:3738-3756`), `processAllEventsTimeline = processAllEvents` alias exact (`:3572`), gating
« commence par All » via `eventTimelineMessage.substring(0,5).includes('All')` (`:4514`,
`:5149`). Le staging (`stagedChanges`/`applyAllStagedChanges`/`applyProgress`) est confirmé
(`:150-152`, `:2784-2841`). La modale d'événement avec champs conditionnels (performer si
entertainment `:2392`, homeTeamName si `hasHomeTeam` `:2397`, sponsor si tradeshow `:2400,:5499`)
est confirmée. Le double système de progression (`ShopPerformanceProgressIndicator` +
`shopPerformanceJobId` en legacy) est confirmé (`:182`, `:4907-4916`).

## 2. Divergences

**A. Le vrai Levenshtein est du code mort — jamais exécuté.** `LocationIntegrationWizard.tsx:42`
importe `calculateSimilarity` depuis `utils/levenshtein.ts` (exact=1.0, substring=**0.85**, sinon
vraie distance de Levenshtein normalisée). Mais la constante locale `:276` **shadowe** cet import
pour toute la portée du composant. Recherche confirmée (`grep -rn levenshtein`) : ce fichier n'est
importé nulle part ailleurs dans toute l'app React. Résultat : l'algorithme documenté (et censé
être « le » calcul de similarité du produit) n'est en réalité qu'une réimplémentation ad hoc
jamais reliée au module partagé — la doc ne signale pas cette incohérence de code.

**B. 3 copies indépendantes du même algorithme, avec des seuils divergents non harmonisés :**
- `LocationIntegrationWizard.tsx:276-293` (seuils 0.3 / 0.6 selon usage)
- `ShopMappingDialog.tsx:53-74`, utilisé via `findBestMatch` avec seuil **≥0.5** (`:83`) —
  composant appelé uniquement depuis `FBIntegrationView.tsx:1266`, donc un chemin de mapping
  *parallèle*, pas celui du wizard principal
- `FBIntegrationView.tsx:153-179`, `getSuggestedSpace` avec seuil **≥0.3** (`:190`) — l'ancêtre
  direct de l'écran « Suggestion : nom similaire X% » de `DATA_INTEGRATION_FB.md` (§ Étape 1)

**C. Le wizard réel a un « Step 4 » complet absent de la doc : `process-transactions`.** Le type
`WizardStep` (`:58`) et `canProceed()`/`getStepTitle()` (`:3821-3859`) listent 6 valeurs réelles :
`map-space, map-shops, menu-mapping, process-transactions, process-timeline, synchronize-data`.
LOCATION_INTEGRATION_WIZARD.md ne mentionne jamais `process-transactions` (délégué au composant
`TransactionProcessingStep.tsx`, qui appelle
`api.processTransactionTypeDistribution(spaceId, location)` —
`TransactionProcessingStep.tsx:47`). C'est l'étape 4 officielle (« Step 4: Process Transactions »,
`:4346-4359`), intercalée entre Menu Mapping et Process Timeline.

**D. « Finalizing Data » (étape 6 documentée) est du JSX mort, jamais atteignable.**
`currentStep === 'finalizing-data'` est testé (`:5011`, `:5126`) mais **aucun**
`setCurrentStep('finalizing-data')` n'existe dans tout le fichier (vérifié par grep exhaustif de
tous les `setCurrentStep(...)`). Le type `WizardStep` ne contient d'ailleurs même pas cette
valeur, ni `'menu-revenue'`/`'event-timeline'` également référencés en condition (`:5126`) — trois
branches de rendu orphelines issues d'une renumérotation antérieure (le commentaire `:185` « Step
7: Finalizing Data (now Step 8) » en atteste). La vraie finalisation se joue **dans** l'étape
`synchronize-data`, pilotée par le state `finalizingStatus` (`:4830-5010`), pas par une étape
distincte.

**E. Double gating pour le bouton Next de `process-timeline`.** `canProceed()` teste
`eventTimelineStatus === 'complete'` (`:3833`), mais le footer réel du step utilise un test
différent, `eventTimelineMessage.substring(0,5).includes('All')` (`:5149`). Deux sources de vérité
distinctes pour la même action — la doc n'en retient qu'une (celle qui est effectivement câblée au
bouton).

## 3. Pépites nouvelles

- **Auto-guérison des mappings orphelins à chaque chargement**
  (`LocationIntegrationWizard.tsx:936-963`) : après le matching, le code recalcule les
  `registryId` valides et **supprime automatiquement en base** (`api.deleteShopElementMappings`)
  tout mapping shop pointant vers un `registry-*` qui n'a plus d'élément flottant sur aucun plan.
  Non documenté du tout.
- **Le nom affiché du registre peut être obsolète — double passe de lecture** (`:682-779`) : une
  première passe scanne les éléments de plan (floors/forecourt/externalMerch) pour capturer le nom
  *courant*, une seconde passe construit la liste d'éléments en préférant ce nom courant au nom
  stocké dans le registre (`registryElement.name`) s'ils diffèrent (log `"🔄 Using CURRENT floor
  element name instead of registry"`). Les entrées de registre sans élément de plan correspondant
  (« orphelines ») sont explicitement ignorées (`:744-749`). Même motif que la règle "config live
  du builder gagne toujours" trouvée dans le backend KV (voir `01_ALGORITHME_PREDICTION_SCORING.md`
  §3).
- **Retry d'auto-matching si la traduction floor-id→registry-id échoue** (`:892-893`) : si un
  mapping existant pointe vers un floor-id introuvable dans `floorIdToRegistryId`, il est mis à
  `null` (`:871`) puis retenté par l'auto-matching au lieu d'être simplement laissé « non mappé ».
- **Détection de doublons d'événements par nom+date** évoquée dans le rapport KV (§3 de
  `02_AGREGATION_REVENUS_WEEZEVENT.md`) réapparaît structurellement ici sous une autre forme :
  `loadSavedShopRevenue` (`:1470-1501`) regroupe explicitement `byEvent` par `eventName|eventDate`
  et logue les doublons trouvés — un garde-fou de diagnostic, pas de correction automatique.
- **`process-transactions` est le successeur direct de `transaction-distribution.tsx`** (pépite du
  rapport KV §3) : `TransactionProcessingStep.tsx` calcule une distribution shop×date×combinaisons
  *avant* le traitement minute par minute — c'est le même besoin métier (analyse de composition de
  panier / distribution des transactions) que le prototype KV, mais réimplémenté server-side
  (`api.processTransactionTypeDistribution`), sans lien documenté avec l'architecture
  `SpaceRevenueMinuteAgg` actuelle. Point à vérifier si cette étape a un équivalent aujourd'hui.
- **`FBIntegrationView.tsx` confirmé comme ancêtre direct de la page `DATA_INTEGRATION_FB.md`** :
  mêmes deux connecteurs « Weezevent » / « Digifood » (`:1039-1062`), même mécanique « Suggested
  Match » par similarité de nom pour l'association espace. Différence notable : dans le prototype
  React, les deux boutons Weezevent/Digifood sont également cliquables (pas de badge
  « Bientôt »/disabled comme documenté dans la version Vue actuelle) — évolution du produit, pas
  un bug.

## 4. Mort / hors-sujet

- **`utils/levenshtein.ts` en entier** : implémentation Levenshtein complète et correcte, mais
  100% inerte (voir §2.A) — aucune valeur de portage tant que le shadowing n'est pas compris comme
  un bug historique.
- **`ShopMappingDialog.tsx`** : dialogue de mapping shop alternatif, non branché sur le wizard
  principal, redondant avec la logique interne de `LocationIntegrationWizard.tsx` (mêmes
  concepts, implémentation dupliquée). Utile seulement comme second témoin de l'algorithme de
  similarité « historique ».
- **`CSVMappingDialog.tsx`** : générique, utilisé par 6 vues d'admin sans rapport avec le wizard
  d'intégration (`EventCategoriesView`, `HRSuppliersView`, `EventTypesView`,
  `StaffPositionsView`, `MenuBuilder`, `EventSubcategoriesView`). Le seul élément potentiellement
  réutilisable est le système de correspondance heuristique de colonnes CSV (`suggestMapping`,
  patterns exacts puis partiels ordonnés par spécificité, `:53-115`), mais hors du périmètre
  Weezevent/wizard.
- **`AggregationQueuePanel.tsx`** : panneau de gestion d'une queue KV de recalcul « dirty »
  Category/Type (coût/prix moyen/marge du catalogue Menu Item) — même sous-système que
  `aggregation_helper.tsx`/`aggregation_queue.tsx` déjà classé « mort/hors-sujet » dans le rapport
  KV. Rien à ajouter, architecture remplacée par `MenuItemPricingService`.
- **`eventApi.ts` / `eventTypeDiagnostics.ts`** : CRUD Edge Function générique
  (events/types/catégories/teams/sponsors) et utilitaire de détection d'orphelins de taxonomie
  événementielle. Utile comme contexte technique (URL `make-server-eb31619c`, pattern d'init des
  taxonomies par défaut Sport/Entertainment/MICE avec catégories/sous-catégories) mais sans
  rapport direct avec le mapping location→espace ni avec Weezevent.
- **`EventsImportWizard.tsx`** : wizard d'import CSV d'événements (mapping type/catégorie/
  sous-catégorie depuis un CSV) — fonctionnalité d'admin de taxonomie événementielle, sans rapport
  avec le pipeline Weezevent/location.
- **`MenuRevenueStep.tsx`** : composant d'analyse de revenu par menu item avec breakdown
  shop/event, mais son état parent (`menuRevenueStatus`, etc.) n'apparaît dans aucun des
  `WizardStep` actifs du fichier principal analysé — probablement un vestige d'une étape
  antérieure elle aussi retirée du flux courant, comme `finalizing-data`. À vérifier si c'est
  réellement mort ou rattaché à un point d'entrée non couvert par le grep ciblé.
