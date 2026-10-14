/**
 * analyseDateBounds : résolution pure des bornes de dates du rapport Analyse
 * (presets, saisons, custom) et des bornes « période précédente » / « N-1 ».
 * Extrait des getters dateBounds, previousPeriodBounds et yearOverYearBounds du
 * store ; `now` est injecté pour des tests déterministes.
 */

/**
 * Borne d'une plage personnalisée. Une date « AAAA-MM-JJ » (champ date, raccourcis
 * Précédent / N-1) est lue en heure LOCALE : `new Date('2025-08-01')` donnerait minuit
 * UTC, soit 02:00 à Paris, et exclurait les events du premier jour, qui sont lus à
 * minuit local (cf. eventDateOf). La fin vaut la fin de journée locale, comme les presets.
 * Toute autre forme (ISO complet, Date) garde le comportement de `new Date(value)`.
 */
function customBound(value, isEnd) {
  const m = typeof value === 'string' ? value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/) : null
  if (!m) return new Date(value)
  return isEnd
    ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999)
    : new Date(+m[1], +m[2] - 1, +m[3])
}

/**
 * Bornes {start, end} d'un jeu de dates.
 * @param {{timeRange: string, startDate?: string, endDate?: string}} range
 * @param {{seasons?: Array, isPredict?: boolean, now?: Date}} [context]
 *   isPredict : en predict, thismonth / thisquarter / thisyear vont jusqu'à la
 *   fin de la période ; en analyse ils s'arrêtent à aujourd'hui.
 */
export function resolveDateBounds({ timeRange, startDate, endDate } = {}, context = {}) {
  const { seasons = [], isPredict = false, now = new Date() } = context
  if (timeRange === 'custom') {
    return {
      start: startDate ? customBound(startDate, false) : null,
      end: endDate ? customBound(endDate, true) : null,
    }
  }
  // Saison (préset dynamique `season:<id>`). Une saison supprimée/inconnue
  // retombe sur « tout l'historique » ({null,null}) et SURTOUT pas sur le
  // `default` du switch (année en cours) : un id orphelin ne doit jamais filtrer
  // silencieusement sur une mauvaise période.
  if (String(timeRange || '').startsWith('season:')) {
    const id = String(timeRange).slice('season:'.length)
    const season = (seasons || []).find((s) => s.id === id)
    if (!season) return { start: null, end: null }
    const start = new Date(season.startDate)
    const end = new Date(season.endDate)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const eod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
  const y = now.getFullYear()
  const m = now.getMonth()
  const q = Math.floor(m / 3)

  switch (timeRange) {
    case 'all':
      return { start: null, end: null }
    case 'last12months':
      // 12 mois glissants : même jour l'an dernier (00:00) → fin de journée.
      return { start: new Date(y - 1, m, now.getDate()), end: eod(today) }
    case 'today':
      return { start: today, end: eod(today) }
    case 'yesterday': {
      const d = new Date(y, m, now.getDate() - 1)
      return { start: d, end: eod(d) }
    }
    case 'thisweek': {
      const dow = (today.getDay() + 6) % 7 // lundi=0
      const start = new Date(y, m, today.getDate() - dow)
      return { start, end: eod(today) }
    }
    case 'lastweek': {
      const dow = (today.getDay() + 6) % 7
      const start = new Date(y, m, today.getDate() - dow - 7)
      const end = new Date(y, m, today.getDate() - dow - 1)
      return { start, end: eod(end) }
    }
    case 'week': // last 7 days
      return { start: new Date(y, m, today.getDate() - 6), end: eod(today) }
    case 'month': // last 30 days
      return { start: new Date(y, m, today.getDate() - 29), end: eod(today) }
    case 'quarter': // last 90 days
      return { start: new Date(y, m, today.getDate() - 89), end: eod(today) }
    case 'thismonth': {
      const start = new Date(y, m, 1)
      const end = isPredict ? new Date(y, m + 1, 0, 23, 59, 59) : eod(today)
      return { start, end }
    }
    case 'lastmonth': {
      const start = new Date(y, m - 1, 1)
      const end = new Date(y, m, 0, 23, 59, 59)
      return { start, end }
    }
    case 'nextmonth':
      return { start: new Date(y, m + 1, 1), end: new Date(y, m + 2, 0, 23, 59, 59) }
    case 'thisquarter': {
      const start = new Date(y, q * 3, 1)
      const end = isPredict ? new Date(y, q * 3 + 3, 0, 23, 59, 59) : eod(today)
      return { start, end }
    }
    case 'lastquarter': {
      const start = new Date(y, (q - 1) * 3, 1)
      const end = new Date(y, q * 3, 0, 23, 59, 59)
      return { start, end }
    }
    case 'nextquarter':
      return { start: new Date(y, (q + 1) * 3, 1), end: new Date(y, (q + 2) * 3, 0, 23, 59, 59) }
    case 'thisyear': {
      const start = new Date(y, 0, 1)
      const end = isPredict ? new Date(y, 11, 31, 23, 59, 59) : eod(today)
      return { start, end }
    }
    case 'year':
    case 'last_year':
    case 'lastyear':
      return { start: new Date(y - 1, 0, 1), end: new Date(y - 1, 11, 31, 23, 59, 59) }
    case 'nextyear':
      return { start: new Date(y + 1, 0, 1), end: new Date(y + 1, 11, 31, 23, 59, 59) }
    case 'this_year':
    default:
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59) }
  }
}

