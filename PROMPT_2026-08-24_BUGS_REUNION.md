# Prompt Claude Code — Bugs remontés en réunion du 2026-08-24

> Source : réunion Google Meet du 24/08/2026 (Bertrand Jame, Ulrich Kouamé, Jean-Luc Houedanou).
> Enregistrement : https://fathom.video/share/EF1BA9GJk64on2SWkv7_YMochVtuGaEk
> Les horodatages `[mm:ss]` ci-dessous renvoient à cet enregistrement.

## Ce que je te demande

Tu instruis les points ci-dessous **en fiches de bug**, pas en code.

Règles dures :

1. **Aucune modification de code, aucun commit, aucun build.** Tu produis / mets à jour des fiches
   Markdown dans `frontend/docs/bugs/` et `backend/docs/bugs/`, rien d'autre.
2. **Plan d'abord.** Tu me présentes le plan (liste des fiches à créer / mettre à jour, et pour
   chacune l'hypothèse de cause racine que tu comptes vérifier) avant de rédiger quoi que ce soit.
3. **Chaque fiche doit être ancrée dans le code réel**, avec des références `fichier:ligne`
   vérifiées. Si tu ne trouves pas la cause racine, tu écris « cause racine non identifiée » et tu
   listes les pistes — tu n'inventes pas de chemin de code.
4. **Ne suppose pas qu'un correctif existant règle le symptôme observé.** En particulier, le commit
   `78404db` (« Fix sign handling for refunds and negative amounts in Digifood CSV import ») et les
   fiches `BUG-140-01` / `BUG-141-01` sont déjà présents dans l'arbre, mais les symptômes décrits
   plus bas ont été observés **après**. Re-vérifie dans le code, ne conclus pas depuis le git log.
5. **Numérotation** : convention `NNN_AA_slug.md`, `AA = 01` (Jean-Luc). Relis
   `frontend/docs/bugs/00_INDEX.md` et `backend/docs/bugs/00_INDEX.md` au moment d'écrire pour
   prendre les prochains numéros libres (à cet instant : front ≈ 363+, back ≈ 143+ — à revérifier).
   Ajoute la ligne correspondante dans le `00_INDEX.md` du repo concerné.
6. **Signature** : « JLH » seul en bas de fiche, sans « (avec Claude) ».
7. Chaque fiche se termine par une section **« En clair »** : le bug réexpliqué sans jargon.
8. Si une question ne peut pas être tranchée depuis le code, tu l'ajoutes à `QUESTIONS_A_BERTRAND`
   plutôt que de deviner.

## Contexte indispensable pour ne pas courir après des faux problèmes

La réunion mélange **deux instances** et **deux sources d'intégration**. Beaucoup de contradictions
apparentes du transcript ne sont que ça. Tague systématiquement chaque symptôme :

- Instances : **Analytics** (instance de test, où Bertrand refait les imports) vs **production**.
- Sources : **Digifood** (import CSV — FC Nantes) et **Weezevent / WizzEvent** (sync API — Le Mans).
  Le Mans était sur Digifood **avant**, il est sur Weezevent **maintenant** [31:31].

## Points à instruire

### A. Import / intégration — backend

**A1. [NOUVELLE FICHE] Produits non mappés visibles dans l'Analyse**
Symptôme [12:xx] : des articles sans mapping DataFriday apparaissent quand même dans l'Analyse.
Bertrand : « les produits qui ne sont pas mappés apparaissent quand même dans l'analyse alors qu'ils
ne devraient pas apparaître, puisque je t'avais dit de ne prendre que ce qui était dans DataFriday ».
Instance : Analytics. Source : Digifood CSV (FC Nantes).
À instruire : où le filtre « uniquement les items mappés » est censé s'appliquer (agrégation ? RPC ?
front ?) et pourquoi il ne s'applique pas. Attention à l'articulation avec `BUG-137-01` (ventes non
mappées comptées et affichées « Non mappées ») — dire explicitement si c'est le comportement voulu
qui contredit la demande de Bertrand, ou un vrai défaut.

**A2. [NOUVELLE FICHE] Produit mappé mais sans prix en Data Integration → bon nombre de
transactions, CA faux**
Symptôme [16:00-19:00] : « Galia Nouveau Western IPA 45cl + consigne » est bien le même produit des
deux côtés, mais **n'a pas de prix** en Data Integration. Résultat : 4204 transactions (le bon
compte, confirmé [36:50] et [47:46]) mais un CA faux, et des lignes à 0.
C'est **le signal le plus fort de la réunion** : compte de transactions juste + CA faux ⇒ le
problème est sur la valorisation, pas sur l'ingestion.
À instruire : que fait l'agrégation quand `price` est null/absent sur l'item mappé — 0 ? skip ?
Faut-il un prix issu de la transaction plutôt que du catalogue ?

