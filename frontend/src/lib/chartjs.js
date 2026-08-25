/**
 * Enregistrement global Chart.js (à importer une fois au niveau app ou par composant).
 */
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
  PointElement,
  LineElement,
  TimeScale,
  Filler,
} from 'chart.js'

let registered = false

export function registerChartJs() {
  if (registered) return
  ChartJS.register(
    ArcElement,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Title,
    PointElement,
    LineElement,
    TimeScale,
    Filler,
  )
  // BUG-362-01 — « Cannot read properties of null (reading 'ownerDocument') » :
  // vue-chartjs relance chart.update() quand ses données réactives changent, même si le
  // canvas n'est plus rattaché au DOM (vue en keep-alive désactivée, ou course au
  // démontage pendant un changement d'espace — le reset des filtres de BUG-360-01 fait
  // muter les données de tous les charts d'un coup). Chart.js re-résout alors ses
  // handlers responsive sur un canvas sans parent → getComputedStyle(null) → crash.
  // Garde : un update sur canvas détaché est un no-op — les données du chart sont déjà
  // mutées par vue-chartjs AVANT l'appel, et au ré-attachement le handler responsive
  // « attached » de Chart.js déclenche le resize+render avec ces données à jour.
  const originalUpdate = ChartJS.prototype.update
  ChartJS.prototype.update = function guardedUpdate(...args) {
    if (this.canvas && !this.canvas.isConnected) return
    return originalUpdate.apply(this, args)
  }
  registered = true
}
