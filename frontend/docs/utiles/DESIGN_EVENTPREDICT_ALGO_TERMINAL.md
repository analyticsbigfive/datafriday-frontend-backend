# Design — Fenêtre « terminal » de traçabilité de l'algo (EventPredict)

**But** : pendant le chargement d'EventPredict, afficher une petite fenêtre façon terminal qui détaille, en clair, les étapes du scoring menant aux events retenus. Objectif produit : **rassurer le client** — les prédictions viennent d'un algorithme pondéré explicite, pas d'une boîte noire.

**Contraintes non négociables** (demande explicite) :
- **Ne PAS ralentir la page.**
- **Pas verbeux, mais explicite** : quelques lignes qui disent le pourquoi.

---

## 1. Faisabilité (vérifiée en code)

La donnée existe **déjà**, calculée une seule fois — rien à recalculer :

- `src/utils/predictiveAnalytics.js` → `calculateSimilarity(target, past)` renvoie
  `{ event, score, maxPossibleScore, scorePercentage, scalingFactor, breakdown }`,
  où `breakdown` = contribution par dimension (`eventType`, `configuration`, `category`,
  `subcategory`, `performer`, `visitingTeam`, `sponsor`, `dayOfWeek`, `showTime`, `attendance`).
- `findAndScorePastEvents(...)` → tableau trié par score décroissant.
- `generatePredictionsForEvent(...)` → `topMatches = scoredEvents.slice(0, 10)` ; poids de chaque event = `score / Σ scores`.
- `src/composables/usePredictiveTimeline.js` L482 calcule déjà `allScoredEvents = findAndScorePastEvents(...)` et **log déjà** une ligne diag (L498).

→ Le terminal ne fait qu'**exposer et afficher** ces objets. **Coût CPU ≈ 0** (pas de re-scoring).

---

## 2. Contenu (explicite, non verbeux)

Cible ~6-12 lignes, une par event retenu + en-tête/pied :

```
▸ Prédiction · CIV 16e de finale (Sport · Football · Ligue 1)
▸ 14 évènements passés analysés · 3 écartés (catégorie ≠, affluence >40%)
  ✓ PSG–Lyon      12/04/25   type+100 sous-cat+800 équipe+800 affluence+180   score 1880 (94%)  poids 24%
  ✓ PSG–Nice      03/02/25   type+100 sous-cat+800 affluence+150               score 1050 (52%)  poids 13%
  ✓ PSG–Reims     18/11/24   type+100 sous-cat+800 affluence+120               score 1020 (51%)  poids 12%
  … (top 10 retenus)
▸ Mélange pondéré des 10 meilleurs → projection minute par minute
▸ Confiance : élevée
```

Règles de contenu :
- **Top K seulement** (K = 10 max, comme l'algo) — jamais les N events (anti-DOM géant, anti-bruit).
- N'afficher que les **dimensions non nulles** du breakdown (pas `+0`).
- Une ligne d'exclusions agrégée (combien écartés + raisons), pas le détail par event écarté.
- Libellés FR lisibles (« sous-cat », « affluence », « équipe ») — pas les clés techniques.

---

## 3. Architecture

1. **Exposer le trace** (usePredictiveTimeline) : à l'endroit où `allScoredEvents` est déjà calculé, construire un objet `computeTrace` réactif :
   ```
   { target, scannedCount, excludedCount, excludedReasons[], retained: [{name,date,breakdown,score,pct,weight}], confidence }
   ```
   Construit à partir des données déjà en main. Retourner un `ref` (ou l'émettre) en plus des sorties actuelles.
2. **Composant `AlgoTraceTerminal.vue`** : présentational, reçoit les refs déjà exposées (`candidateEvents`, `selectedPredictionEventIds`, `excluded*`, confidence, `targetLabel`), calcule les lignes. Monospace, style terminal, mais **couleurs = design tokens du site** (cf. [[design-reference-keep-site-theme]] — look terminal OK, NE PAS copier un thème vert-sur-noir étranger à la charte).
3. **Placement (implémenté)** : un **déclencheur discret** (« Voir le détail du calcul ») sous la timeline ouvre une **popup dismissable** (`v-dialog` : fermeture backdrop / Esc / bouton ✕). Le corps est **rendu à l'ouverture** (v-dialog lazy) → coût nul tant que la popup est fermée. Pendant `timeline.timelineLoading`, le déclencheur affiche « Calcul de la prédiction… ». Ne bloque jamais le paint.

---

## 4. Garanties de performance (à respecter à l'implémentation)

- **Zéro re-calcul** : lire `scoredEvents`/`breakdown` déjà produits. Interdit d'appeler `findAndScorePastEvents` une 2e fois pour le terminal.
- **Pas de « typewriter » qui gate** : surtout **pas** de `setTimeout` par ligne qui donnerait une fausse impression de lenteur ou retarderait la lecture des vraies données. Si effet de streaming souhaité, purement **CSS** (fade/opacity) et non bloquant, désactivable via `prefers-reduced-motion`.
- **Cap DOM** : top 10 lignes max ; le reste résumé (« +N autres »).
- **Construction paresseuse** : ne matérialiser les chaînes du breakdown que si le panneau est ouvert (ou une seule fois, cheap). Le panneau replié ne coûte rien.
- **Mémoïsation** : usePredictiveTimeline mémoïse déjà la sélection/timeline ; le trace suit la même clé (pas reconstruit à chaque render).
- **Vérif obligatoire** : mesurer le temps de `loadAll`/premier paint avant/après (doit être identique) + FPS pendant l'ouverture du panneau. Critère : delta paint < bruit de mesure.

---

## 5. Ce que ça n'est PAS

- Pas un vrai terminal interactif (pas d'input, pas de commandes).
- Pas un log verbeux de debug (le `console.log` diag reste séparé, dev-only).
- Pas une animation spectacle qui ralentit — c'est un **récapitulatif honnête et compact** du calcul réel.

---

## 6. Plan d'implémentation (proposé, à valider)

1. usePredictiveTimeline : exposer `computeTrace` (dérivé des données déjà calculées). ~30 lignes, non bloquant.
2. `AlgoTraceTerminal.vue` : présentational + CSS terminal aux tokens du site. ~80 lignes.
3. Brancher dans EventPredictView sous la timeline, replié par défaut post-prédiction.
4. Vérif perf (paint avant/après) + rendu sur 1 event réel.

Estimation : petit, isolé, réversible. Aucun impact algo (lecture seule).
