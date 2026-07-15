# Confrontation prototype React legacy (`versionReact/`) ↔ base de connaissance actuelle

> Réalisé le 2026-07-15. Le prototype React se trouve dans `datafriday-web/old/versionReact/`
> (hors git, quarantaine) : une app générée via Figma Make ("3D Virtual Space Builder"), 225
> fichiers, ~121 000 lignes de `.ts`/`.tsx` (hors `components/ui/` shadcn boilerplate). C'est
> l'étape intermédiaire entre le tout premier prototype Supabase KV (voir `00_INDEX_ET_SYNTHESE.md`
> et les rapports 01-04 de ce dossier) et le port Vue actuel en prod.
>
> Le backend Edge Function embarqué dans `versionReact/src/app/supabase/functions/server/` est une
> version quasi identique (antérieure de 66 lignes) à celle déjà analysée dans les rapports 01-04 —
> pas ré-analysé ici, aucune perte d'information.
>
> Méthode : 6 agents ont lu le code métier React (composants, hooks, utils — en excluant
> `components/ui/` shadcn, `components/figma/`, `imports/pasted_text/`) et confronté chaque domaine
> aux docs actuelles dans `docs/utiles/`. Le détail intégral de chaque agent est dans les 6 fichiers
> de ce dossier :
> - [06_REACT_ALGORITHME_PREDICTION.md](06_REACT_ALGORITHME_PREDICTION.md) — la comparaison la plus
>   importante de toute l'investigation
> - [07_REACT_ANALYSEVIEW.md](07_REACT_ANALYSEVIEW.md)
> - [08_REACT_BUILDER_3D.md](08_REACT_BUILDER_3D.md)
> - [09_REACT_CATALOGUE_MENU.md](09_REACT_CATALOGUE_MENU.md)
> - [10_REACT_DATA_INTEGRATION_WIZARD.md](10_REACT_DATA_INTEGRATION_WIZARD.md)
> - [11_REACT_EVENTS_INVENTORY_HR.md](11_REACT_EVENTS_INVENTORY_HR.md)

## ⚠️ La découverte la plus importante : `ALGORITHME_PREDICTION_NEW_RULES.md` ne décrit pas fidèlement le code React qu'il prétend documenter

Sur au moins 6 points structurants, le code source réel de `predictiveAnalytics.ts` /
`usePredictiveTimeline.ts` **contredit** ce que NEW_RULES affirme être acquis :

