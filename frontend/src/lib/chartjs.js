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
  registered = true
}
