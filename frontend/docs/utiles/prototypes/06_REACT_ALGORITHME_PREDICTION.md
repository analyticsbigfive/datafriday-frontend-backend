# Audit de fidélité — `predictiveAnalytics.ts` (React) vs `ALGORITHME_PREDICTION_NEW_RULES.md`

> Comparaison la plus importante de toute l'investigation prototype. Confronte le code source RÉEL
> de l'algorithme de prédiction React à la doc qui prétend le décrire et fait référence en prod.
>
> **Méthode** : lecture intégrale de `predictiveAnalytics.ts` (586 l.),
> `predictiveAnalyticsTimeline.ts` (251 l.), `usePredictiveTimeline.ts` (692 l.),
> `EventPredictStockUpSection.tsx` (467 l.), `LowConfidenceEventsDialog.tsx` (276 l.), lecture
> ciblée de `EventPredictView.tsx`/`EventPredictMenusSection.tsx` par grep + plages, grep de
> `utils/api.ts` (aucune logique de scoring dedans). Comparaison ligne à ligne avec NEW_RULES (la
> doc qui fait foi), DEFINITIF, EVENT_PREDICT_SECTIONS, logiqueEventPredict, PEPITES §1.

**Constat global en une phrase** : le code React (`predictiveAnalytics.ts` + `usePredictiveTimeline.ts`)
est bien **l'ancien algo pré-correction** décrit par DEFINITIF §8, pas le moteur "New Rules" — la
note mémoire ("déjà porté 1:1, règles user-mandatées appliquées") ne se vérifie **pas** sur ce
fichier : plusieurs comportements que NEW_RULES présente comme acquis (poids purs, déterminisme,
comparaison normalisée, écart circulaire, gate configuration) sont absents ou contredits par le
code React réel.

---

## 1. Correspondances confirmées

| Règle NEW_RULES | Code React | Verdict |
|---|---|---|
| Poids `eventType:100`, `category:100`, `subcategory:800`, `visitingTeam:800`, `sponsor:400`, `performer:800`, `attendance:200`, `dayOfWeek:500`, `showTime:400` | `predictiveAnalytics.ts:126-136` (objet `WEIGHTS`) | **Exact**, valeur par valeur |
| Gate eventType / category, tolérant si absent d'un côté | `predictiveAnalytics.ts:152-166` (`return null` seulement si les deux côtés renseignés et différents) | **Exact** |
| Attendance : `score = round(200×(1−écart))`, écart=`\|target−past\|/target` | `predictiveAnalytics.ts:294-295` | **Exact** (formule identique) |
| `scalingFactor = target/past`, neutre=1 si l'un des deux ≤0 | `predictiveAnalytics.ts:305,309` | **Exact** |
| Jour semaine/week-end : Ven/Sam=weekend, `getDay()` 0=Dim…5=Ven,6=Sam, exclusivité des deux barèmes | `predictiveAnalytics.ts:113-115, 203-243` | **Exact** |
| Show time : 400 exact / 300 ≤1h / 100 ≤2h / 0 ≤3h / >3h exclu | `predictiveAnalytics.ts:259-270` | **Exact** sur les paliers |
| Poids purs `score/totalScore`, garde-fou `totalScore===0 → []` | `predictiveAnalytics.ts:432,434,438` | **Exact** — *mais* seulement dans `generatePredictionsForEvent` (moteur "engine"), pas dans le hook timeline (voir §2) |
| Alignement temporel timeline `timeOffset = cible − passé`, wrap circulaire mod 1440 à l'affichage | `usePredictiveTimeline.ts:443-453` (offset), `433-441` (`formatTime` wrap `% (24*60)`) | **Exact** — la circularité existe bien ici, contrairement au gate de scoring (voir §2) |
| Pas de fenêtre destructive sur la courbe minute | `usePredictiveTimeline.ts:545-587` (agrégation directe, aucun filtre de plage) | **Cohérent** avec l'absence de bug décrite |
| Expansion `readyForSale` Yes→pcs / No→composants, `componentQty = numberOfUnits×qté / numberOfPiecesRecipe`, MAX_DEPTH | `EventPredictStockUpSection.tsx:170,177-231` (`MAX_DEPTH=10`) | **Exact**, formule identique caractère pour caractère |
| Disponibilité space-level : composant→ingrédient→supplier→`sites`, "tous les fournisseurs doivent servir l'espace" | `EventPredictMenusSection.tsx:470-532` | **Exact** |
| Règles F&B strictes (gppremium/temporary=tout ; Beer⊂beer∨beverages∨drinkee ; Food⊂food ; Beverage⊂beverages∨drinkee ; Combo⊃food∧beverages) | `EventPredictMenusSection.tsx:619-649` | **Exact**, y compris l'ordre des règles |
| Tri Shop View : sélectionnés d'abord (catégorie puis nom), non sélectionnés par predictedQty décroissante | `EventPredictMenusSection.tsx:658-688` | **Exact** |
| Index shopKey\|menuItemId avec fallback `name/registryId/id` | `EventPredictStockUpSection.tsx:107-148` | **Exact** |
| Max 10 événements sélectionnables manuellement (`LowConfidenceEventsDialog`), 50 derniers affichés | `LowConfidenceEventsDialog.tsx:48-67, 78-81` | **Exact**, cohérent avec `candidateEvents.slice(0,50)` du hook |

