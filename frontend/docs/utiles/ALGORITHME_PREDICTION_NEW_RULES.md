# Algorithme de prédiction — « NEW RULES »

> Barème **unique faisant foi**. Les deux barèmes antérieurs du document de
> travail sont **abandonnés**.
>
> Implémentation :
> - Scoring / sélection / prédiction agrégée → [`src/utils/predictiveAnalytics.js`](../src/utils/predictiveAnalytics.js)
> - Pondération + scaling + courbe minute → [`src/composables/usePredictiveTimeline.js`](../src/composables/usePredictiveTimeline.js)
> - Réarmement (BOM → appro) → modules restock (`stockPlanning`, `bomPlanning`)

---

## 1. Périmètre & principe

Prédiction par **similarité pondérée** : on prédit les ventes d'un event futur
à partir d'events passés comparables. Calcul **par item × par boutique**, puis
agrégé → revenu total par event (re-découpable par item ou par boutique), puis
explosé en approvisionnement (BOM → fournisseurs) et en **courbe minute**.

---

## 2. Pipeline (7 étapes)

| # | Étape | Sortie | Code |
|---|---|---|---|
| 1 | Gates (élimination dure) | events comparables retenus | `calculateSimilarity` (retourne `null`) |
| 2 | Scoring (similarité) | un score par event retenu | `calculateSimilarity` |
| 3 | Scaling par affluence | ventes mises à l'échelle | `scalingFactor` / `attendeeRatio` |
| 4 | Poids relatifs | poids = score / Σ scores | `generatePredictionsForEvent` / timeline |
| 5 | Prédiction | unités + revenu par (boutique × item) + agrégats | `generatePredictionsForEvent` |
| 6 | BOM → appro | quantités par composant / fournisseur / coût | modules restock |
| 7 | Répartition par minute | courbe alignée sur le coup d'envoi | `usePredictiveTimeline` |

---

## 3. Barème canonique

| Critère | Poids max | Logique |
|---|---|---|
| Event Type | 100 | **GATE** — exact, sinon écarté |
| Configuration | 100 | **GATE** — exact, sinon écarté |
| Category | 100 | **GATE** — exact, sinon écarté |
| Subcategory | 800 | 800 si exact, 0 sinon (pas un gate) |
| Visiting Team (SPORT) | 800 | 800 si exact, 0 sinon |
| Sponsor (MICE) | 400 | 400 si exact, 0 sinon |
| Performer (CONCERT) | 800 | 800 si exact, 0 sinon |
| Attendance | 200 | proportionnel : `200 × (1 − écart)` ; **GATE** si écart > 40% |
| Day of week (Dim→Jeu) | 500 | 500 même jour / 250 autre jour de semaine / 0 si week-end |
| Weekend day (Ven/Sam) | 500 | 500 même jour / 250 autre jour de week-end / 0 si semaine |
| Show time | 400 | 400 exact / 300 ≤1h / 100 ≤2h / 0 ≤3h ; **GATE** si > 3h |

Score max par type d'event (somme des critères applicables) :

```
SPORT   : 100+100+100+800+800+200+500+400 = 3000
CONCERT : 100+100+100+800+800+200+500+400 = 3000
MICE    : 100+100+100+800+400+200+500+400 = 2600
```

La dimension jour vaut 500 quel que soit le jour (semaine ou week-end — voir §8).

---

## 4. Étape 1 — Gates

Un event passé est **écarté** (jamais utilisé) si au moins un échoue :

```
eventType      ≠ exact
configuration  ≠ exact
category       ≠ exact
écart d'affluence  |passée − future| / future > 40%
écart d'horaire    > 3h (180 min, circulaire pour gérer minuit)
```

- Comparaisons de chaînes **normalisées** (`trim` + minuscule + sans accent —
  `eqNorm`) pour ne pas écarter à tort « Top 14 » vs « top 14 ».
- `subcategory`, `visitingTeam` / `sponsor` / `performer` **ne sont pas des
  gates** : pas de match → 0 point, mais l'event reste dans le pool.
- **Règle de tolérance (importante en prod)** : un critère-gate **non renseigné
  d'un côté** (event passé sans type/config/catégorie) **n'écarte pas** l'event
  — le gate est simplement ignoré. Sans cette tolérance, des events passés
  partiellement classifiés seraient tous éliminés et la prédiction serait vide
  (cf. exemple §14 sur ce space).

