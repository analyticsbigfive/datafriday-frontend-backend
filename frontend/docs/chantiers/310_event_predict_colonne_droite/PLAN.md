# Plan — Event Predict : redesign de la colonne de droite

## État d'avancement (2026-08-13)

- [ ] Étape 0 — branche dédiée depuis `origin/develop` + plan/artefact commités
- [ ] **À CODER — chantiers dans cet ordre, un commit chacun :**
  1. [ ] Item 1 — navigation compacte (Résumé + icônes tooltipées, fix onglet+scroll)
  2. [ ] Item 2 — coût staff hoisté (fetch au chargement événement)
  3. [ ] Item 3 — tableau de synthèse Prédictif/Ajusté + cartes Coût Staff / Coût Matières
- [ ] Vérification : `pnpm test:unit` (baseline : échecs préexistants `spaceMenusInventory`, `apiOrMock`, `eventDetailsEditor`)
- [ ] PR — cible à confirmer (CONTRIBUTING dit `staging`)

Artefact maquettes : `artefact-maquettes.html` (même dossier) — publié : https://claude.ai/code/artifact/c27166b5-4402-4264-aac7-480c7fbcfe40

## Contexte

La colonne de droite d'Event Predict (`EventPredictView.vue:946-1069`, bloc `.ep-metrics`, 340 px) affiche
une nav en pills qui wrappe sur 2 lignes, sans état actif réel (1ᵉʳ pill rouge en dur, CSS `:9793`), et
6 cartes KPI. Demande maquette 08/2026 : nav compacte (pill Résumé + icônes tooltipées), tableau de
synthèse Prédictif/Ajusté sous le résumé, décomposition du coût en Staff + Matières.

Décisions produit (validées) :
- **Résumé** (pill) : scroll top **+ ouvre l'éditeur d'événement** (même action que le crayon du bandeau).
- Icônes Configuration / Réappro / Staff : **activent l'onglet** (`predictSectionTab`) **puis scrollent**.
  Aujourd'hui les 3 ancres `:744-746` sont des divs vides empilées → même position de scroll, onglet
  inchangé : bug corrigé par ce chantier.
- Tableau synthèse : **Coût = Matières + Staff**, **Marge = (CA − Coût global)/CA** — la marge affichée
  baisse vs aujourd'hui (matières seules), assumé et à communiquer.
- Cartes : « CA total (HT) » → **Coût Staff** ; « Coût » → **Coût Matières** ; Marge / Per cap / Panier /
  Transformation inchangées (Marge = nouvelle définition globale, cohérente avec le tableau).
- Bandeau rouge (chips « scannés / configuration » sur 2 lignes) : **hors lot** — fix connu
  (`flex-shrink:0` + `white-space:nowrap` sur `.ede-summary-pill`, `EventDetailsEditor.vue:953-973`).

## Règles repo (frontend/CLAUDE.md)

Jamais `pnpm build`, jamais toucher au dev server, jamais commit sans demande explicite, pas de
Co-Authored-By. i18n obligatoire (`translations.js` FR+EN, clé au même index dans les 2 blocs).
Flux données : composant → composable → store Vuex → `api/endpoints/*.api.js`.

---

## Item 1 — Navigation compacte

`EventPredictView.vue` seulement (nav `:950-956`, handler `scrollToAnchor` `:3579-3582`, CSS `:7944-7962` + `:9778-9796`).

1. Remplacer le `<nav class="ep-metrics-anchors">` : pill **Résumé** + groupe de 5 boutons icône :
   - Sources → `showSourcesDrawer = true` — icône `mdi-source-branch` (comme le bouton existant `:605`)
   - Timeline → scroll `#ep-anchor-timeline` — `mdi-chart-line`
   - Configuration → `goToSection('configuration')` — `mdi-tune-variant` (icône du TabsTrigger `:758`)
   - Réappro → `goToSection('stockup')` — `mdi-package-variant-closed` (`:765`)
   - Staff → `goToSection('staff')` — `mdi-account-group-outline` (`:772`)
2. Nouvelle méthode `goToSection(tab)` : `this.predictSectionTab = tab` puis `$nextTick` →
   `scrollToAnchor('ep-anchor-configuration')` (les sections sont montées en `v-if` sur l'onglet actif
   `:829/:906/:932` — le scroll seul ne suffit pas).
