import { ref } from 'vue'
import { findEventsMissingSalesDetail } from '@/utils/analyseAggregationGap'
import { useAggregationGap } from '@/composables/useAggregationGap'

// Incident Jean Bouin 2026-10-01 : 580 k€ dans la bande KPI (rollup Event.revenue), mais aucun
// détail de vente pour les matchs PFC (agrégats vidés par une resynchronisation interrompue).
const PFC_LYON = { id: 'pfc-lyon', name: 'PFC-Lyon', eventDate: '2026-09-12', revenue: 54335 }
const SFP_LYON = { id: 'sfp-lyon', name: 'SFP-Lyon', eventDate: '2026-09-26', revenue: 87538 }
const NO_SALES = { id: 'no-sales', name: 'Match sans vente', eventDate: '2026-09-20', revenue: 0 }

describe('findEventsMissingSalesDetail', () => {
  it('signale un event au CA enregistré dont le détail chargé est vide', () => {
    const gap = findEventsMissingSalesDetail({
      events: [PFC_LYON, SFP_LYON],
      itemRecords: [{ eventId: 'sfp-lyon', revenue: 10 }],
      loadedEventIds: new Set(['pfc-lyon', 'sfp-lyon']),
    })
    expect(gap.map((e) => e.id)).toEqual(['pfc-lyon'])
  })

  it("n'accuse pas un event dont le détail n'est pas encore chargé (cap, en vol)", () => {
    const gap = findEventsMissingSalesDetail({
      events: [PFC_LYON],
      itemRecords: [],
      loadedEventIds: new Set(),
    })
    expect(gap).toEqual([])
  })

  it('ignore un event sans CA enregistré (rien de manquant)', () => {
    const gap = findEventsMissingSalesDetail({
      events: [NO_SALES, { ...PFC_LYON, revenue: null }],
      itemRecords: [],
      loadedEventIds: new Set(['no-sales', 'pfc-lyon']),
    })
    expect(gap).toEqual([])
  })
})

describe('useAggregationGap', () => {
  const base = () => ({
    events: ref([PFC_LYON]),
    itemRecords: ref([]),
    loadedEventIds: ref(new Set(['pfc-lyon'])),
    sourceState: ref('empty'),
    fetchError: ref(null),
    isPredict: ref(false),
  })

  it('publie les events concernés quand la source est terminale', () => {
    const { gapEvents } = useAggregationGap(base())
    expect(gapEvents.value.map((e) => e.id)).toEqual(['pfc-lyon'])
  })

  it('silencieux pendant le chargement (zéro valeur provisoire)', () => {
    const { gapEvents } = useAggregationGap({ ...base(), sourceState: ref('loading') })
    expect(gapEvents.value).toEqual([])
  })

  it("silencieux si le chargement du détail a échoué (un batch KO n'est pas un agrégat manquant)", () => {
    const { gapEvents } = useAggregationGap({ ...base(), fetchError: ref('Network Error') })
    expect(gapEvents.value).toEqual([])
  })

  it('inactif en mode Predict', () => {
    const { gapEvents } = useAggregationGap({ ...base(), isPredict: ref(true) })
    expect(gapEvents.value).toEqual([])
  })
})