---

## 2. Divergences (code React réel ≠ NEW_RULES)

### A. Gate « Configuration » (100 pts) — absent du code, changerait le résultat
`predictiveAnalytics.ts` n'a **aucun** champ `configuration`/`configurationId` dans l'interface
`Event` ni dans `calculateSimilarity` (`predictiveAnalytics.ts:5-32, 121-331`). Ni gate, ni score.
Confirmé par grep : `configurationId` n'apparaît que dans `EventPredictView.tsx` pour aller
chercher la config du menu (fetch API), jamais transmis à
`findAndScorePastEvents`/`calculateSimilarity`, et la liste `events` passée au hook n'est jamais
filtrée par configuration (`EventPredictView.tsx:162-168`). Conséquence directe : le total
« SPORT=3000 / CONCERT=3000 » du barème NEW_RULES est faux pour ce code — le vrai max calculé
(`predictiveAnalytics.ts:318-321`) est **2900** (pas de +100 configuration). PEPITES §1.1 (source
`PORTING_PROGRESS.md`) confirme d'ailleurs la même table à 9 critères, sans configuration — donc
cette gate a été ajoutée par NEW_RULES sans exister nulle part dans le code React.

### B. Split 70/30 encore présent — non déterminisme du poids, sévérité majeure
NEW_RULES §7/§15 affirme "plus de split 70/30" / "poids purs". Or `usePredictiveTimeline.ts:386-418`
implémente **explicitement** ce split (commentaire `"Applying 70/30 split"`), avec Group A
(score>0, pondéré pro-rata × 0.7) / Group B (score=0, réparti égal × 0.3). C'est ce poids
(`eventWeightsMap`), pas un poids pur, qui alimente `combinedFactor = weight × attendeeRatio`
(ligne 511) utilisé pour construire la courbe minute affichée à l'utilisateur. Le même pattern
existe dans `AnalyseView.tsx:2903-2931, 6388-6416` (commentaire identique "same as AnalyseView").
Seul `generatePredictionsForEvent` (le moteur "engine" pur, `predictiveAnalytics.ts:432-438`)
utilise le poids pur — donc **deux moteurs, deux formules de poids différentes**, exactement le
problème "deux moteurs concurrents" que DEFINITIF §8-F décrivait comme un bug à corriger.
NEW_RULES prétend ce bug réglé partout ; il ne l'est que dans un des deux moteurs.

