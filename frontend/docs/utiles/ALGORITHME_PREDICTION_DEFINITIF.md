# Algorithme de prédiction de production — version définitive

> Source : réunion du 24 juin (transcript `24 juin à 14-39.txt`) + code existant
> (`predictiveAnalytics.js`, `predictiveAnalyticsTimeline.js`, `timelineBucketing.js`,
> `stockPlanning.js`, `bomPlanning.js`).
> Branche cible : `develop-fix-buganalyse`.
>
> Ce document est la **spec canonique**. En cas de divergence entre ce document et
> le code, c'est ce document qui fait foi. Voir §8 pour les écarts code↔spec à corriger.

---

## 0. Ce que dit la réunion (extraction)

Portions du transcript qui décrivent l'algorithme, regroupées par thème :

| Thème | Lignes | Contenu |
|---|---|---|
| Facteurs d'influence (affluence) | 3–9 | Le remplissage dépend de l'affiche (petite équipe vs grosse équipe) et du jour (mardi/mercredi/week-end). Ce sont des **facteurs d'influence** de la prédiction. |
| Cœur du projet : quoi vendre | 11–27 | « Qui va être vendu ? ». Un menu (burger) = matière première (pain ×2, fromage ×2, salade, cornichon, mayo 50 g…). But final : **combien commander / acheter par boutique selon le type d'événement**. |
| Multi-stade, données croisées | 45–55 | Un fournisseur sert plusieurs stades. La production se **croise sur les événements passés** (« connexion aux événements passés pour prédire »). Pas basé sur un seul type d'événement. |
| Fournisseurs / composition | 83–87 | Rattacher un plat (burger) aux **différents fournisseurs** qui composent le plan ; un composant = plusieurs fournisseurs possibles → « le plus correspondant ». Comprendre l'algorithme de calcul des prédictions est nécessaire. |
| **Résumé algo (clé)** | 123–141 | Voir ci-dessous, c'est le résumé dicté en réunion. |

Résumé dicté (lignes 123–141), nettoyé :

1. **Entrées** : l'événement, sa sous-catégorie, le nombre de titres/critères par catégorie, la **configuration** (L123–127).
2. **Filtre d'éligibilité** (L129–135) : on **élimine** un événement passé s'il n'y a **pas de match** entre `type de vente / configuration / catégorie`. Une fois retenu :
   - si **influence < 40 %** OU **horaire hors d'une fenêtre de 3 h** → l'événement **n'est pas retenu** pour la production.
3. **Trois calculs** (L137) : poids → position finale = **moyenne des ventes × poids**.
4. **Répartition par minute** (L139–141) — *« le point qui bloque actuellement »* : répartir le prédit **par minute** en utilisant le **profil menu des events passés**.

---

## 1. Vue d'ensemble — pipeline en 5 étages

```
[Event futur] + [Events passés + ventes réelles granulaires + timelines minute]
        │
   ┌────▼─────────────────────────────────────────────────┐
   │ ÉTAGE 1 — SCORING & ÉLIGIBILITÉ                        │  calculateSimilarity()
   │   filtres durs + critères pondérés → score par event  │  findAndScorePastEvents()
   └────┬──────────────────────────────────────────────────┘
        │ events passés éligibles + score + scalingFactor
   ┌────▼─────────────────────────────────────────────────┐
   │ ÉTAGE 2 — SÉLECTION & POIDS                            │  top-N, poids = score/Σscore
   └────┬──────────────────────────────────────────────────┘
        │
   ┌────▼─────────────────────────────────────────────────┐
   │ ÉTAGE 3 — TOTAL JOURNALIER PAR (shop × item)          │  Σ(qté × scaling × poids)
   │   moyenne pondérée + scaling affluence                │  + renorm weightCovered
   └────┬──────────────────────────────────────────────────┘
        │ predictedQty journalier par shop×item
   ┌────▼─────────────────────────────────────────────────┐
   │ ÉTAGE 4 — RÉPARTITION PAR MINUTE                       │  profil normalisé moyen
   │   shape(min) moyenné sur events passés → ×total       │  ← POINT BLOQUANT
   └────┬──────────────────────────────────────────────────┘
        │ records prédictifs granulaires (shop×item×minute)
   ┌────▼─────────────────────────────────────────────────┐
   │ ÉTAGE 5 — STOCK / ACHAT                                │  stockPlanning + bomPlanning
   │   ajustement %, explosion recette → ingrédients       │
   │   → besoin par fournisseur par boutique               │
   └───────────────────────────────────────────────────────┘
```

