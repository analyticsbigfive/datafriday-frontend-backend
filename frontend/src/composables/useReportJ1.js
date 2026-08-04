/**
 * useReportJ1 — génération du « Rapport J+1 » : un PDF récapitulatif pour UN
 * événement passé (photo de l'espace, réel vs prédictif, répartition
 * Food/Beverage/Beer, top 5 par famille, météo facultative).
 *
 * Même philosophie que `useAnalyseExport` : le composable ne recalcule aucune
 * métrique déjà calculée ailleurs — les KPI réels viennent de
 * `useMetricsCalculator` (mêmes valeurs que le bandeau). Le rendu passe par un
 * composant hors écran (`ReportJ1Document`) capturé page par page via
 * html2canvas, puis assemblé en A4 par jsPDF (imports dynamiques — même
 * pattern que `import('xlsx')`).
 *
 * Prédictif — résolution en cascade, LECTURE SEULE (décision JLH 2026-08-05 :
 * pas de dialogue, pas d'écriture en base) :
 *   1. les EventPredictVersion de l'event lui-même ;
 *   2. sinon, appariement automatique avec un AUTRE event du space — même nom
 *      normalisé d'abord, même date calendaire ensuite (le doublon typique :
 *      event prédit créé à la main vs event réel importé de Weezevent) — et on
 *      prend le scénario du premier candidat qui en a un ;
 *   3. sinon → rapport avec « — », mention explicite.
 * Seuls les champs PERSISTÉS d'une version sont affichés (CA prévu, per cap
 * prévu, spectateurs du snapshot) ; le reste rend « — » plutôt qu'un chiffre
 * reconstitué — un PDF se transfère, un chiffre inventé y survivrait sans
 * contexte.
 *
 * Classification Food/Beverage/Beer — divergence ASSUMÉE avec l'écran
 * (décision JLH 2026-08-04, question Bertrand #47) : l'écran classe via
 * `classifyMenuRevenueBucket`, où le type du PdV peut primer (un Coca vendu à
 * un stand food devient Food). Le rapport teste d'abord les signaux ARTICLE
 * seuls, et ne retombe sur la règle écran (repli PdV inclus) que si l'article
 * ne porte aucun signal.
 */

import { ref, nextTick } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { listEventPredictVersions } from '@/api/endpoints/eventPredict.api'
import {
  classifyMenuRevenueBucket,
  menuItemSignalHay,
  resolveItemName,
  BEER_SIGNAL_RE,
  FOOD_SIGNAL_RE,
  BEVERAGE_SIGNAL_RE,
} from '@/utils/analyseDimensions'
import { parseEventDate } from '@/utils/dateFr'
import { fetchEventWeather } from '@/utils/eventWeather'
import { sanitizeOklchColors } from '@/utils/oklchFallback'

/** Largeur de rendu du document hors écran (px) — ratio A4 portrait. */
export const REPORT_PAGE_WIDTH = 794

/** Famille d'un record pour le RAPPORT : signaux article d'abord, PdV en repli. */
export function classifyForReport(record) {
  const hay = menuItemSignalHay(record)
  if (BEER_SIGNAL_RE.test(hay)) return 'BEER'
  if (FOOD_SIGNAL_RE.test(hay)) return 'FOOD'
  if (BEVERAGE_SIGNAL_RE.test(hay)) return 'BEVERAGE'
  return classifyMenuRevenueBucket(record)
}

/**
 * @param {object} options
 * @param {import('vue').ComputedRef<object|null>} options.space          space courant (name, image, city…)
 * @param {import('vue').ComputedRef<object|null>} options.reportEvent   l'event unique sélectionné (ou null)
 * @param {import('vue').ComputedRef<Array>} options.events              tous les events du space (candidats liaison)
 * @param {object} options.metrics        retour de useMetricsCalculator (displayRevenue, …)
 * @param {import('vue').ComputedRef<Array>} options.articleRecords      records grain article (mêmes que donuts/tables)
 * @param {import('vue').ComputedRef<boolean>} options.busy              chargements en cours (même garde que l'export)
 * @param {(text: string, color?: string) => void} options.notify        snackbar partagée
 */