### C. `Math.random()` toujours présent — non déterminisme, contredit NEW_RULES
NEW_RULES §12/§15 : "Repli non déterministe : supprimé (plus de Math.random)". Faux pour ce code :
- `predictiveAnalytics.ts:395` : `[...validPastEvents].sort(() => Math.random() - 0.5)`
- `usePredictiveTimeline.ts:362` : même pattern
- `AnalyseView.tsx:6019` (et `2970` : `setTimeout(r, Math.random()*500)`, hors-scope algo)

Le fallback "3 events aléatoires low-confidence" est toujours non déterministe dans le code React.

### D. Comparaison de chaînes stricte `===`, pas de normalisation `eqNorm` — sévérité moyenne à majeure selon les données
NEW_RULES §4/§15 : "comparaisons normalisées (trim + minuscule + sans accent — eqNorm)". Aucune
fonction `eqNorm` n'existe dans tout le repo React (grep global infructueux). Toutes les
comparaisons (`eventType`, `category`, `subcategory`, `performerName`, team, `sponsorName`)
utilisent `===` strict (`predictiveAnalytics.ts:153,161,171,178,189,197`). L'exemple cité par
NEW_RULES lui-même ("Top 14" vs "top 14" à tort écarté) **reproduit un bug réel du code**, pas une
protection déjà en place.

### E. Fenêtre d'affluence asymétrique `[0.5×, 2.0×]`, pas symétrique `±40%` — sévérité majeure, change les events retenus
NEW_RULES/DEFINITIF/PEPITES affirment tous une exclusion à `écart > 40%` (équivalent
`[0.6×,1.4×]`). Le code (`predictiveAnalytics.ts:278-287`) exclut seulement si
`pTickets < 0.5×tTickets || pTickets > 2.0×tTickets` — soit -50%/+100%, **asymétrique**.
Conséquence concrète : un event passé à +50% de fréquentation (écart 50% > 40%) serait exclu selon
la doc mais **survit** dans le code réel (ratio=1.5 < 2.0). Corollaire : NEW_RULES §5 affirme
"pour un survivant, l'écart ≤ 40%, donc ce critère est dans [120;200] (jamais 0)" — faux dans le
code : un survivant peut avoir écart jusqu'à 100% (à ratio=2.0), donc score **jusqu'à 0**, pas
planché à 120.