**A3. [NOUVELLE FICHE] « Retour consigne » mappé mais invisible dans l'Analyse**
Symptôme [28:42-30:13] : « Retour consigne » est bien mappé sur « consigne 50cl » côté Data
Integration, et pourtant il n'apparaît pas du tout dans l'Analyse — « il n'y a rien dessus ».
Distinct de A4 (signe) : ici la ligne est absente, pas mal signée.

**A4. [MISE À JOUR + RE-VÉRIFICATION] Montants négatifs importés en positif — Digifood**
Symptôme [21:38] : « il n'a rien en négatif, il a tout pris en positif » sur Nantes (Digifood).
Comparaison [30:42-31:28] : sur Le Mans (Weezevent) le retour consigne est bien à `-0,83` ; sur
Nantes (Digifood) le même est en `+0,83`.
Impact métier [23:00] : les déconsignes gonflent le CA de façon massive.
⚠️ Le commit `78404db` prétend corriger ça. Le symptôme est postérieur. Vérifie si le correctif
couvre bien ce chemin (quel parser, quelle colonne, quel type d'article) ou s'il est partiel, et
dis-le explicitement dans la fiche.

**A5. [NOUVELLE FICHE — distincte de BUG-141-01] Après une sync Weezevent, l'Analyse devient vide**
Symptôme [54:07-56:47] : après un import + une resynchronisation Data Integration, l'Analyse ne
remonte plus rien, **même après hard refresh**. Ulrich : « j'ai l'impression que ça touche tous les
éléments WithEvent, tous les imports WithEvent ». Instance : Analytics.
⚠️ Ne fusionne pas avec `BUG-141-01`, qui porte sur le **matching CSV Digifood**. Ici c'est le
chemin **Weezevent**. Si l'instruction montre que c'est la même cause racine, dis-le — mais
démontre-le, ne le présuppose pas.

**A6. [MISE À JOUR de BUG-138-01] Transactions manquantes sur Le Mans**
Symptôme [32:32] : il manque ~80 transactions par rapport au chiffre Weezevent. Un ré-import répond
« already known » et n'ajoute rien [47:46]. Question ouverte de Bertrand : un ré-import peut-il
rattraper les lignes sautées pendant le live, ou faut-il supprimer l'intégration d'abord ?
À instruire : la logique d'idempotence de l'import (sur quelle clé ?) et pourquoi elle empêche le
rattrapage. Lien avec `BUG-139-01` (aucun chemin de resync ne rattrape une fenêtre passée).

**A7. [VÉRIFICATION du sens de BUG-140-01] Décalage 2 h Digifood CSV**
Données du transcript [13:00] : dans le CSV la vente est à **12h03**, dans l'Analyse elle s'affiche
à **14h03** ⇒ l'Analyse affiche **+2 h** par rapport à l'heure murale du fichier. Idem première
vente CSV 11h58 → 13h58 affiché.
Mais Bertrand hésite sur le sens (« je pense que ce serait le contraire ») [7:12].
⚠️ **Confirme le sens depuis le code avant toute conclusion.** Si `BUG-140-01` décrit le sens
inverse, corrige la fiche ; si elle est juste, ajoute la preuve chiffrée ci-dessus.

### B. Modèle métier — fenêtre temporelle des events

**B1. [SPEC, PAS UN BUG] Règle de fenêtre pour les events multi-jours**
Décision prise en réunion [0:00-0:32] par Ulrich et Bertrand :
- Event sur **un seul jour** : pas de problème, comportement actuel conservé.
- Event sur **plus d'un jour** : l'**heure de fin** est prise en compte.
- L'heure de **début** est **0h**, **sauf** s'il existe un event la veille qui finit plus tard —
  dans ce cas la fenêtre démarre à la fin de l'event précédent.
Ne cherche pas un défaut ici : rédige la règle comme spécification, vérifie ce que fait le code
aujourd'hui, et liste les écarts. Lien avec `BUG-142-01`.

**B2. [MISE À JOUR de BUG-142-01] Deux matchs le même jour**
Cas concrets cités [1:04:00] : SFP Montauban et PFC Dior, même date, même stade (6-0-9) → un seul
match visible, chiffres faux, CA global faussé. Même problème sur PFC Le Havre / Femina et
SFP Cardiff. Bertrand : « c'est arrivé d'un coup », sans savoir sur quel déploiement.
Ajoute ces cas concrets à la fiche existante et vérifie si la règle B1 les couvre.

### C. Frontend — Analyse

**C1. [MISE À JOUR de BUG-359-01] Détail de l'espace précédent**
Cas concret [1:25] : sur La Beaujoire on affiche « Nantes-Rodez » ; on bascule sur Le Mans et
« Nantes-Rodez » reste affiché.

**C2. [MISE À JOUR de BUG-361-01] Lenteur de l'Analyse**
Observation [1:00:29] : avant, les rapports s'affichaient les uns après les autres ; maintenant tout
est chargé d'un coup, c'est « beaucoup plus long » et « ça chauffe ».
Piste soulevée par Jean-Luc [59:53] : un **cap qui existait sur le nombre d'events (≈50 ?)** aurait
disparu. À vérifier dans le code — le chiffre 50 est incertain, ne l'écris pas comme un fait.

**C3. [MISE À JOUR de BUG-358-01 — décision à acter] TX/MIN**
Le comportement actuel (deux formules selon que le panneau Shop Performance est ouvert ou fermé) est
constaté. **La décision est prise** [1:03:38] : retenir la **somme des moyennes par buvette**, pas la
moyenne globale — parce qu'elle donne une meilleure idée du **staff nécessaire**. Acte cette décision
dans la fiche (et dans un ADR si le repo en attend un) ; ne rouvre pas le débat.

**C4. [NOUVELLE FICHE] « Jean-Bouin » toujours listé alors que le lieu n'existe plus**
Symptôme [1:04:00] : « J'ai toujours Jean-Bouin ici, alors qu'il n'existe plus ».
À instruire : d'où vient la liste (cache front ? données non filtrées ? soft-delete non respecté ?).

## Contrainte d'urgence à mentionner dans les fiches concernées

Bertrand [32:32] : « Demain matin, ils vont allumer Data Friday pour voir leurs chiffres. Si c'est
différent de Weezevent, on va se faire défoncer. » Les points **A2, A4 et A6** (écart de CA et de
volume vs Weezevent) sont donc les plus prioritaires — indique la priorité dans chaque fiche.

## Livrable attendu

1. Le plan (avant toute rédaction).
2. Les fiches créées / mises à jour, chacune ancrée `fichier:ligne`.
3. Les deux `00_INDEX.md` à jour.
4. Une synthèse finale : ce qui est confirmé dans le code, ce qui reste à vérifier en base ou en
   recette, et les questions à poser à Bertrand.

---

# Déjà fait — ne pas refaire

> ⚠️ Ce lot était « en attente de commit » au moment de la réunion ; il est depuis **commité**
> (`cf661ed` — « Refactor code structure for improved readability and maintainability », 31 fichiers,
> +16848 / −59, arbre propre). Le message de commit est générique et ne dit rien de son contenu :
> c'est cette section qui fait foi. Avant de toucher à l'un des points ci-dessous, **relis le code
> réel** — tu peux avoir à le corriger ou à l'étendre, mais tu ne le réimplémentes pas de zéro.

## En clair

### Backend (1 fichier de code + docs)

- **Import CSV Digifood — heures décalées de 2 h (BUG-140-01)** : les fichiers Digifood donnent
  l'heure « au mur » du stade (heure de Paris), sans préciser le fuseau. Le serveur les enregistrait
  comme si c'était de l'heure UTC, donc tout s'affichait 2 h trop tard. Désormais le backend
  considère ces heures comme de l'heure de Paris et les convertit correctement en UTC avant de les
  stocker — été/hiver gérés automatiquement, quel que soit le serveur qui fait l'import.
- **Docs** : runbook du 24/08 mis à jour, 5 nouvelles fiches bugs (139 à 142 + checklist de recette),
  requête pour les produits non mappés de La Beaujoire.

### Frontend (page Analyse)

1. **Carte TX/MIN — une seule formule (BUG-358-01)** : avant, le chiffre changeait selon qu'on avait
   ouvert ou non le panneau Shop Performance (deux formules différentes). Décision du 24/08 :
   toujours la même formule — la **somme des taux moyens par point de vente** — avec un sous-texte
   qui le dit. Plus de « Cliquer », plus de saut de valeur.
2. **Pas de valeur provisoire sur TX/MIN** : la carte reste en squelette tant que tous les paniers ne
   sont pas chargés ; avant, elle pouvait afficher une somme partielle qui bougeait ensuite.
3. **Changement d'espace — timeline fantôme (BUG-359-01)** : en changeant d'espace, le détail
   timeline restait ouvert avec le match de l'ancien espace. Il se ferme maintenant, et rien ne se
   déclenche tant que le store n'est pas aligné sur le nouvel espace.
4. **Changement d'espace — KPIs à 0 € (BUG-360-01)** : les filtres (événements sélectionnés, etc.)
   gardaient les identifiants de l'ancien espace → intersection vide → tout à zéro jusqu'à un
   rechargement complet. Les filtres sont maintenant remis à zéro au changement d'espace.
5. **Chargement plus rapide (BUG-361-01)** : les données étaient chargées paquet par paquet, un seul
   à la fois (protection mémoire du backend après un crash « out of memory »). Maintenant : **2
   paquets en parallèle** — la mémoire du backend reste protégée, mais la page charge nettement plus
   vite.
6. **Crash Chart.js (BUG-362-01)** : erreur « ownerDocument null » quand un graphique essayait de se
   redessiner alors que sa page n'était plus affichée. Une garde ignore ces mises à jour inutiles.

Plus **2 fichiers de tests unitaires** mis à jour pour couvrir ces changements.

### Ce que ça change concrètement

- Les heures des ventes importées par CSV Digifood seront justes (fini le +2 h) — **mais uniquement
  pour les prochains imports** : les transactions déjà en base gardent leurs heures décalées tant
  qu'on ne les réimporte pas ou qu'on ne les corrige pas.
- La carte TX/MIN affiche toujours le même chiffre, avec sa formule expliquée.
- Changer d'espace ne laisse plus de données de l'ancien espace à l'écran (timeline, KPIs à zéro).
- La page Analyse charge plus vite, sans risque de refaire planter le backend.

## Détail technique (pour t'orienter dans le code)

| Sujet | Fichier | Ce qui a été fait |
|---|---|---|
| BUG-140-01 | `backend/src/features/digifood/services/digifood-csv-import.service.ts` | `parseCsvDate` : horodatage naïf = heure murale `CSV_NAIVE_TIMEZONE = 'Europe/Paris'`, converti en instant UTC via `utcOffsetMinutes` (2 passes, DST géré). Horodatage avec fuseau explicite (`Z` ou `±hh:mm`) → parsing direct. |
| BUG-361-01 | `frontend/src/api/endpoints/space.api.js` | Paquets batch : séquentiel strict → concurrence bornée `_BATCH_CONCURRENCY = 2` (pool de workers). Mémoire backend bornée à 2 × 15 events, loin des 77 de l'OOM BUG-357-01. |
| BUG-358-01 | `frontend/src/utils/shopPerformanceCompute.js`, `useMetricsCalculator.js`, `AnalyseView.vue`, `panels/FinancialMetricsGrid.vue` | Nouvelle `sumShopTransactionRates()` = Σ des taux moyens par PdV, appliquée en permanence (fin de l'override au clic). Parité avec `computeRatesFromTimeline` verrouillée par test. Garde `!= null` au lieu de `> 0` (0 = terminal). Sous-texte = la formule (clé i18n `anKpiTxRateScope`). |
| BUG-350-01 | `frontend/src/composables/useTransactionBaskets.js` | `'ready'` publié seulement quand TOUS les events scopés ont été tentés ; `[]` sur event KO compte comme « tenté » (pas de squelette éternel). |
| BUG-359-01 | `frontend/src/components/analyse/AnalyseView.vue` | Watcher `immediate` neutralisé tant que le store n'est pas aligné sur la route ; fermeture du détail timeline avant chargement du nouvel espace (keepAlive, `key = route.name`). |
| BUG-360-01 | `frontend/src/store/modules/analyse.js` | `CLEAR_SPACE_KEYED_CACHES` purge aussi les filtres (`selectedEventIds`, shops, articles). |
| BUG-362-01 | `frontend/src/lib/chartjs.js` | Patch `ChartJS.prototype.update` : no-op si le canvas est détaché du DOM. |
| Tests | `frontend/tests/unit/analyseKpiSourceGating.spec.js`, `shopPerformanceCompute.spec.js` | Gating `ready` + parité Σ taux par PdV. **Non exécutés** — à faire tourner. |

## Conséquences pour ta feuille de route

- **Ne retouche pas** les points 1 à 6 ci-dessus, sauf si l'instruction d'un bug de la liste
  principale montre qu'ils sont incomplets ou faux — dans ce cas, dis explicitement en quoi.
- **Reste entièrement à faire** : `A1` (produits non mappés visibles), `A2` (produit sans prix → CA
  faux), `A3` (retour consigne invisible), `A4` (négatifs Digifood en positif), `A5` (Analyse vide
  après sync Weezevent), `A6` (transactions manquantes Le Mans), `B1`/`B2` (fenêtre multi-jours,
  deux matchs le même jour), `C4` (Jean-Bouin).
  Les fiches `139_01`, `141_01`, `142_01` existent mais **aucun correctif backend** ne les
  accompagne : elles décrivent, elles ne corrigent pas.
- **Point de vigilance métier** : tout le frontend Analyse est corrigé, l'**ingestion et la
  valorisation backend ne le sont pas** — or ce sont `A2`, `A4` et `A6` qui produisent l'écart de CA
  et de volume vs Weezevent, c'est-à-dire exactement le risque de demain matin. Priorise-les.
- **Dette laissée par le correctif 140-01** : les transactions déjà en base restent décalées de 2 h.
  Instruis le chemin de rattrapage (réimport ? migration de correction ?) et note-le dans la fiche —
  ne l'exécute pas.
