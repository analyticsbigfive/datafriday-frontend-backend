import {
  calculateSimilarity,
  findAndScorePastEvents,
  findAndScorePastEventsWithTrace,
} from '@/utils/predictiveAnalytics'

// Cible : sport / cfg1 / ligue1, 1000 billets, coup d'envoi 19:00.
const target = {
  id: 'T',
  eventName: 'Cible',
  eventDate: '10/06/2026',
  eventType: 'sport',
  configurationId: 'cfg1',
  category: 'ligue1',
  ticketsSold: 1000,
  sessions: [{ showTime: '19:00' }],
}

// Un comparable qui passe TOUS les gates (type/config/catégorie OK, horaire
// identique, affluence identique) → retenu, score élevé.
const pOk = {
  id: 'P_ok',
  eventName: 'Match OK',
  eventDate: '03/06/2026',
  eventType: 'sport',
  configurationId: 'cfg1',
  category: 'ligue1',
  ticketsSold: 1000,
  sessions: [{ showTime: '19:00' }],
}

// Chaque event ci-dessous échoue à UN gate précis (le premier atteint).
const pType = { ...pOk, id: 'P_type', eventName: 'Type ≠', eventType: 'concert' }
const pConfig = { ...pOk, id: 'P_config', eventName: 'Config ≠', configurationId: 'cfg2' }
const pCat = { ...pOk, id: 'P_cat', eventName: 'Catégorie ≠', category: 'ligue2' }
// Horaire 23:30 vs 19:00 → écart circulaire 270 min > 180 → gate showTime
// (atteint AVANT le gate affluence dans evaluateSimilarity).
const pTime = { ...pOk, id: 'P_time', eventName: 'Horaire ≠', sessions: [{ showTime: '23:30' }] }
// Pas d'horaire (showTime sauté) mais affluence 2000 > 1.4×1000 → gate affluence.
const pAtt = {
  ...pOk,
  id: 'P_att',
  eventName: 'Affluence ≠',
  ticketsSold: 2000,
  sessions: [],
}
// Champs valides mais AUCUNE vente rattachée → écarté au niveau salesData
// (jamais scoré). N'apparaît pas dans le granular ci-dessous.
const pNoSales = { ...pOk, id: 'P_nosales', eventName: 'Sans ventes' }

const allEvents = [target, pOk, pType, pConfig, pCat, pTime, pAtt, pNoSales]

// Ventes réelles (non prédictives) pour tous sauf pNoSales.
const granular = ['P_ok', 'P_type', 'P_config', 'P_cat', 'P_time', 'P_att'].map(
  (eventId) => ({ eventId, isPredictive: false }),
)

const stripInclusion = (arr) => arr.map(({ inclusionReason, ...rest }) => rest)
const gateOf = (excluded, id) => excluded.find((e) => e.event.id === id)

describe('findAndScorePastEventsWithTrace — équivalence déterministe', () => {
  const trace = findAndScorePastEventsWithTrace(target, allEvents, granular)
  const production = findAndScorePastEvents(target, allEvents, granular)

  it('`included` (sans inclusionReason) == sortie production (scores + ordre identiques)', () => {
    // criterion #3 / #9 : le mode debug n'altère PAS le résultat de l'algo.
    expect(stripInclusion(trace.included)).toEqual(production)
  })

  it('un seul comparable retenu (P_ok)', () => {
    expect(production.map((r) => r.event.id)).toEqual(['P_ok'])
    expect(trace.included.map((r) => r.event.id)).toEqual(['P_ok'])
    expect(trace.included[0].inclusionReason).toBeTruthy()
  })

  it('chaque gate écarte le bon event avec le bon `gate`', () => {
    expect(gateOf(trace.excluded, 'T').gate).toBe('self')
    expect(gateOf(trace.excluded, 'P_type').gate).toBe('eventType')
    expect(gateOf(trace.excluded, 'P_config').gate).toBe('configuration')
    expect(gateOf(trace.excluded, 'P_cat').gate).toBe('category')
    expect(gateOf(trace.excluded, 'P_time').gate).toBe('showTime')
    expect(gateOf(trace.excluded, 'P_att').gate).toBe('attendance')
    expect(gateOf(trace.excluded, 'P_nosales').gate).toBe('salesData')
  })

  it('valeurs comparées exposées sur les gates', () => {
    const type = gateOf(trace.excluded, 'P_type')
    expect(type.targetValue).toBe('sport')
    expect(type.pastValue).toBe('concert')

    const time = gateOf(trace.excluded, 'P_time')
    expect(time.targetValue).toBe('19:00')
    expect(time.pastValue).toBe('23:30')

    const att = gateOf(trace.excluded, 'P_att')
    expect(att.targetValue).toBe(1000)
    expect(att.pastValue).toBe(2000)
  })

  it('diagnostics dataset cohérents', () => {
    expect(trace.diagnostics).toMatchObject({
      totalEvents: 8,
      validPastEvents: 1,
      eventsWithSalesData: 6,
      granularRecords: 6,
      eventIdOverlap: 6,
    })
  })
})

describe('calculateSimilarity — comportement production inchangé (délégué)', () => {
  it('gate dur → toujours null (aucun changement de sortie)', () => {
    expect(calculateSimilarity(target, pType)).toBeNull()
    expect(calculateSimilarity(target, pConfig)).toBeNull()
    expect(calculateSimilarity(target, pCat)).toBeNull()
    expect(calculateSimilarity(target, pTime)).toBeNull()
    expect(calculateSimilarity(target, pAtt)).toBeNull()
  })

  it('comparable valide → objet scoré avec breakdown', () => {
    const r = calculateSimilarity(target, pOk)
    expect(r).not.toBeNull()
    expect(r.event.id).toBe('P_ok')
    expect(r.score).toBeGreaterThan(0)
    expect(r.breakdown.eventType).toBe(100)
    expect(r.breakdown.configuration).toBe(100)
    expect(r.breakdown.category).toBe(100)
  })
})
