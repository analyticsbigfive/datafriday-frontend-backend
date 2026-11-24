import { predictArrivalAction } from '@/utils/restockPredictArrival'

const listed = new Set(['annecy', 'brest'])

describe('predictArrivalAction', () => {
  it('sans event ou event non listé : ignore', () => {
    expect(predictArrivalAction({ eventId: null, selectedEventIds: ['annecy'], listedIds: listed })).toBe('ignore')
    expect(predictArrivalAction({ eventId: 'grenoble', selectedEventIds: ['annecy'], listedIds: listed })).toBe('ignore')
  })
  it('event déjà seule sélection : keep', () => {
    expect(predictArrivalAction({ eventId: 'annecy', selectedEventIds: ['annecy'], listedIds: listed })).toBe('keep')
  })
  it('autre sélection active : switch', () => {
    expect(predictArrivalAction({ eventId: 'annecy', selectedEventIds: ['brest'], listedIds: listed })).toBe('switch')
    expect(predictArrivalAction({ eventId: 'annecy', selectedEventIds: ['annecy', 'brest'], listedIds: listed })).toBe('switch')
    expect(predictArrivalAction({ eventId: 'annecy', selectedEventIds: [], listedIds: listed })).toBe('switch')
  })
})
