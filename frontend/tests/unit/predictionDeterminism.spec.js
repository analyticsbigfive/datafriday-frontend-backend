// Déterminisme de l'algorithme de prédiction (audit 2026-07-06).
//
// Garantit que, à ENTRÉES IDENTIQUES, la prédiction est identique quel que
// soit l'ORDRE D'ARRIVÉE des events (ordre API non garanti entre sessions).
// Le point sensible : le tri par score seul est stable → les ex æquo
// restaient dans l'ordre d'entrée, et la coupe top-10 pouvait retenir des
// events différents d'un run à l'autre. Le départage canonique est désormais :
//   score desc → date d'event desc → id asc  (compareScoredEvents).

import {
  findAndScorePastEvents,
  generatePredictionsForEvent,
} from '@/utils/predictiveAnalytics'

// Cible : tous les comparables ci-dessous passent TOUS les gates avec le même
// score (mêmes type/config/catégorie, même horaire, même affluence, tous en
// semaine même jour) → ex æquo parfaits, seuls date et id les départagent.
const target = {
  id: 'T',
  eventName: 'Cible',
  eventDate: '10/06/2026', // mercredi
  eventType: 'sport',
  configurationId: 'cfg1',
  category: 'ligue1',
  ticketsSold: 1000,
  sessions: [{ showTime: '19:00' }],
}

const mkPast = (id, eventDate) => ({
  id,
  eventName: `Match ${id}`,
  eventDate,
  eventType: 'sport',
  configurationId: 'cfg1',
  category: 'ligue1',
  ticketsSold: 1000,
  sessions: [{ showTime: '19:00' }],
})

// 12 comparables ex æquo : 6 dates (toutes des mercredis passés, même jour de
// semaine que la cible → même score dayOfWeek), 2 events par date avec des ids
// volontairement « désordonnés » pour prouver le départage id asc.
const WEDNESDAYS = [
  '03/06/2026',
  '27/05/2026',
  '20/05/2026',
  '13/05/2026',
  '06/05/2026',
  '29/04/2026',
]
const pastEvents = []
WEDNESDAYS.forEach((d, i) => {
  pastEvents.push(mkPast(`e-${i}-z`, d))
  pastEvents.push(mkPast(`e-${i}-a`, d))
})

// Ventes réelles par event : quantités/CA distincts par event pour que la
// composition du top-10 change réellement les chiffres prédits (une coupe
// différente ne pourrait PAS passer inaperçue dans l'égalité profonde).
const granular = pastEvents.map((e, i) => ({
  eventId: e.id,
  isPredictive: false,
  shopName: 'Buvette Nord',
  elementName: 'Zone A',
  menuItemId: 'item-biere',
  quantity: 100 + i * 7,
  revenue: 500 + i * 31,
  transactionCount: 10,
}))

// Ordre canonique attendu : date desc, puis id asc au sein d'une même date.
const EXPECTED_ORDER = [
  'e-0-a', 'e-0-z',
  'e-1-a', 'e-1-z',
  'e-2-a', 'e-2-z',
  'e-3-a', 'e-3-z',
  'e-4-a', 'e-4-z',
  'e-5-a', 'e-5-z',
]

// Permutations d'entrée : l'API peut livrer les events dans n'importe quel
// ordre. Rotations + inversion couvrent les cas où les ex æquo arrivent avant
// / après / entrelacés.
const shuffles = [
  (arr) => [...arr],
  (arr) => [...arr].reverse(),
  (arr) => [...arr.slice(5), ...arr.slice(0, 5)],
  (arr) => [...arr].sort((a, b) => String(a.id).localeCompare(String(b.id))).reverse(),
]

describe('déterminisme du scoring — invariance à l’ordre d’entrée', () => {
  it('classement complet identique quel que soit l’ordre des events (ties départagés date desc, id asc)', () => {
    shuffles.forEach((shuffle) => {
      const scored = findAndScorePastEvents(target, shuffle([target, ...pastEvents]), granular)
      expect(scored.map((s) => s.event.id)).toEqual(EXPECTED_ORDER)
    })
  })

  it('tous les comparables sont bien ex æquo (précondition du test)', () => {
    const scored = findAndScorePastEvents(target, [target, ...pastEvents], granular)
    const scores = new Set(scored.map((s) => s.score))
    expect(scores.size).toBe(1)
  })
})

describe('déterminisme de la prédiction — coupe top-10 + agrégation', () => {
  it('generatePredictionsForEvent : sortie strictement identique sur entrées permutées', () => {
    const reference = generatePredictionsForEvent(target, [...pastEvents], granular)
    expect(reference.length).toBeGreaterThan(0)
    shuffles.forEach((shuffle) => {
      const run = generatePredictionsForEvent(target, shuffle(pastEvents), shuffle(granular))
      expect(run).toEqual(reference)
    })
  })

  it('le top-10 retenu (basedOnEventIds) est stable : les 2 events les plus anciens sont toujours coupés', () => {
    const preds = generatePredictionsForEvent(target, [...pastEvents], granular)
    const basedOn = preds[0].basedOnEventIds
    expect(basedOn).toEqual(EXPECTED_ORDER.slice(0, 10))
    expect(basedOn).not.toContain('e-5-a')
    expect(basedOn).not.toContain('e-5-z')
  })

  it('double exécution même entrée → même résultat (référentiellement distinct, structurellement égal)', () => {
    const a = generatePredictionsForEvent(target, pastEvents, granular)
    const b = generatePredictionsForEvent(target, pastEvents, granular)
    expect(b).toEqual(a)
  })
})
