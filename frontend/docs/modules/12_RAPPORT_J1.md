# 12 — Rapport J+1 (PDF post-événement)

> Rédigé le 2026-08-04 (demande Bertrand, réunion du 04/08 — spec « Copie de RH.pdf » p.1). — JLH

## 1. Quoi

Un bouton dans le **bandeau rouge d'Analyse** génère un **PDF A4 (2 pages)** récapitulatif pour
**un événement passé** :

- **Page 1** : photo de l'espace (`Space.image`) avec nom espace + nom événement + date + heure du
  show + météo (facultative) ; barre de widgets **Réel** (CA, tickets scannés, per cap,
  transformation, panier moyen) ; barre **Prédictif** ; barre **Différence** en % ; totaux
  CA Boissons / CA Food / CA Bière.
- **Page 2** : camembert répartition Food/Beverage ; Top 5 Boissons et Top 5 Food (nom, qté, CA).

## 2. Où (fichiers)

| Rôle | Fichier |
|---|---|
| Orchestrateur (fetch predict + météo, capture, jsPDF) | `src/composables/useReportJ1.js` |
| Document hors écran capturé (794 px, ratio A4) | `src/components/analyse/ReportJ1Document.vue` |
| Météo Open-Meteo (géocodage ville + archive horaire) | `src/utils/eventWeather.js` |
| Contournement oklch pour html2canvas | `src/utils/oklchFallback.js` (+ `tests/unit/oklchFallback.spec.js`) |
| Bouton bandeau rouge + câblage | `src/components/analyse/AnalyseView.vue` (rangée row1, avant le menu export) |
| i18n | `translations.js`, clés `rj1*` (EN + FR) |
| Dépendance | `jspdf` (import dynamique, comme `import('xlsx')`) — `pnpm install` requis |

## 3. Règles

- **Point d'entrée** : bouton actif uniquement si **un seul événement passé** est sélectionné dans
  les filtres (`isSingleEventMode` + date < aujourd'hui) ; sinon désactivé avec tooltip. Même garde
  `exportBusy` que l'export xlsx (pas de PDF sur une page à moitié chargée).
- **Aucune ré-agrégation** : KPI réels = `useMetricsCalculator` (mêmes valeurs que le bandeau) ;
  transformation = même formule que le KPI du header. Classification Food/Beverage/Beer =
  `classifyMenuRevenueBucket` (`analyseDimensions.js`) sur `articleRecords` (mêmes records que les
  donuts).
- **Familles** : « CA Boissons » = type Beverage **bière incluse** ; « CA Bière » = la catégorie,
  comptée en plus (cf. maquette : « Beer Pint » figure dans le top 5 Beverage). Question #44.
- **Prédictif — résolution en cascade, lecture seule** (décision JLH 2026-08-05 : pas de dialogue,
  aucune écriture en base) : ① versions de l'event lui-même (`isDefault`, sinon la plus récente) ;
  ② sinon **appariement automatique** avec un autre event du space — même nom normalisé d'abord,
  même date calendaire ensuite (le doublon typique : event prédit créé à la main vs event réel
  importé de Weezevent), premier candidat porteur d'un scénario retenu (borné à 5 essais) ;
  ③ sinon barre « Aucun prédictif enregistré », rapport généré quand même. Quand le scénario vient
  d'un event apparié, la provenance est imprimée sous la barre (« Scénario "X" (event Y) »).
  Seuls les champs persistés sont affichés (CA prévu, per cap prévu, tickets du `eventSnapshot`) ;
  transformation/panier prévus = « — » — jamais de chiffre reconstitué dans un PDF qui se
  transfère. Questions #43.
- **Classification du rapport ≠ écran** (décision JLH 2026-08-04, question #47) : le rapport teste
  d'abord les signaux ARTICLE (`classifyForReport` dans `useReportJ1.js`, regex partagées
  `*_SIGNAL_RE` d'`analyseDimensions.js`) et ne retombe sur `classifyMenuRevenueBucket` (repli PdV
  inclus) qu'à défaut — un Coca vendu à un stand food reste une boisson dans le PDF, alors que les
  camemberts écran le comptent en Food. Divergence assumée, à trancher côté écran par Bertrand.
- **Style** : tokens de la charte (`--font-ui`, `--fs-*`, `--fw-*` — ils cascadent depuis `:root`
  jusque dans le document hors écran), gris slate d'Analyse, liseré coloré à gauche des widgets
  (pattern `KpiCard::before`), bandeau photo radius 18px, logo `assets/datafriday.png`, tables au
  pattern `MenuItemsByShopTable` (bande `#F9FAFB`). Locale unique (BUG-240) : montants
  `formatPrice`/`formatCurrency` sans locale forcée, % `formatPercentLocale`, dates
  `Intl.DateTimeFormat(intlLocale)`. `pnpm lint:typo` conforme.
- **Météo (facultative)** : géocodage `Space.city` puis archive horaire Open-Meteo à l'heure du
  show (20 h par défaut). `fetchEventWeather` ne jette jamais — échec = section omise. Question #46.
- **Heure du show** : `event.showTime` dérivé par le store (`sessions[0].showTime`), sinon omise.
  Question #42.
- **Rendu** : composant monté hors écran (position fixe hors viewport, PAS `display:none`),
  capture `html2canvas` par `.rj1-page` (`useCORS: true` — l'image d'espace est une URL publique
  Supabase Storage, `crossorigin="anonymous"` + fallback bandeau uni sur erreur), assemblage
  `jsPDF` A4 portrait, fichier `rapport-j1-<slug-event>-<date>.pdf`. Camembert dessiné à la main
  (canvas 2D) — rendu synchrone déterministe, pas de dépendance au cycle d'animation de Chart.js.
- **Contrainte `oklch`** : html2canvas 1.4.1 jette « unsupported color function "oklch" » dès
  qu'une valeur calculée en contient — or `src/index.css` porte le thème Tailwind v4, dont les
  185 tokens de couleur sont tous en `oklch()`, hérités par tout le document. `sanitizeOklchColors`
  (`utils/oklchFallback.js`) les convertit en `rgb()` **dans le clone jetable** passé au hook
  `onclone`, jamais dans le CSS réel (ces tokens sont la charte). Conversion Oklab → sRGB écrite à
  la main : `getComputedStyle` conserve `oklch()`, c'est exactement ce que html2canvas reçoit.
  Le même correctif s'applique aux boutons **Copier / Partager** (`useAnalyseCapture.js`), touchés
  par le même défaut.

## 4. Limites connues

- ⚠️ Hérite du **BUG #2** du module Analyse (agrégats TTC sous label HT avant le 21/07) : un PDF
  se transfère et fige le chiffre — replay des agrégats toujours en attente.
- Les widgets prévus au-delà de CA/tickets/per cap rendent « — » (pas de transactions prévues
  persistées).
- Météo indisponible pour les événements trop récents (< ~5 jours, latence de l'archive
  Open-Meteo) ou si la ville de l'espace n'est pas renseignée.

## 5. Vérification

1. Event passé avec version predict → PDF 2 pages complet, chiffres identiques aux widgets écran.
2. Event sans predict → « Aucun prédictif enregistré », pas de crash.
3. Espace sans image / sans ville → PDF dégradé mais valide.
4. Bouton désactivé : 0 ou 2+ events sélectionnés, event futur, chargements en cours.
5. Bascule EN/FR → tous les libellés suivent.
