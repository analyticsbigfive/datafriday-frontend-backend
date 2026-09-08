/**
 * useReportJ1 — génération du « Rapport J+1 » : un PDF récapitulatif pour UN
 * événement passé (photo de l'espace, 6 KPIs réels, répartition des ventes par
 * TYPE et par CATÉGORIE en deux camemberts, top 5 Boissons/Nourriture, météo).
 *
 * Refonte template Bertrand (2026-09) : plus de bloc Prévisionnel/Écart — le
 * rapport ne montre plus que le RÉEL. Les KPIs viennent de `useMetricsCalculator`
 * (mêmes valeurs que le bandeau) ; aucune métrique n'est recalculée. Le rendu
 * passe par un composant hors écran (`ReportJ1Document`) capturé page par page
 * via html2canvas, puis assemblé en A4 par jsPDF (imports dynamiques).
 *
 * Deux découpes ventes (décision Bertrand 2026-09) :
 *   - `byType`     — CA groupé par `menuItemType` (macro : Beverages / Nourriture
 *                    / Packaging…), camembert de gauche + cartes CA.
 *   - `byCategory` — CA groupé par `menuItemCategory` (fin : Beer / Soft /
 *                    Tenders…), camembert de droite (TOUTES les catégories).
 *
 * Classification Food/Beverage/Beer du top 5 — divergence ASSUMÉE avec l'écran
 * (décision JLH 2026-08-04, question Bertrand #47) : le rapport teste d'abord les
 * signaux ARTICLE seuls, et ne retombe sur la règle écran (repli PdV inclus) que
 * si l'article ne porte aucun signal.
 */

import { ref, nextTick } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import {
  classifyMenuRevenueBucket,
  menuItemSignalHay,
  resolveItemName,
  resolveItemType,
  resolveItemCategory,
  BEER_SIGNAL_RE,
  FOOD_SIGNAL_RE,
  BEVERAGE_SIGNAL_RE,
} from '@/utils/analyseDimensions'
import { parseEventDate } from '@/utils/dateFr'
import { fetchEventWeather } from '@/utils/eventWeather'
import { sanitizeOklchColors } from '@/utils/oklchFallback'
import { UNATTACHED_ITEM_KEY } from '@/utils/analyseReconciliation'

// Sentinelle « vente non rattachée au catalogue » (cf. analyseReconciliation) —
// on la détecte de façon tolérante (casse/ponctuation) pour la relibeller côté
// rendu en « Non rattaché » (gris), comme l'écran Analyse.
const UNATTACHED_NORM = UNATTACHED_ITEM_KEY.toLowerCase().replace(/[^a-z]/g, '')
function isUnattached(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z]/g, '') === UNATTACHED_NORM
}

/** Largeur de rendu du document hors écran (px) — ratio A4 portrait. */
export const REPORT_PAGE_WIDTH = 794

/** Famille d'un record pour le TOP 5 : signaux article d'abord, PdV en repli. */
export function classifyForReport(record) {
  const hay = menuItemSignalHay(record)
  if (BEER_SIGNAL_RE.test(hay)) return 'BEER'
  if (FOOD_SIGNAL_RE.test(hay)) return 'FOOD'
  if (BEVERAGE_SIGNAL_RE.test(hay)) return 'BEVERAGE'
  return classifyMenuRevenueBucket(record)
}

/**
 * CA groupé par une clé résolue (type ou catégorie). Clé normalisée en MAJUSCULES
 * pour fusionner les variantes de casse, libellé = 1re orthographe rencontrée.
 * Les records sans clé (non mappés) sont ignorés — un camembert de catégories ne
 * doit pas afficher une tranche « vide ». Tri décroissant, tranches nulles exclues.
 */
function groupRevenueBy(records, resolveKey) {
  const map = new Map() // KEY_UPPER → { label, value }
  for (const r of records) {
    const raw = resolveKey(r)
    if (!raw) continue
    const label = String(raw).trim()
    const key = label.toUpperCase()
    if (!key) continue
    let entry = map.get(key)
    if (!entry) {
      entry = { label, value: 0, unattached: isUnattached(label) }
      map.set(key, entry)
    }
    entry.value += r.revenue || 0
  }
  return [...map.values()].filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
}

/**
 * Agrégats ventes du rapport, en un seul passage :
 *   - `byType` / `byCategory` : découpes pour les deux camemberts.
 *   - `topBeverage` / `topFood` : top 5 par famille (classif. signaux article).
 */