Étages 1–2 : `predictiveAnalytics.js` (déjà correct).
Étage 3 : `predictiveAnalytics.generatePredictionsForEvent` (correct).
Étage 4 : `predictiveAnalyticsTimeline.js` (**à corriger**, §8).
Étage 5 : `stockPlanning.js` + `bomPlanning.js` (corrects).

---

## 2. Étage 1 — Scoring & éligibilité

### 2.1 Filtres durs (exclusion immédiate sur mismatch)

Un événement passé est **éliminé** (`calculateSimilarity` renvoie `null`) si, **quand l'info existe des deux côtés**, l'un de ces champs ne correspond pas :

| Champ | Poids si match |
|---|---|
| `eventType` (type de vente) | +100 |
| `configurationId` (configuration d'espace / implantation PdV) | +100 |
| `category` | +100 |

Règle : *« pas de match type de vente / configuration / catégorie → éliminé »* (transcript L129–133).
Si un champ est absent d'un côté, on ne filtre pas dessus (on saute, pas d'exclusion).

### 2.2 Critères pondérés (ajoutent du score, n'excluent pas — sauf fenêtres ci-dessous)

| Critère | Poids max | Règle |
|---|---|---|
| `subcategory` | 800 | match exact |
| `visitingTeam` (sport) | 800 | match exact sur `visitingTeamId/visitingTeam` **uniquement** — jamais `team` (= domicile) |
| `performer` (concert) | 800 | match exact |
| `sponsor` (MICE) | 400 | match exact |
| `dayOfWeek` | 500 | week-end (ven/sam) et semaine traités en buckets séparés : exact 500 / même bucket 250 / bucket opposé 0 |
| `showTime` | 400 | exact 400 / ≤1 h 300 / ≤2 h 100 / ≤3 h 0 / **>3 h → exclusion** |
| `attendance` (affluence) | 200 | proportionnel dans ±40 % ; **hors [0,6×, 1,4×] de la cible → exclusion** |

### 2.3 Les deux fenêtres d'exclusion (transcript L133)

- **Fenêtre horaire 3 h** : `|showTime_cible − showTime_passé| > 180 min` → exclu. (= « stockage hors fenêtre de 3 h » dans le transcript, mal transcrit pour *horaire*.)
- **Fenêtre d'affluence ±40 %** : affluence passée hors `[0,6×, 1,4×]` cible → exclu.

### 2.4 Seuil d'influence globale 40 % — **RÈGLE À AJOUTER** (transcript L133)

> *« Sur l'influence est moins de 40 % … l'événement n'est pas retenu pour la production. »*

En plus des fenêtres ci-dessus, un événement passé retenu doit avoir une **pertinence globale ≥ 40 %** :

```
scorePercentage = score / maxPossibleScore × 100
si scorePercentage < 40  → écarter cet event passé de la prédiction
```

`scorePercentage` est déjà calculé dans `calculateSimilarity` mais **pas appliqué comme seuil**. Voir §8-E.

### 2.5 Scaling affluence (mise à l'échelle des ventes)

```
scalingFactor = ticketsSold_cible / ticketsSold_passé      (si les deux > 0, sinon 1.0)
```