/**
 * Période précédente (parité versionReact getPreviousPeriodRange) :
 * - bornes nulles (« all ») → {null, null} = comparaison indisponible ;
 * - preset civil → période civile précédente (Ce mois → mois dernier entier) ;
 * - custom, saison et presets glissants non listés → décalage de la durée avec
 *   1 jour d'écart (repli « bloc précédent »).
 * @param {{start: Date|null, end: Date|null}} bounds  bornes courantes
 * @param {string} timeRange  preset des bornes courantes
 * @param {Date} [now]
 */
export function previousPeriodBoundsOf(bounds, timeRange, now = new Date()) {
  const { start, end } = bounds || {}
  if (!start || !end) return { start: null, end: null }
  const day = (d) => {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
    const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
    return { start: s, end: e }
  }
  const span = (s, e) => ({
    start: new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0),
    end: new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999),
  })
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const y = now.getFullYear()
  const m = now.getMonth()
  const q = Math.floor(m / 3)
  const dow = (today.getDay() + 6) % 7 // lundi = 0

  switch (timeRange) {
    case 'last12months': // les 12 mois d'avant
      return span(new Date(y - 2, m, now.getDate()), new Date(y - 1, m, now.getDate() - 1))
    case 'today':
      return day(new Date(y, m, now.getDate() - 1))
    case 'yesterday':
      return day(new Date(y, m, now.getDate() - 2))
    case 'thisweek': // semaine dernière ENTIÈRE (lun → dim)
      return span(new Date(y, m, today.getDate() - dow - 7), new Date(y, m, today.getDate() - dow - 1))
    case 'lastweek': // semaine encore avant
      return span(new Date(y, m, today.getDate() - dow - 14), new Date(y, m, today.getDate() - dow - 8))
    case 'week': // les 7 jours d'avant
      return span(new Date(y, m, today.getDate() - 13), new Date(y, m, today.getDate() - 7))
    case 'month': // les 30 jours d'avant
      return span(new Date(y, m, today.getDate() - 59), new Date(y, m, today.getDate() - 30))
    case 'quarter': // les 90 jours d'avant
      return span(new Date(y, m, today.getDate() - 179), new Date(y, m, today.getDate() - 90))
    case 'thismonth': // mois dernier ENTIER
      return span(new Date(y, m - 1, 1), new Date(y, m, 0))
    case 'lastmonth': // mois encore avant
      return span(new Date(y, m - 2, 1), new Date(y, m - 1, 0))
    case 'thisquarter': // trimestre dernier ENTIER
      return span(new Date(y, (q - 1) * 3, 1), new Date(y, q * 3, 0))
    case 'lastquarter': // trimestre encore avant
      return span(new Date(y, (q - 2) * 3, 1), new Date(y, (q - 1) * 3, 0))
    case 'thisyear': {
      // Mêmes jours écoulés l'an dernier (parité React l.7982-7986).
      // Math.round et non floor : après le passage à l'heure d'été, l'écart en ms vaut 1 h de moins
      // qu'un nombre entier de jours (à Paris, floor s'arrêtait un jour trop tôt).
      const daysSoFar = Math.round((today.getTime() - new Date(y, 0, 1).getTime()) / 86400000)
      return span(new Date(y - 1, 0, 1), new Date(y - 1, 0, 1 + daysSoFar))
    }
    case 'year':
    case 'last_year':
    case 'lastyear': // année dernière → année d'encore avant, entière
      return span(new Date(y - 2, 0, 1), new Date(y - 2, 11, 31))
    case 'custom':
    default: {
      // Décalage de la durée, avec 1 jour d'écart (parité React l.7842-7849).
      const duration = end.getTime() - start.getTime()
      const prevEnd = new Date(start.getTime() - 86400000)
      prevEnd.setHours(23, 59, 59, 999)
      const prevStart = new Date(prevEnd.getTime() - duration)
      prevStart.setHours(0, 0, 0, 0)
      return { start: prevStart, end: prevEnd }
    }
  }
}

/** N-1 : bornes courantes décalées de un an (setFullYear(-1)). */
export function yearOverYearBoundsOf(bounds) {
  const { start, end } = bounds || {}
  if (!start || !end) return { start: null, end: null }
  const ys = new Date(start)
  ys.setFullYear(ys.getFullYear() - 1)
  const ye = new Date(end)
  ye.setFullYear(ye.getFullYear() - 1)
  return { start: ys, end: ye }
}
