import { configPlanZones } from '@/utils/configPlanZones'

describe('configPlanZones (parvis et zone externe dans le plan de la config)', () => {
  const rdc = { id: 'z-rdc', name: 'RDC', elements: [{ id: 'st-rdc', type: 'storage' }] }
  const parvis = {
    id: 'z-parvis',
    name: 'Parvis',
    elements: [{ id: 'st-parvis', type: 'storage' }, { id: 'merch-parvis', type: 'merchshop' }],
  }
  const ext = { id: 'z-ext', name: 'Merch externe', elements: [{ id: 'merch-ext', type: 'merchshop' }] }

  it('ajoute le parvis et la zone externe après les étages', () => {
    const zones = configPlanZones({ data: { floors: [rdc], forecourt: parvis, externalMerch: ext } })
    expect(zones.map((z) => z.name)).toEqual(['RDC', 'Parvis', 'Merch externe'])
    expect(zones[1].elements.map((e) => e.id)).toEqual(['st-parvis', 'merch-parvis'])
  })

  it('accepte une réponse sans enveloppe `data`', () => {
    expect(configPlanZones({ floors: [rdc], forecourt: parvis }).map((z) => z.id)).toEqual(['z-rdc', 'z-parvis'])
  })

  it('ignore un parvis absent ou vide', () => {
    expect(configPlanZones({ data: { floors: [rdc], forecourt: null, externalMerch: { elements: [] } } })).toEqual([rdc])
  })

  it('réponse vide ou nulle : aucune zone', () => {
    expect(configPlanZones(null)).toEqual([])
    expect(configPlanZones({ data: {} })).toEqual([])
  })
})