---

## 5. Étape 2 — Scoring

Pour chaque event retenu :

- Type / Config / Category = leur max (garantis exacts par les gates *quand
  renseignés des deux côtés*).
- Subcategory = 800 ou 0.
- Affinité (selon type) = Visiting Team **ou** Sponsor **ou** Performer.
- Attendance = `round(200 × (1 − écart))`. Pour un survivant l'écart ≤ 40%, donc
  ce critère est dans `[120 ; 200]` (jamais 0) — *quand les deux affluences sont
  connues*.
- Jour = 500 / 250 / 0 (§8).
- Show time = 400 / 300 / 100 / 0 (§9).

`score_event = somme des critères`.

---

## 6. Étape 3 — Scaling par affluence

```
scale          = affluence_future / affluence_passée
unités_scalées = unités_passées   × scale     (par item × boutique)
revenu_scalé   = revenu_passé     × scale
```

- Engine : `scale = ticketsSold_future / ticketsSold_passé`.
- Timeline : `scale = ticketsSold_future / (ticketsScanned_passé || ticketsSold_passé)`
  — pour un event passé, `scanned` est la fréquentation réelle.
- Affluence passée ≤ 0 → ratio **neutre = 1** (jamais de division par zéro :
  une affluence connue ≤ 0 serait déjà écartée au gate 4 ; une affluence
  *inconnue* donne un ratio neutre plutôt qu'une inflation).

---

## 7. Étapes 4 & 5 — Poids & prédiction

```
totalScore  = Σ score_event
poids_event = score_event / totalScore            (plus de split 70/30)

unités_prédites(boutique,item) = Σ_event ( unités_scalées × poids_event )
revenu_prédit(boutique,item)   = Σ_event ( revenu_scalé   × poids_event )
```

- **Formule pure** : pas de renormalisation par couverture. Un item présent
  dans une fraction des events passés pèse à proportion de cette présence.
- Agrégats : revenu total event = Σ sur (boutiques × items) ; par item = Σ sur
  boutiques ; par boutique = Σ sur items.
- Garde-fou division par zéro : `totalScore = 0` (données trop pauvres) →
  **aucune prédiction fabriquée**.

---

## 8. Règle jour de semaine / week-end (mutuellement exclusives)

La dimension utilisée dépend du jour du **futur** event :

- **Futur en semaine (Dim→Jeu)** : on note les passés sur « Day of week ».
  Un passé tombant un week-end → 0.
- **Futur le week-end (Ven/Sam)** : on note sur « Weekend day ».
  Un passé en semaine → 0.

Les deux lignes ne s'additionnent jamais. Convention JS `getDay()` :
`0=Dim … 5=Ven, 6=Sam` ; week-end = `{5, 6}`.

---

## 9. Show time — paliers

| Écart | Score |
|---|---|
| 0 | 400 |
| ≤ 1h | 300 |
| > 1h et ≤ 2h | 100 |
| > 2h et ≤ 3h | 0 |
| > 3h | event écarté (gate) |

Écart **circulaire** (modulo 1440) : un event à 23:30 et un à 00:15 sont à
45 min, pas 1395.

⚠️ Comportement assumé (issu du barème, pas un bug) : un event entre 2h et 3h
d'écart survit au gate mais marque 0 sur l'horaire. Palier net : à 2h01 on
tombe de 100 à 0.

---

## 10. Étape 6 — BOM → approvisionnement

```
besoin_brut(boutique, composant) = Σ_items ( unités_prédites_item × qté_par_unité )
commande = ceil(besoin_brut / taille_lot) × taille_lot    // arrondi au lot supérieur
coût     = commande × prix_unitaire
```

- Deux explosions distinctes : `stockPlanning` (s'arrête aux items
  « ready-for-sale », unité = pcs) vs `bomPlanning` (descend aux ingrédients
  bruts pour l'achat).
- Données manquantes : item sans recette ou composant sans fournisseur → la
  ligne est produite **avec un drapeau** `missing: 'recipe' | 'supplier'`, sans
  casser le reste.

---

## 11. Étape 7 — Répartition par minute

**Alignement temporel (essentiel)** : chaque chronologie passée est **décalée**
pour caler son coup d'envoi sur celui du futur event
(`timeOffset = horaire_cible − horaire_passé`, appliqué minute par minute :
`minute_affichée = bucket(minute_passée + timeOffset)`). C'est ce qui fait
coïncider les pics clés (mi-temps, affluence) entre un match de 18:30 et un de
20:00 — sans ça les schémas de vente seraient désalignés et la prédiction
déformée.

Construction de la courbe prédite : on additionne, minute par minute (après
alignement), les profils des events retenus pondérés `× scale × poids`. La somme
des minutes égale le total prédit §7 **par construction** (la prédiction est
bâtie à partir de ces mêmes records minute → pas de dérive, pas de
renormalisation nécessaire).

- **Pas de fenêtre destructive** : tous les points alignés sont conservés. (Une
  ancienne « fenêtre `[−120;+200]` » qui *jetait* les points éloignés a été
  retirée : elle cassait la courbe quand un event passé n'a pas d'horaire — son
  alignement retombe à 0, ses ventes d'après-midi sortaient de la fenêtre et
  étaient écartées. Une fenêtre éventuelle doit être appliquée au **niveau
  affichage** (plage par défaut du slider), pas comme filtre de données.)
- **Pré-requis qualité** : l'alignement n'opère que si les events passés ont un
  `showTime`. Sans horaire → décalage 0 → courbes non alignées (data à
  classifier).
- **`usedFallback = true`** : events comparables retenus mais le fetch
  `getSpaceEventTimeline` n'a ramené aucune ligne minute → courbe vide (rien
  n'est fabriqué). C'est un signal de données manquantes côté fetch, pas de
  l'algo.

---

## 12. Cas limites & garde-fous

| Risque | Traitement |
|---|---|
| Aucun event comparable | `insufficientData = true`, aucune prédiction fabriquée |
| Division par zéro (poids) | `totalScore = 0` → rien fabriqué |
| Division par zéro (scale) | affluence ≤ 0 → ratio neutre 1 / écartée au gate |
| Casse / accents / espaces | comparaison normalisée (`eqNorm`) |
| Horaire à cheval sur minuit | écart circulaire (modulo 1440) |
| Profil minute incomplet | somme directe — Σ minutes = total par construction |
| Aucune ligne minute (fetch vide) | `usedFallback = true` + courbe vide (rien fabriqué) |
| Recette / fournisseur manquant | ligne produite + drapeau `missing` |
| Repli non déterministe | **supprimé** (plus de `Math.random`) |

---

## 13. Propriétés connues (à valider, pas des bugs)

- **Double influence de l'affluence** : agit à la fois sur le `scale` (volume)
  et sur le `score` (poids). Méthode validée ; à garder en tête si on veut un
  jour découpler volume et similarité.
- Palier show time 2h–3h = 0 (§9).
- Exclusivité jour/week-end (§8).

---

## 14. Exemple chiffré réel — space « Auxerre », event « Match de Football à predire »

URL :
`/spaces/cmovsjbiz01lzvwyn30wweqpf?toolbox=event-predict&event=70d4d594-6545-4ce8-ad55-28b48b9e4767&configuration=config-1779052003978`

### Event cible
| Champ | Valeur |
|---|---|
| Nom | Match de Football à predire |
| Date | **2026-07-11** → **Samedi** (week-end) |
| Type / Catégorie / Sous-catégorie | Sport / Football / Ligue 1 |
| Configuration | `config-1779052003978` |
| Tickets vendus | 80 000 |
| Show time | 19:00 |

### Events passés du space (10) + revenu réel
| Event | Date | Jour | Revenu réel |
|---|---|---|---|
| AJA 13 Sept 2025 | 2025-09-13 | **Sam** | 53 089 € |
| AJA 17 Aout 2025 | 2025-08-17 | Dim | 37 518 € |
| AJA 21 Sept | 2025-09-21 | Dim | 30 304 € |
| AJA 9 Aout 2025 | 2025-08-09 | **Sam** | 18 801 € |
| AJ Auxerre vs Levante | 2025-08-02 | **Sam** | 18 041 € |
| AJ Auxerre vs Ipswitch | 2025-07-18 | **Ven** | 4 395 € |
| AJA 7 Sept 2025 | 2025-09-07 | Dim | 1 887 € |
| adhoc 20 Sept | 2025-09-20 | Sam | 6 € |
| adhoc 15 Juil | 2025-07-15 | Mar | 0 € |
| adhoc 12 Sept | 2025-09-12 | Ven | −4 € |

### Étape 1 — Gates
Les events passés sont des **brouillons non classifiés** : pas de
type/configuration/catégorie/tickets/horaire. Par la règle de tolérance (§4),
les gates correspondants sont **ignorés** (ni points, ni exclusion) → les 10
events **passent**. Aucune exclusion par affluence (inconnue) ni horaire
(inconnu).

### Étape 2 — Scoring
Seule la **date** est renseignée des deux côtés → **seul le critère jour**
marque. Cible = Samedi (week-end) → barème « Weekend day » : 500 si Samedi,
250 si Vendredi, 0 sinon.

| Event | Jour | Score |
|---|---|---|
| AJA 13 Sept | Sam | **500** |
| AJA 9 Aout | Sam | **500** |
| vs Levante | Sam | **500** |
| adhoc 20 Sept | Sam | **500** |
| vs Ipswitch | Ven | **250** |
| adhoc 12 Sept | Ven | **250** |
| AJA 17 Aout / 21 Sept / 7 Sept | Dim | 0 |
| adhoc 15 Juil | Mar | 0 |

`Σ score = 500×4 + 250×2 = 2500`.

### Étapes 3–5 — Scaling, poids, prédiction
- **Scale = 1** pour tous (affluence passée inconnue → ratio neutre).
- Poids = score / 2500 :

| Event | Poids | Revenu | Contribution (poids × 1 × revenu) |
|---|---|---|---|
| AJA 13 Sept | 20% | 53 089 € | 10 618 € |
| AJA 9 Aout | 20% | 18 801 € | 3 760 € |
| vs Levante | 20% | 18 041 € | 3 608 € |
| adhoc 20 Sept | 20% | 6 € | 1 € |
| vs Ipswitch | 10% | 4 395 € | 440 € |
| adhoc 12 Sept | 10% | −4 € | 0 € |
| Dimanches / Mardi | 0% | — | 0 € |
| **Total prédit** | | | **≈ 18 427 €** |

> **≈ 18 427 €** est le revenu total prédit « New Rules » (niveau event).
> Très proche du **18 126 €** affiché sous l'ancien algo. L'écart vient de :
> (1) l'ancien barème appliquait un **split 70/30** + une **renormalisation**
> que New Rules supprime ; (2) le calcul réel est **par item × boutique** (un
> item absent de certains events pèse moins, formule pure §7).

### Diagnostic données (§12 « debug données »)
La prédiction ici repose **uniquement sur le jour de la semaine** : les 6
matchs du samedi/vendredi portent 100% du poids, les 3 dimanches (dont le
plus gros, 37 518 €) sont **ignorés** (score 0). Pour exploiter tout le barème
(3000 pts SPORT) et fiabiliser la prévision, **classifier les events passés** :
`eventType = Sport`, `category = Football`, `subcategory`, `configuration`,
`ticketsSold/Scanned`, `showTime`. Une fois renseignés, gates + affluence +
horaire + sous-catégorie entrent en jeu et le scaling d'affluence s'active.

---

## 15. Ce qui a changé vs l'ancien algo

| Aspect | Avant | New Rules |
|---|---|---|
| Pondération | split 70/30 (groupes score>0 / score=0) | **poids purs** `score / Σ` |
| Item rare | renormalisation par couverture | **formule pure** §7 (pas de renorm) |
| Aucun event comparable | repli **aléatoire** sur 3 events | **insufficientData**, rien fabriqué |
| Comparaison libellés | `===` strict | **normalisée** (trim/minuscule/accents) |
| Écart horaire | linéaire | **circulaire** (gère minuit) |
| Courbe minute | somme brute (alignée) | **alignée** sur le coup d'envoi, somme directe (Σ minutes = total) ; pas de fenêtre destructive |
| Déterminisme | `Math.random` | **déterministe** |