function computeBucketData(records) {
  const items = new Map() // nom → { name, bucket, quantity, revenue }

  for (const r of records) {
    const revenue = r.revenue || 0
    const name = resolveItemName(r)
    if (!name) continue
    const bucket = classifyForReport(r)
    let entry = items.get(name)
    if (!entry) {
      entry = { name, bucket, quantity: 0, revenue: 0 }
      items.set(name, entry)
    }
    entry.quantity += r.quantity || 0
    entry.revenue += revenue
  }

  const sorted = [...items.values()].sort((a, b) => b.revenue - a.revenue)
  return {
    // Camembert gauche (macro) + camembert droit (fin, toutes catégories).
    byType: groupRevenueBy(records, resolveItemType),
    byCategory: groupRevenueBy(records, resolveItemCategory),
    // Top 5 par famille (Beverage inclut Beer, comme les totaux).
    topBeverage: sorted.filter((i) => i.bucket === 'BEVERAGE' || i.bucket === 'BEER').slice(0, 5),
    topFood: sorted.filter((i) => i.bucket === 'FOOD').slice(0, 5),
  }
}

// ─── Capture → PDF ───────────────────────────────────────────────────────────
async function waitForImages(root) {
  const images = [...root.querySelectorAll('img')]
  await Promise.allSettled(
    images.map((img) => (img.decode ? img.decode() : Promise.resolve())),
  )
}

async function renderPdf(fileName) {
  const root = document.getElementById('report-j1-root')
  if (!root) throw new Error('report root introuvable')
  await waitForImages(root)

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const doc = new jsPDF('p', 'mm', 'a4')
  const pages = [...root.querySelectorAll('.rj1-page')]
  for (let i = 0; i < pages.length; i += 1) {
    const canvas = await html2canvas(pages[i], {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      // html2canvas 1.4.1 jette sur `oklch()`, syntaxe de TOUS les tokens de
      // couleur Tailwind v4 (`src/index.css`) dont le document hérite. On les
      // convertit en rgb() dans le clone jetable, jamais dans le CSS réel.
      onclone: (clonedDoc) => sanitizeOklchColors(clonedDoc),
    })
    if (i > 0) doc.addPage()
    // Largeur A4 pleine (210 mm), hauteur proportionnelle — chaque .rj1-page
    // est dimensionnée au ratio A4, donc ça remplit la page sans découpe.
    const h = (canvas.height * 210) / canvas.width
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, Math.min(h, 297))
  }
  doc.save(fileName)
}

/**
 * @param {object} options
 * @param {import('vue').ComputedRef<object|null>} options.space          space courant (name, image…)
 * @param {import('vue').ComputedRef<object|null>} options.reportEvent    l'event unique sélectionné (ou null)
 * @param {object} options.metrics        retour de useMetricsCalculator (displayRevenue, …)
 * @param {import('vue').ComputedRef<Array>} options.articleRecords       records grain article (mêmes que donuts/tables)
 * @param {import('vue').ComputedRef<boolean>} options.busy               chargements en cours (même garde que l'export)
 * @param {(text: string, color?: string) => void} options.notify         snackbar partagée
 */
export function useReportJ1({ space, reportEvent, metrics, articleRecords, busy, notify }) {
  const { t } = useI18n()

  const generatingReport = ref(false)
  /** Données du rapport en cours — non-null = le composant hors écran est monté. */
  const reportData = ref(null)

  async function onGenerateReportJ1() {
    if (generatingReport.value || busy.value) return
    const ev = reportEvent.value
    if (!ev) return

    generatingReport.value = true
    try {
      const eventDate = parseEventDate(ev.date ?? ev.eventDate)
      const weather = await fetchEventWeather(space.value, eventDate, ev.showTime)

      const trans = metrics.displayTransactions?.value ?? 0
      const att = metrics.displayAttendees?.value ?? 0
      const rev = metrics.displayRevenue?.value ?? 0

      reportData.value = {
        space: space.value,
        event: ev,
        eventDate,
        weather,
        actual: {
          revenue: rev,
          transactions: trans,
          // Panier moyen = CA / transactions ; transformation = trans / billets.
          basket: trans ? rev / trans : null,
          tickets: att,
          transformation: att ? (trans / att) * 100 : null,
          perCapita: metrics.displayPerCapita?.value ?? 0,
        },
        buckets: computeBucketData(articleRecords.value || []),
        generatedAt: new Date(),
      }

      // Deux ticks : montage du composant hors écran, puis rendu des canvas.
      await nextTick()
      await nextTick()

      const slug =
        String(ev.name || ev.eventName || 'event')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'event'
      const day = eventDate ? eventDate.toISOString().split('T')[0] : 'date'
      await renderPdf(`rapport-j1-${slug}-${day}.pdf`)

      notify(t('rj1Done'))
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[useReportJ1]', e)
      notify(t('rj1Error'), 'error')
    } finally {
      reportData.value = null
      generatingReport.value = false
    }
  }

  return {
    generatingReport,
    reportData,
    onGenerateReportJ1,
  }
}
