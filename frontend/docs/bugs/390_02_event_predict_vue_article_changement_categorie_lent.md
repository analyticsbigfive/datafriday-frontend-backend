# BUG-390-02 : Event Predict, vue Par article : changer de catégorie prend plusieurs secondes

- **Statut** : 🟡 Corrigé non déployé (branche `fix/bug-390-02-event-predict-categories-lentes`, non commité, 2026-10-01)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Event Predict (onglet Configuration, vue Par article)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-10-01 (signalement Skype, Jean Bouin, SFP-Montpellier)
- **Fichiers** : `src/components/space-workspace/event-predict/sections/EventPredictMenusSection.vue`
  (`:717`, `:1708`, `:2054`, `:2270`, `:2282`, `:2457`, `:2468`)

## Symptôme

Jean Bouin, SFP-Montpellier, configuration `cmt7frv1p0022m36lcsxqo5zq`, vue Par article (338 articles, 36 PDV).
Un clic sur une catégorie (ex. Burger) met plusieurs secondes à afficher les cartes de la catégorie ; pendant
ce temps l'écran garde l'ancienne liste.

## Mesures (2026-10-01)

Banc Jest (jsdom) qui monte le vrai `EventPredictMenusSection` avec Vuetify réel et la transition réelle, aux
volumes de production : 342 articles, 36 PDV, 27 PDV avec Space Menu (jusqu'à 42 articles), 40 lignes de
prévision par PDV.

| Action | Durée |
|---|---|
| Montage initial (vue Par article, « All ») | 1,8 à 1,9 s |
| « All » vers « Burger » (9 cartes restent) | 80 à 150 ms |
| « Burger » vers « All » (333 cartes montées) | 1,3 à 1,5 s |
| Re-rendu de la vue complète sans aucun changement | 330 ms |

Les mesures en jsdom ne comptent ni la mise en page ni le dessin du navigateur. Dans Chrome, il faut ajouter le
coût de mise en page de centaines de cartes.

Banc séparé dans Chrome sans interface (cartes simplifiées) : la liste animée (`transition-group`) ajoute 20 à
160 ms par changement de catégorie. Ce n'est pas la cause principale.

## Cause racine

Pas de coupable unique : le coût est **proportionnel au nombre de cartes montées d'un coup**, et la vue en monte
toutes, sans pagination.

1. **342 cartes rendues d'un coup** (`groupedItemViewEntries`, `:717`). Chaque carte instancie une douzaine de
   composants : Card, CardHeader, CardTitle, 2 Badge, Slider, Button, Label, le menu ⋮
   `EventPredictRowActions` (`v-menu`) et `EventDrawerShell` (Teleport). Revenir sur « All » ou passer d'une
   grosse catégorie à une autre remonte des centaines de cartes, soit environ 4 ms par carte.
2. **Calculs refaits à chaque rendu**, pour chaque carte (profil CPU) :
   - `itemViewCategoryChips()` (`:2054`) est une *méthode* appelée dans le template : elle reparcourt les
     342 articles et résout leur catégorie à chaque rendu.
   - `isItemAdjustmentMixed` / `getItemAdjustmentValue` (`:2282`) passent par
     `getSelectedElementsForMenuItem` (`:2270`) : un filtre sur les 36 PDV, avec un `includes` sur la sélection,
     pour chacune des cartes.
   - `isItemAssignedEverywhere` (`:2468`) appelle `assignedIdsForElement` (`:2457`), qui **reconstruit un `Set`**
     des articles du Space Menu pour chaque PDV et chaque carte (342 × 36 constructions par rendu).
   - `groupByMenuItemArray` (`:1708`) appelle aussi `assignedIdsForElement` dans sa double boucle
     article × PDV.
3. **Animation de la liste** (`transition-group`, ajouté par BUG-315-01) : pour chaque carte qui sort, Vue 3.5
   force un recalcul de mise en page (`forceReflow`). Le coût est secondaire mesuré seul, mais il s'ajoute au
   reste sur une page lourde.

Pistes écartées : le filtre lui-même (`filteredMenuItemsForItemView`, quelques ms) ; le composant `Tabs` de
`src/ui` (aucun effet de bord) ; un rechargement côté parent (aucun événement émis au changement de catégorie).

## Correction

À faire, par ordre d'impact :

1. **Rendu progressif de la liste** : afficher les 30 premières cartes, puis les suivantes par lots de 30 quand
   une sentinelle en bas de liste devient visible (`IntersectionObserver`). Le compteur repart à 30 à chaque
   changement de catégorie, de recherche ou de chip. Logique dans un composable dédié
   (`src/composables/useIncrementalList.js`), pas dans le composant de 3 941 lignes.
2. **Index mémoïsés au lieu de méthodes** :
   - `itemViewCategoryChips` devient un `computed`.
   - `assignedIdSetByElement` : `computed` qui construit une seule fois `Map(elementId → Set(ids))`.
     `assignedIdsForElement`, `isItemAssignedEverywhere` et `groupByMenuItemArray` le lisent.
   - `selectedElementsByMenuItem` : `computed` `Map(menuItemId → elements[])` pour
     `getSelectedElementsForMenuItem` / `isItemAdjustmentMixed`.
3. **Animation** : la garder pour ce qu'elle corrige (cartes traitées sous un chip, BUG-315-01), mais la couper
   au changement de catégorie (`:css="false"` pendant la bascule), pour éviter un recalcul de mise en page par
   carte qui sort.
4. Optionnel : ne monter le `v-menu` du kebab qu'au premier clic (bouton seul par défaut).

Objectif : moins de 150 ms par changement de catégorie sur le banc, montage initial sous 400 ms.

## Risque de régression / à surveiller

- BUG-315-01 : une carte traitée sous un chip doit rester visible jusqu'au changement de chip. Elle doit aussi
  rester dans la partie affichée de la liste progressive.
- Recherche texte : un article trouvé au-delà des 30 premières cartes doit apparaître (le compteur repart de 30
  sur une liste déjà filtrée).
- Le tiroir latéral d'un article ouvert doit rester ouvert si sa carte reste affichée.
- Les sliders, le « Mixte » et l'action « ajouter à tous les PDV » doivent donner les mêmes valeurs qu'avant :
  tests unitaires sur les nouveaux index.
- Vue par PDV non concernée (elle n'utilise pas ces chemins), mais à revérifier rapidement.

## Banc de mesure

Spec Jest temporaire (non commitée) : monte le composant avec Vuetify (`vuetify/dist/vuetify.js`, car Jest 27 ne
lit pas les `exports`), `transition-group` réel, `Teleport` remplacé. Lancement :
`npx vue-cli-service test:unit <spec> --transformIgnorePatterns '/node_modules/(?!(\.pnpm/vuetify[^/]*/node_modules/)?vuetify/)'`.
Profil CPU : `node --cpu-prof node_modules/@vue/cli-service/bin/vue-cli-service.js test:unit <spec> --runInBand`.
À relancer après le fix pour comparer avec les chiffres ci-dessus. Confirmation finale dans Chrome : onglet
Performance sur la page de production, clic sur « Burger » puis « All ».

## Références

- BUG-315-01 (origine du `transition-group`), BUG-387-02 (autre lenteur Event Predict, rechargements par PDV).
- Question Event Predict V2 (2026-10-01) : `EventPredictMenusSection.vue` est partagé entre V1 et V2, la V2 ne
  corrigerait pas ce bug.

## Mise en œuvre (2026-10-01)

Branche `fix/bug-390-02-event-predict-categories-lentes` : rendu progressif (`src/composables/useIncrementalList.js`, lots de 30), index mémoïsés (`src/utils/eventPredictItemIndexes.js`), transitions coupées au changement de catégorie. Banc : Burger vers All 1,2 à 2 s → 107 à 128 ms ; montage 1,8 s → 330 ms ; re-rendu 330 ms → 35 ms. Tests : eventPredictItemViewPerf.spec.js (équivalence avec l'ancien calcul), useIncrementalList.spec.js. Reste : vérification dans Chrome (onglet Performance, défilement).
