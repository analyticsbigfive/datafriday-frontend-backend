# BUG-362-01 — Crash runtime « Cannot read properties of null (reading 'ownerDocument') » — chart.update() sur canvas détaché

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur (overlay d'erreur webpack plein écran en dev)
- **Domaine** : Analyse & agrégation / Transverse (charts)
- **Repo(s) concerné(s)** : `datafriday-frontend-backend` (frontend)
- **Découvert le** : 2026-08-24 (JLH, après les correctifs 359/360 — test changement d'espace)
- **Fichiers** : `src/lib/chartjs.js` (`registerChartJs`, garde), consommateurs :
  `src/components/analyse/charts/{DonutChartCard,GenericByEventChart,EventRevenueByShopChart,EventTimelineChart}.vue`

## En clair

Quand on change d'espace, toutes les données de graphes changent d'un coup — y compris pour des
graphes qui ne sont plus visibles à l'écran (vues gardées en mémoire par le keep-alive, ou vue en
cours de démontage). La librairie de graphes tentait quand même de les redessiner, et plantait en
cherchant le parent d'un canvas qui n'est plus dans la page. La garde ignore ces redessins
inutiles ; au retour de la vue, le graphe se redessine normalement avec les données à jour.

## Symptôme

Overlay « Uncaught runtime errors » : `TypeError: Cannot read properties of null (reading
'ownerDocument')` — pile `getComputedStyle → getMaximumSize → Chart._resize → detached →
bindResponsiveEvents → Chart.update → vue-chartjs update`.

## Cause racine

vue-chartjs (5.3.3) relance `chart.update()` à chaque mutation de ses données réactives, sans
vérifier que le canvas est encore rattaché au DOM. Chart.js 4.5.1, dans `update()` →
`_checkEventBindings` → `bindResponsiveEvents`, détecte le canvas détaché et appelle son handler
`detached` → `_resize` → `getMaximumSize(parentNode)` avec `parentNode = null` → crash. Déclencheur
aggravé par BUG-360-01 : le reset des filtres au changement d'espace fait muter d'un coup les
données de tous les charts, y compris ceux de vues keep-alive désactivées (DashboardView,
`:max="6"`) et de l'instance en cours de démontage.

## Correction

2026-08-24 — `registerChartJs()` (point d'enregistrement commun des charts Analyse) patche une
fois `ChartJS.prototype.update` : no-op si `canvas.isConnected === false`. Sans perte : les
données du chart sont mutées par vue-chartjs AVANT l'appel à update, et au ré-attachement le
handler responsive « attached » de Chart.js déclenche resize + render avec ces données.

## Risque de régression / à surveiller

- Un chart re-affiché après détachement doit repartir avec les données à jour (vérifier : ouvrir
  un outil keep-alive avec charts, changer d'espace, revenir — graphes corrects, pas figés).
- La garde ne couvre que les composants passant par `registerChartJs` tant qu'aucun chart d'un
  autre module n'a été monté — le patch prototype devient global dès le premier chart Analyse.

— JLH