Toutes les ventes du passé sont multipliées par ce facteur avant pondération (transcript L45–55 : on adapte les events passés à l'affluence prévue).

---

## 3. Étage 2 — Sélection & poids

```
scored = events passés éligibles, triés par score décroissant
scored = scored.filter(s => s.scorePercentage >= 40)   // §2.4
topMatches = scored.slice(0, 10)                        // max 10
totalScore = Σ topMatches.score
poids_i = score_i / totalScore                          // Σ poids = 1
```

**Fallback** quand `topMatches` est vide : prendre jusqu'à 3 events passés ayant des données, en mode *low-confidence* (`confidenceScore = 0`). Le choix DOIT être **déterministe** (tri stable par date décroissante puis id) — **pas `Math.random()`**. Voir §8-B.

`confidenceScore` (hors fallback) = moyenne des `scorePercentage` des topMatches.

---

## 4. Étage 3 — Total journalier par (shop × item)

Pour chaque clé `shopName-elementName-menuItemId` présente dans les events retenus :

```
qtySum = Σ_i ( quantité_i × scalingFactor_i × poids_i )      // i ∈ events où l'item existe
revSum = Σ_i ( revenue_i  × scalingFactor_i × poids_i )
weightCovered = Σ_i poids_i                                  // events qui ont VRAIMENT l'item

// renormalisation obligatoire : un item absent de certains events ne doit pas
// être sous-estimé. On ramène à la moyenne pondérée sur sa couverture réelle.
si 0 < weightCovered < 1 :
    qtySum /= weightCovered
    revSum /= weightCovered

predictedQty = round(qtySum)      // total journalier prédit pour ce shop×item
```

C'est le *« moyenne des ventes × poids »* du transcript (L137). Déjà correct dans `generatePredictionsForEvent`.

---

## 5. Étage 4 — Répartition par minute (point bloquant)

> Transcript L139–141 : *« la répartition par minute … en utilisant le profil menu des events passés »*.

### 5.1 Principe (définitif)

Le total journalier (Étage 3) doit être réparti **minute par minute** selon un **profil de forme moyen**, pas selon une somme brute des courbes passées. Sinon le plus gros event passé écrase la forme.

Pour chaque (shop × item) :

```
Pour chaque event passé retenu i ayant une timeline pour ce shop×item :
    total_i        = Σ_minute qty_i(minute)                 // total de l'event i
    si total_i == 0 : ignorer
    share_i(minute) = qty_i(minute) / total_i               // forme normalisée (Σ = 1)

// profil moyen pondéré par le poids de similarité de l'event
shareProfile(minute) = Σ_i ( poids_i × share_i(minute) ) / Σ_i poids_i

// re-projection sur le total journalier prédit de l'étage 3
predictedQty(minute) = predictedQtyJournalier × shareProfile(minute)
```

Propriétés garanties (bulletproof) :
- `Σ_minute predictedQty(minute) == predictedQtyJournalier` (à l'arrondi près) → cohérence Étage 3 ↔ Étage 4.
- Forme indépendante de l'amplitude des events passés (normalisation avant moyenne).
- Pondérée par la similarité (un event plus proche pèse plus sur la forme).

### 5.2 Bucketing

La granularité native est **1 minute** (`timelineBucketing.aggregateTimeline`, `bucketMinutes: 1`). Le bucketing 5/15/30/60 min se fait **à la consommation** (charts, KPI), jamais au calcul. Source unique : `timelineBucketing.js`.

### 5.3 Fenêtrage temporel

Une fenêtre `[start, end]` (ex. ouverture des PdV) s'applique **après** via `windowPredictedRecords` / `computeWindowRatios` (ratios par shop×item, pas de recalcul du scoring). Déjà correct.

---

## 6. Étage 5 — Stock & achat (par boutique, par fournisseur)

Transcript L11–27 (« combien acheter par boutique ») et L83–87 (« rattacher aux fournisseurs »).

### 6.1 Ajustement utilisateur

```
adjustedQty = round(predictedQty × adjustmentPercent / 100)     // défaut 100 %, plage 0–500 %
```

Source des états : `selectedMenuItems` (shopId → menuItemIds) et `quantityAdjustments`
(`"shopId-menuItemId"` → %). Voir `docs/logiqueEventPredict.md`.

### 6.2 Deux explosions distinctes (ne pas confondre)

| Fonction | But | S'arrête à |
|---|---|---|
| `stockPlanning.expandMenuItemStock` | **réarmement PdV** | articles livrés prêts (`readyForSale='Yes'`) → pcs ; sinon composants |
| `bomPlanning.buildIngredientRequirements` | **achat / production cuisine centrale** | descend **toujours** jusqu'aux ingrédients, peu importe `readyForSale` |

Conversion recette (les deux) :
```
qtéComposant = (numberOfUnits × qtéPlat) / numberOfPiecesRecipe
```
Combo (composant = autre menu item) → expansion récursive (profondeur max 8–10).

### 6.3 Rattachement fournisseur (transcript L83–87)

Chaîne réelle : `ingredient → marketPriceId → marketPrice.supplierId → supplier`.
`bomPlanning` agrège le besoin **par fournisseur** ; un même ingrédient chez plusieurs
fournisseurs → choisir « le plus correspondant » via `resolveSupplier` (prix de marché /
site du fournisseur). Sortie = groupes fournisseur → items → quantité + unité + boutiques.

---

## 7. Invariants « bulletproof » (à tester)

1. **Déterminisme** : mêmes entrées ⇒ mêmes sorties. Aucun `Math.random()`, aucun `Date.now()` dans le calcul (le « aujourd'hui » passe en paramètre). → §8-B.
2. **Conservation** : `Σ_minute predictedQty(min) == predictedQtyJournalier`. → §5.1.
3. **Une seule source de vérité par étage** : pas deux moteurs qui divergent (scoring vs timeline). → §8-A.
4. **Couverture partielle correcte** : un item vendu dans 2 events passés sur 10 n'est pas divisé par 10. → renorm `weightCovered` (Étage 3) ET profil minute (Étage 4). → §8-C.
5. **Pas de faux +score** : `visitingTeam` jamais sur `team` (domicile) ; `showTime` jamais de défaut `19:00` ; pas de bonus si une donnée manque. (déjà OK.)
6. **Seuils explicites** : filtres durs, fenêtre 3 h, fenêtre ±40 %, plancher influence 40 %. → §8-E.
7. **Bucketing 1 min au calcul**, agrégation à la consommation seulement.

---

## 8. Écarts code ↔ spec à corriger (`develop-fix-buganalyse`)

| # | Fichier | Problème | Correctif |
|---|---|---|---|
| **A** | `predictiveAnalyticsTimeline.js` | Le moteur timeline fait une **moyenne simple** (`totalRevenue / numPastEvents`), **sans poids ni scaling**. Diverge de `predictiveAnalytics.js` et viole « moyenne × poids » (L137). | Réutiliser `poids_i` et `scalingFactor_i` de `findAndScorePastEvents`. Le timeline ne sert plus qu'à la **forme** (§5), le **total** vient de l'étage 3. |
| **B** | `predictiveAnalytics.js:327` | Fallback low-confidence avec `Math.random()` → **non déterministe**, non reproductible. | Tri déterministe (date décroissante puis `id`) ; prendre les 3 premiers. |
| **C** | `predictiveAnalyticsTimeline.js:130-132` | Division systématique par `numPastEvents` même si l'item n'apparaît que dans certains events → **sous-estimation**. | Diviser par le nombre d'events **couvrant réellement** l'item (cf. `weightCovered` étage 3). |
| **D** | `predictiveAnalyticsTimeline.js` | Pas de **profil normalisé** : on somme les courbes brutes → la forme est dominée par le plus gros event. | Implémenter §5.1 (normaliser chaque event à Σ=1, moyenner pondéré, re-projeter sur le total). |
| **E** | `predictiveAnalytics.js` (étage 2) | **Plancher d'influence 40 % non appliqué** (`scorePercentage` calculé mais pas filtré). | Ajouter `scored.filter(s => s.scorePercentage >= 40)` avant `slice(0,10)`. ⚠️ Décision produit : confirmer 40 % global vs uniquement ±40 % affluence (voir §9). |
| **F** | architecture | **Deux moteurs** (`generatePredictionsForAllFutureEvents` vs `generateTimeline...`) produisent des prédictions concurrentes. | Pipeline unique : étage 3 (total) → étage 4 (forme minute). Le timeline n'override jamais le total. |

---

## 9. Décision à confirmer (1 seul point ambigu)

Transcript L133 « **influence < 40 %** » : deux lectures possibles —
- (a) = la fenêtre d'affluence ±40 % (déjà codée), ou
- (b) = un **plancher de pertinence globale** `scorePercentage ≥ 40 %` (nouveau, §2.4 / §8-E).

Recommandation **bulletproof : appliquer les deux** (a déjà là, b à ajouter). Si le client
ne veut que (a), supprimer §8-E. À trancher avec Bertrand.

---

## 10. Ordre d'implémentation recommandé

1. **§8-B** (déterminisme) — trivial, sans risque.
2. **§8-E** (plancher 40 %) — 1 ligne, après confirmation §9.
3. **§8-A + §8-C + §8-D + §8-F** (refonte moteur timeline) — le gros morceau, à couvrir par tests :
   conservation (Σ minute = total), couverture partielle, profil normalisé.
4. Tests unitaires : étendre `tests/unit/predictiveTimelinePreprocess.spec.js` avec les invariants §7.
</content>
</invoke>