3. Pill Résumé : `scrollToAnchor('ep-anchor-summary')` + ouverture de l'éditeur d'événement (déclencher
   la même action que le crayon d'`EventDetailsEditor` — prop/événement existant du bandeau `:439-463`).
4. Tooltips : `v-tooltip location="bottom"` (pattern `analyse/panels/SummaryPanel.vue:58-70` — les
   EventPredict* n'utilisent que `title` natif aujourd'hui, insuffisant pour le texte riche demandé)
   + `aria-label` sur chaque bouton.
5. Ancre timeline : `#ep-anchor-timeline` n'existe que dans la branche future-event (`:529`) — désactiver
   (griser) l'icône Timeline quand `isPastSelectedEvent` sans timeline rendue, ou pointer vers la
   chronologie passée équivalente.
6. i18n (~7 clés FR+EN) : `epNavResumeTip`, `epNavSourcesTip`, `epNavTimelineTip`, `epNavConfigTip`,
   `epNavStockTip`, `epNavStaffTip` (+ réutiliser `epSummary`, `epSources`).
7. Supprimer le CSS du hack `a:first-child` rouge (`:9793-9796`).

## Item 2 — Coût staff au niveau vue

Le backend renvoie déjà tout : `GET /events/:id/staffing` (`api/endpoints/staffing.api.js:10`), store
`staffing` (`store/modules/staffing.js`, TTL 15 min par eventId, getter `totals` →
`{ predictedCost, adjustedCost }`). Consommé uniquement par `EventPredictStaffSection.vue:287`,
monté seulement quand l'onglet Staff est actif (`:932`) — la colonne de droite ne peut donc pas le lire.

1. `EventPredictView.vue` : au chargement/changement d'événement (là où `loadAll` s'orchestre),
   `store.dispatch('staffing/fetchStaffing', { eventId })` fire-and-forget (catch → warn, pas de blocage).
2. Computeds : `staffPredictedCost` / `staffAdjustedCost` (getter `staffing/totals`, fallback 0),
   `staffingReady` (payload chargé ou erreur avalée).
3. **Ne pas casser** `EventPredictStaffSection` : il continue de lire le même store (cache partagé, pas de
   double fetch grâce au TTL).

## Item 3 — Tableau de synthèse + cartes coûts

`EventPredictView.vue` template `:957-1068` + computeds `:3098-3129`.

1. Nouveaux computeds : `totalPredictedCostGlobal = totalPredictedCost + staffPredictedCost` (idem
   ajusté) ; `predictedMarginGlobal` / `adjustedMarginGlobal` sur le coût global. **Garder**
   `totalPredictedCost`/`totalAdjustedCost` intacts (utilisés par le fallback matières et les cartes).
2. Tableau synthèse sous `.ep-metrics-head` : 2 lignes (Prédictif / Ajusté — ligne ajustée en rouge) ×
   3 colonnes (CA total HT · Coût · Marge). `font-variant-numeric: tabular-nums`, scroll-x interdit
   (340 px suffisent). Skeleton `ep-skel-value` (pattern `:9132-9145`) tant que
   `predictedReady`/`staffingReady` faux.
3. Cartes : remplacer « CA total (HT) » par **Coût Staff** (`epMetricStaffCost`, valeurs staff, skeleton
   sur `staffingReady`) ; renommer « Coût » → **Coût Matières** (`epMetricMaterialsCost`, computeds
   inchangés) ; carte Marge → marge globale. Per cap / Panier / Transformation inchangées.
4. Dégradé : staffing en erreur ou vide → Coût Staff affiche 0 €, tableau retombe sur la marge matières.
5. i18n : `epMetricStaffCost` (« Coût Staff » / « Staff cost »), `epMetricMaterialsCost`
   (« Coût Matières » / « Materials cost »), `epSynthPredicted` (« Prédictif » / « Predicted » —
   réutiliser `epmAdjusted` pour « Ajusté »).
6. Rafraîchir les commentaires périmés « 4 cards en 2×2 » (`:465-468`, `:942-945`).
7. Responsive : vérifier les 3 breakpoints existants (`:9803-9880` — ≤1399 grid 3 col, ≤900 colonne,
   ≤640 1 col) avec le tableau ajouté.

**Attention marge** : `predictedMargin`/`adjustedMargin` actuels (`:3120-3129`) restent utilisés ?
Vérifier les autres consommateurs avant de les rediriger — si seules les cartes les lisent, les
rebrancher sur la version globale ; sinon créer les computeds `*Global` à côté.

## Vérification

1. Dev server (user) : nav → chaque icône active le bon onglet **et** scrolle ; tooltips au survol ;
   Résumé remonte + ouvre l'éditeur.
2. Tableau : valeurs cohérentes (Coût = somme des 2 cartes coûts ; Marge conforme à la formule).
3. Staff : événement avec staffing planifié → Coût Staff non nul ; événement sans staffing → 0 € sans
   erreur console ; onglet Staff toujours fonctionnel (pas de double fetch — network).
4. Skeletons pendant le calcul timeline et le fetch staffing.
5. Responsive 1399/900/640 px.
6. `pnpm test:unit` — baseline échecs préexistants inchangée.