### F. `visitingTeam` retombe sur `team` (domicile) — contredit un invariant explicitement affirmé "déjà OK"
DEFINITIF §7 invariant 5 : "visitingTeam jamais sur team (domicile)... déjà OK". Le code fait
exactement l'inverse : `predictiveAnalytics.ts:186,188` — `const targetTeam = target.visitingTeamId
|| target.visitingTeam || target.team;` (et idem côté passé). PEPITES §1.1 affirme aussi "l'équipe
à domicile n'est volontairement pas scorée : seule visitingTeam compte" — **faux au vu du code**,
le fallback sur `team` est écrit noir sur blanc avec le commentaire `// sometimes stored in
'team'`. Un match fortuit sur le champ domicile peut donc accorder à tort 800 points.

### G. `showTime` : défaut `'19:00'` codé en dur — contredit un invariant affirmé "déjà OK"
`predictiveAnalytics.ts:247-248` : `const targetTime = target.sessions?.[0]?.showTime || '19:00';
const pastTime = past.sessions?.[0]?.showTime || '19:00';`. `usePredictiveTimeline.ts:123-127` fait
de même et expose même un flag UI (`predictiveIsDefaultShowTime`) — preuve que ce défaut est un
choix assumé, pas un oubli. DEFINITIF §7 invariant 5 affirme pourtant "showTime jamais de défaut
19:00 (déjà OK)". Si les deux events (cible et passé) manquent d'horaire, ils obtiennent un faux
score plein de 400/400 sans que rien ne le signale.

### H. Écart d'horaire NON circulaire dans le gate de scoring — contredit NEW_RULES §4/§9/§12/§15
`predictiveAnalytics.ts:253` : `const diffMinutes = Math.abs(tMinutes - pMinutes);` — aucun modulo
1440. Un event à 23:30 et un à 00:15 donnent `diffMinutes=1395` → exclu par le gate 3h, alors que
NEW_RULES affirme un écart circulaire de 45 min. **Important** : la circularité existe bel et bien
ailleurs dans le code (alignement de la courbe minute, `usePredictiveTimeline.ts:433-441`), donc
NEW_RULES a raison sur le module timeline mais tort sur le gate de scoring — nuance à ne pas perdre.

### I. Timeline : champ d'affluence future = `ticketsScanned`, pas `ticketsSold` — sévérité potentiellement critique
NEW_RULES §6 : "Timeline : scale = ticketsSold_future / (ticketsScanned_passé || ticketsSold_passé)".
Le code réel (`usePredictiveTimeline.ts:456-461,498`) utilise
`predictedAttendees = event.ticketsScanned || 0` (pas `ticketsSold`) pour l'event **futur**, et
`pastEventAttendees = e.ticketsScanned || 0` pour le passé, **sans fallback vers ticketsSold**. Or
`ticketsScanned` (scan physique aux portes) est structurellement nul/absent pour un event futur non
encore joué. Si les données suivent cette sémantique, `attendeeRatio` vaudrait 0 pour toute
prédiction passant par ce hook, annulant `combinedFactor` et donc toute la courbe minute prédite.
Cela mérite vérification empirique (peut-être `ticketsScanned` est renseigné de façon impropre dans
les données de test), mais tel que lu, c'est une divergence de champ, pas de formule.

### J. Renormalisation par couverture (`weightCovered`) — absente du code, mais conforme à NEW_RULES, pas à DEFINITIF
Aucune division par `weightCovered` n'existe dans `generatePredictionsForEvent`
(`predictiveAnalytics.ts:469-506`) — chaque item non vendu dans un event contribue 0, sans renorm.
Ceci **correspond** à NEW_RULES §7 ("formule pure, pas de renormalisation") mais **contredit**
DEFINITIF §4 qui prétendait cette renorm "déjà correcte". Signalé pour mémoire, ce n'est pas un
écart avec la doc de référence actuelle (NEW_RULES), juste un point où DEFINITIF (obsolète) se
trompait déjà sur l'état du code.

---

## 3. Pépites nouvelles (non documentées dans NEW_RULES/DEFINITIF/EVENT_PREDICT_SECTIONS/logiqueEventPredict)

- **Sélection manuelle persistée d'events passés** (`usePredictiveTimeline.ts:264-314`) : un
  endpoint `predictive-event-selection/:eventId` permet de sauvegarder/relire une liste d'IDs
  d'events choisis à la main par l'utilisateur, qui **prime** sur le top-10 automatique. Absent de
  toute doc lue.
- **Événements "exclus" ré-injectés avec un score fictif de 30%** (`usePredictiveTimeline.ts:176-262`) :
  les events de même sous-catégorie/catégorie qui n'ont pas fait le top-50 sont recalculés avec
  `score = 30% du maxPossibleScore du meilleur candidat`, motif `"Manual 30%"`, uniquement pour
  affichage/sélection manuelle — mécanisme UI non trivial, aucune trace dans les docs.
- **Deux tailles de pool distinctes** : 50 candidats affichés en UI
  (`candidateEvents.slice(0,50)`, `usePredictiveTimeline.ts:172-174`) vs 10 réellement utilisés
  pour le calcul (`.slice(0,10)`, ligne 313) — la doc ne distingue jamais ces deux nombres.
- **`confidenceScore`** = moyenne des `scorePercentage` des topMatches (0 si low-confidence) —
  calculé et exposé (`predictiveAnalytics.ts:441-443`, `predictiveAnalyticsTimeline.ts:154-156`)
  mais jamais mentionné dans NEW_RULES.
- **`maxPossibleScore` dynamique par target**, pas une constante fixe par type d'event : ne compte
  `visitingTeam`/`sponsor`/`performer` que si le **target** (pas le passé) a la donnée
  (`predictiveAnalytics.ts:318-321`). Les tables "SPORT=3000" de NEW_RULES sont donc des cas
  particuliers, pas une constante de calcul.
- **`generateTimelineBasedPredictions` (predictiveAnalyticsTimeline.ts) est du code mort** : grep
  confirme qu'aucun composant ne l'importe (seulement référencé en interne à son propre fichier).
  C'est pourtant ce fichier que fait exactement le bug "moyenne simple sans poids" décrit par
  DEFINITIF §8-A — mais il n'est jamais exécuté dans l'app, contrairement à ce que DEFINITIF §1
  laisse penser ("Étage 4 : predictiveAnalyticsTimeline.js, à corriger"). Le vrai moteur live pour
  la courbe minute est `usePredictiveTimeline.ts`, qui a son propre lot de bugs distincts (70/30,
  Math.random, ticketsScanned).
- **`LowConfidenceEventsDialog`** expose une bannière explicite informant l'utilisateur que la
  prédiction est basée sur des events aléatoires et lui permet de les remplacer manuellement
  (limite 10) — logique métier UI riche, absente des docs de scoring.
- **`isMenuItemAvailableInSpace`** a un shortcut prioritaire : si `menuItem.spaceIds` existe
  (source de données externes), il l'utilise directement sans passer par la chaîne
  ingrédient→fournisseur→sites (`EventPredictMenusSection.tsx:471-474`) — non documenté dans
  EVENT_PREDICT_SECTIONS §5.3.

## 4. Mort / hors-sujet (React-only, sans valeur de portage)

- `predictiveAnalyticsTimeline.ts` en entier (`generateTimelineBasedPredictions`,
  `generateTimelinePredictionsForAllFutureEvents`) : code mort, non importé par aucun composant
  vivant de l'app React. À ne pas prendre comme référence de portage — il documente un bug (moyenne
  simple) qui n'est même pas celui réellement exécuté.
- Tout le layer fetch Supabase Edge Functions dans `usePredictiveTimeline.ts`
  (`supabase.co/functions/v1/make-server-eb31619c/...`, lignes 270-287, 472-489, 618-629) :
  infrastructure Figma-Make/Supabase spécifique au prototype, sans équivalent Vue à porter tel
  quel (juste la sémantique fonctionnelle, déjà couverte par API backend actuelle).
- UI Shadcn/Radix (`Dialog`, `Card`, `Collapsible`, `ScrollArea`, `lucide-react` icons) dans
  `LowConfidenceEventsDialog.tsx` et `EventPredictStockUpSection.tsx` : détails de présentation
  React, déjà correctement mappés dans EVENT_PREDICT_SECTIONS §7 (table de correspondance
  composants).
- `console.log` de debug abondants dans les trois fichiers logique — bruit, aucune valeur métier.

---

**Recommandation** : ce fichier React ne peut pas servir de "preuve que la doc est fidèle au code"
— c'est l'inverse : NEW_RULES décrit un état **cible/corrigé** qui, sur plusieurs points
structurants (poids purs vs 70/30, déterminisme, gate configuration, fenêtre d'affluence,
normalisation de chaînes, fallback team/showTime), **ne correspond pas** au code React réellement
archivé. Si le portage Vue (`src/utils/predictiveAnalytics.js`, `src/composables/usePredictiveTimeline.js`,
cités par NEW_RULES) a effectivement implémenté les règles NEW_RULES, alors le portage n'a **pas
été 1:1** depuis ce React — il a corrigé des bugs au passage, ce qui contredit la note mémoire
"déjà porté 1:1". Vérifier ces mêmes points dans les fichiers Vue réels serait la suite logique
pour savoir si NEW_RULES décrit fidèlement *au moins* le code actuellement en prod.