export function useReportJ1({ space, reportEvent, events, metrics, articleRecords, busy, notify }) {
  const { t } = useI18n()

  const generatingReport = ref(false)
  /** Données du rapport en cours — non-null = le composant hors écran est monté. */
  const reportData = ref(null)

  // ─── Agrégats par famille (Food / Beverage / Beer) ───────────────────────
  // « Beverage » est le TYPE — il inclut la bière (le top 5 Boissons liste
  // « Beer Pint ») ; « Beer » est la CATÉGORIE, comptée en plus, pas à la
  // place. COMBO reste hors des trois totaux.
  function computeBucketData(records) {
    const totals = { FOOD: 0, BEVERAGE: 0, BEER: 0, COMBO: 0 }
    const items = new Map() // nom → { name, bucket, quantity, revenue }

    for (const r of records) {
      const bucket = classifyForReport(r)
      const revenue = r.revenue || 0
      totals[bucket] += revenue

      const name = resolveItemName(r)
      if (!name) continue
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
      caFood: totals.FOOD,
      caBeverage: totals.BEVERAGE + totals.BEER,
      caBeer: totals.BEER,
      caCombo: totals.COMBO,
      topBeverage: sorted.filter((i) => i.bucket === 'BEVERAGE' || i.bucket === 'BEER').slice(0, 5),
      topFood: sorted.filter((i) => i.bucket === 'FOOD').slice(0, 5),
    }
  }

  // ─── Prédictif ───────────────────────────────────────────────────────────
  /** Version par défaut d'un event (sinon la plus récente), ou null — jamais de throw. */
  async function loadPredictVersion(eventId) {
    try {
      const versions = await listEventPredictVersions(eventId)
      if (!Array.isArray(versions) || !versions.length) return null
      return (
        versions.find((v) => v.isDefault) ||
        [...versions].sort((a, b) =>
          String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
        )[0]
      )
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[useReportJ1] predict versions indisponibles', e)
      return null
    }
  }

  /** Nom normalisé pour l'appariement (accents/casse/ponctuation neutralisés). */
  function normalizedEventName(ev) {
    return String(ev?.name || ev?.eventName || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  }

  /** Jour calendaire « YYYY-MM-DD » d'un event, ou null. */
  function eventDayKey(ev) {
    const d = parseEventDate(ev?.date ?? ev?.eventDate)
    return d ? d.toISOString().split('T')[0] : null
  }

  /**
   * Cascade LECTURE SEULE : versions de l'event → appariement automatique avec
   * un autre event du space (même nom normalisé d'abord, même date ensuite —
   * le doublon typique event prédit ↔ event réel Weezevent). Rend
   * { version, linkedEvent } ou null. Aucune écriture en base.
   */
  async function resolvePredictVersion(ev) {
    const own = await loadPredictVersion(ev.id)
    if (own) return { version: own, linkedEvent: null }

    const name = normalizedEventName(ev)
    const day = eventDayKey(ev)
    const others = (events.value || []).filter((e) => e?.id && e.id !== ev.id)
    const byName = name ? others.filter((e) => normalizedEventName(e) === name) : []
    const byDate = day
      ? others.filter((e) => eventDayKey(e) === day && !byName.includes(e))
      : []

    // Nom identique d'abord (signal le plus fort), même jour ensuite. Borné :
    // un appel réseau par candidat, on s'arrête au premier qui a un scénario.
    for (const candidate of [...byName, ...byDate].slice(0, 5)) {
      const version = await loadPredictVersion(candidate.id)
      if (version) return { version, linkedEvent: candidate }
    }
    return null
  }

  function buildPredicted(version) {
    if (!version) return null
    const snap = version.eventSnapshot || {}
    const revenue = version.adjustedTotalRevenue || version.totalRevenue || null
    const perCapita = version.adjustedPerCapita || version.perCapita || null
    // Même cascade de champs spectateurs que useMetricsCalculator (scanned → attendees → sold).
    const tickets = snap.ticketsScanned ?? snap.attendees ?? snap.ticketsSold ?? null
    return {
      revenue,
      tickets,
      perCapita,
      // Transactions prévues non persistées → panier moyen et transformation
      // prévus inconnus. Rendus « — » par le composant.
      basket: null,
      transformation: null,
    }
  }

  /** Écart en % (réel vs prévu), null si l'un des deux manque ou prévu = 0. */
  function diffPct(actual, predicted) {
    if (actual == null || predicted == null || !predicted) return null
    return ((actual - predicted) / predicted) * 100
  }

  // ─── Capture → PDF ───────────────────────────────────────────────────────
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

  // ─── Orchestration ───────────────────────────────────────────────────────
  async function onGenerateReportJ1() {
    if (generatingReport.value || busy.value) return
    const ev = reportEvent.value
    if (!ev) return

    generatingReport.value = true
    try {
      const eventDate = parseEventDate(ev.date ?? ev.eventDate)

      // Prédictif (event lui-même, sinon appariement auto nom/date) + météo en
      // parallèle ; ni l'un ni l'autre ne bloque le rapport.
      const [resolved, weather] = await Promise.all([
        resolvePredictVersion(ev),
        fetchEventWeather(space.value, eventDate, ev.showTime),
      ])

      const version = resolved?.version || null
      const trans = metrics.displayTransactions?.value ?? 0
      const att = metrics.displayAttendees?.value ?? 0
      const rev = metrics.displayRevenue?.value ?? 0

      const actual = {
        revenue: rev,
        tickets: att,
        perCapita: metrics.displayPerCapita?.value ?? 0,
        // Même formule que le KPI « Transformation » du bandeau (AnalyseView).
        transformation: att ? (trans / att) * 100 : null,
        basket: trans ? rev / trans : null,
      }
      const predicted = buildPredicted(version)

      reportData.value = {
        space: space.value,
        event: ev,
        eventDate,
        weather,
        actual,
        predicted,
        // Provenance affichée sous la barre Prédictif quand le scénario vient
        // d'un event lié — un PDF se transfère, la source doit s'y lire.
        predictedSource: version
          ? {
              scenarioName: version.name || null,
              linkedEventName: resolved?.linkedEvent
                ? resolved.linkedEvent.name || resolved.linkedEvent.eventName || null
                : null,
            }
          : null,
        diff: predicted
          ? {
              revenue: diffPct(actual.revenue, predicted.revenue),
              tickets: diffPct(actual.tickets, predicted.tickets),
              perCapita: diffPct(actual.perCapita, predicted.perCapita),
              basket: null,
              transformation: null,
            }
          : null,
        buckets: computeBucketData(articleRecords.value || []),
        generatedAt: new Date(),
      }

      // Deux ticks : montage du composant hors écran, puis rendu du canvas pie.
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