| Règle affirmée par NEW_RULES | Réalité du code React |
|---|---|
| "Plus de split 70/30, poids purs" | Le split 70/30 est **toujours actif** dans `usePredictiveTimeline.ts` (le moteur qui alimente la courbe minute affichée à l'utilisateur) ET dans `AnalyseView.tsx`. Seul le moteur "engine" séparé (`generatePredictionsForEvent`) utilise les poids purs. **Deux moteurs concurrents, deux formules différentes.** |
| "Repli non déterministe supprimé (plus de Math.random)" | `Math.random()` toujours présent dans `predictiveAnalytics.ts:395` et `usePredictiveTimeline.ts:362` pour le fallback low-confidence. |
| "Fenêtre d'affluence ±40% symétrique" | Fenêtre réelle **asymétrique** `[0.5×, 2.0×]` (soit -50%/+100%) dans `predictiveAnalytics.ts:278-287`. |
| "visitingTeam jamais l'équipe à domicile (déjà OK)" | Le code retombe explicitement sur le champ `team` (domicile) si `visitingTeamId`/`visitingTeam` sont absents (`predictiveAnalytics.ts:186-188`, commentaire `// sometimes stored in 'team'`). |
| "showTime jamais de défaut 19:00 (déjà OK)" | Défaut `'19:00'` codé en dur des deux côtés (`predictiveAnalytics.ts:247-248`), avec même un flag UI dédié pour le signaler. |
| "Comparaisons normalisées (eqNorm)" | Aucune fonction `eqNorm` n'existe dans tout le repo — toutes les comparaisons sont `===` strict. |
| Gate "Configuration" (+100 pts) | **N'existe pas** dans le code — ni gate, ni champ `configuration` dans l'algorithme. Le vrai score max calculé est 2900, pas 3000. |

**Conséquence** : si le portage Vue actuel suit vraiment NEW_RULES à la lettre, le portage n'était
**pas 1:1** depuis ce code React (contrairement à une note mémoire antérieure) — quelqu'un a corrigé
des bugs au passage sans le documenter comme tel. Il resterait à vérifier directement les fichiers
Vue en prod (`src/utils/predictiveAnalytics.js`, `src/composables/usePredictiveTimeline.js`) pour
savoir laquelle des deux histoires (NEW_RULES ou le code React réel) décrit fidèlement ce qui tourne
aujourd'hui. Tant que cette vérification n'est pas faite, traiter NEW_RULES comme une **cible**,
pas comme une preuve de ce qui est en prod.

Autre découverte utile : le fichier que `ALGORITHME_PREDICTION_DEFINITIF.md` pointe comme "à
corriger" (`predictiveAnalyticsTimeline.ts`) est en réalité **du code mort, jamais exécuté** dans
l'app React — le vrai moteur live pour la courbe minute est `usePredictiveTimeline.ts`, qui a ses
propres bugs différents (ci-dessus).

## Deuxième découverte majeure : la formule d'inventaire n'était pas appliquée uniformément

`PEPITES_EXTRAITES.md` §2.1 présente
`totalUnits = packedUnits × (inventoryQuantityPackaged || 1) + looseUnits` comme LA règle. Le code
React montre que cette formule correcte n'existe qu'à **2 endroits sur ~6** — partout ailleurs,
y compris à l'écriture réelle en base (`SpaceInventory.tsx:781`) et dans tout `InventoryView.tsx`
(vue parallèle toujours montée), c'est une formule additive **sans multiplicateur**
(`packedUnits + looseUnits`), donc fausse. **À vérifier d'urgence côté Vue actuel** : la bonne
formule a-t-elle vraiment remplacé la mauvaise partout, ou seulement à certains endroits comme dans
le prototype ?

## Troisième découverte : incohérence multiplication/division sur le coût des Components

5 variantes successives du "Component Builder" React coexistent, avec un désaccord non résolu :
4 fichiers calculent `unitCost = totalSubCost × numberOfUnitsRecipe` (multiplication), 1 seul
(`ComponentEditor.tsx`) fait `totalSubCost ÷ numberOfUnitsRecipe` (division). Économiquement, avec
un champ libellé "combien d'unités produit la recette", la **division** est la formule cohérente
(coût total ÷ unités produites = coût unitaire) — la multiplication ferait exploser le coût pour
tout batch >1 unité. Le fichier le plus abouti (probablement le "vivant", `ComponentBuilderPanel.tsx`)
est du côté de la formule suspecte. **À vérifier contre le backend actuel avant tout portage.**

## Autres découvertes transverses à fort intérêt

- **Le modèle React registre/placement permettait une géométrie différente par configuration**
  pour un même élément physique (même boutique, position différente selon l'event) — capacité que
  le modèle Vue actuel (une seule row `SpaceElement`) n'a pas, et que `REFONTE_3D_BUILDER_V2.md` ne
  prévoit pas non plus de réintroduire. Détail dans le rapport Builder 3D.
- **Plusieurs "résidus de portage React" documentés comme morts sont en fait des régressions du
  port Vue**, pas un héritage mort : la fonctionnalité de recherche+surbrillance d'éléments 3D, les
  props `allShopMenuItems` alimentant `PropertiesPanel`, `ConfigurationManager.tsx` (qui lui, était
  déjà mort dans React même). Nuance importante pour ne pas sous-estimer le travail de reconstruction
  qu'un futur portage complet nécessiterait.
- **Un bug de code réel trouvé dans `AnalyseView.tsx:6508`** (`shop + shop.totalTransactions` au
  lieu de `sum +`, typo d'accumulateur) — corrompt potentiellement le KPI "Transactions" affiché
  pendant une timeline prédictive. À vérifier si reproduit côté Vue.
- **`readyForSale` existe bien en React** (contrairement à ce que le rapport KV concluait pour le
  backend KV) — la règle vient du React, pas d'une invention pure du backend NestJS. Mais **deux
  logiques d'expansion coexistent** : une version simple (`readyForSale` seul) et une version à
  double condition (`comboItem==='Yes' && readyForSale==='No'`), selon le fichier.
- **`itemType` a 4 valeurs réelles à l'usage** (`Ingredient`, `Component`, `Combo Item`, `Packaging`)
  alors que le type TypeScript partagé n'en déclare que 2 — le fichier de types n'a jamais suivi
  l'évolution réelle du code, à la fois en React et probablement un signal d'alerte pour la
  cohérence des types côté backend actuel.
- **Le prix par espace ("nouveau, 2026-06-30" selon la mémoire projet) avait déjà un modèle de
  données quasi identique dans le prototype React** (`calculateSpacePricingData`,
  `SpaceSpecificPrice`, `spacePricingData`). Antériorité frappante — la feature de 2026 a
  probablement redécouvert/reconstruit un besoin déjà modélisé, pas inventé de zéro.
- **L'algorithme de similarité du wizard d'intégration est comportementalement bien documenté par
  `LOCATION_INTEGRATION_WIZARD.md`, mais mal attribué** : la doc pointe vers un module partagé
  (`levenshtein.ts`) qui est en réalité du **code mort, jamais importé** ; la vraie logique est une
  fonction locale dupliquée 3 fois dans 3 fichiers différents, avec des seuils divergents non
  harmonisés (0.3 / 0.5 / 0.6 selon l'écran).
- **Une étape "Finalizing Data" documentée comme réelle dans le wizard React est en fait du JSX
  mort**, jamais atteignable — vestige d'une renumérotation d'étapes antérieure.
- **Aucun garde-fou `MAX_DEPTH`** dans la logique de disponibilité catalogue↔espace de
  `SpaceMenusPanel.tsx` — contrairement à l'expansion documentée ailleurs (MAX_DEPTH=10). Risque de
  boucle infinie sur une référence circulaire, jamais corrigé dans le prototype.
- **Le lien "staffPositions FBElement → coût staff dans Analyse" affirmé par
  `GUIDE_PARCOURS_APP.md` §12 n'existe pas dans le code React** — si ce lien existe aujourd'hui côté
  Vue, il a été reconstruit de zéro, pas porté depuis ce prototype.

## Ce qui confirme solidement nos docs actuelles

- La quasi-totalité de `SPACE_ANALYSE_PREDICT_EVENT_PREDICT_REACT_LOGIC.md` est fidèle au code
  React (pipeline de filtres, conditions de génération prédictive, formules KPI, tri, agrégation
  mensuelle qui ne propage pas `isPredictive`).
- L'expansion récursive `readyForSale`/`MAX_DEPTH=10`/formule de quantité de
  `EVENT_PREDICT_SECTIONS.md` est vérifiée caractère pour caractère dans
  `EventPredictStockUpSection.tsx`.
- Les règles de compatibilité F&B strictes (gppremium/temporary/Beer/Food/Beverage/Combo) sont
  confirmées à l'identique.
- La projection isométrique, l'empilement vertical, les couleurs par type, le zoom/rotation du
  builder 3D sont fidèles au caractère près à `ARCHITECTURE_3D_BUILDER.md`.
- Les seuils de marge par Type (68/75%), le système d'agrégation P&L par Category/Type (déjà
  repéré comme "peut-être perdu" dans la confrontation KV) sont confirmés comme ayant existé
  **aussi côté React**, avec une vraie UI affichée à l'écran — ce n'était pas de la plomberie
  backend morte.

## Pépites à ajouter au corpus de connaissance (non exhaustif — détail dans les 6 rapports)

- `SupplierItem.sites: string[]` — tableau **vide** = TOUS les sites (pas aucun) ; sémantique
  contre-intuitive absente de PEPITES §4.2.
- Purchase Packaging vs Inventory Packaging avec auto-synchronisation par défaut, éditables
  séparément — pertinent pour le module Logistic actuel.
- Modèle de promotion/réduction entre deux MenuItems (`isPromotion`, `discountedProductId`,
  `promotionTypeId`) — fonctionnalité entière, jamais documentée, potentiellement jamais portée.
- Entité `Area` référentielle avec couleur (React) vs simple string libre `attributes.area` (Vue
  actuel) — piste d'enrichissement pour la v2 du builder.
- Storage lié à des shops spécifiques avec inventaire consolidé calculé — feature complète du
  prototype, disparue du modèle Vue actuel (`ElementInventory` autonome par élément).
- Formule per-capita/moyenne panier/moyenne événement (React) non capturées dans PEPITES.

## Bugs de code trouvés (utiles comme leçons, pas comme héritage à porter)

- `AnalyseView.tsx:6508` — typo d'accumulateur corrompant un KPI transactions en mode timeline.
- `SpaceInventory.tsx`/`InventoryView.tsx` — formule d'inventaire additive fausse à la sauvegarde
  réelle en base (voir découverte n°2 ci-dessus).
- Deux endpoints de suppression de mapping shop-element qui répondent succès sans avoir rien
  supprimé (déjà vu côté KV — le même défaut existe indépendamment côté React dans d'autres
  fonctions, cf. rapport data integration wizard).
- Filtre storage `merch` qui ne filtre rien du tout (bug), filtre `material` mort en pratique
  (jamais retourné par la fonction de résolution).
- `Team.subcategory` stocke en réalité un ID, pas un nom, sous un nom de champ trompeur.
- Auto-heal destructif silencieux : suppression automatique de doublons de catégories d'event à
  chaque chargement de page, sans confirmation utilisateur.
