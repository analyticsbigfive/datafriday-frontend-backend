import { computeRevenuePerHeadcount, sumRevenueByEvent, eventHeadcount } from '@/utils/revenuePerHeadcount'
import {
  hasShopScopeFilter,
  resolveShopNames,
  resolveIdsByName,
  buildStockParams,
} from '@/utils/stockValuationFilters'
import { buildDimensionIndex, NOT_SET_KEY } from '@/utils/articleDimensionBreakdown'

const events = [
  { id: 'e1', numberOfTpe: 10, numberOfCollaborators: 20 },
  { id: 'e2', numberOfTpe: 20, numberOfCollaborators: null },
  { id: 'e3', numberOfTpe: null, numberOfCollaborators: 5 },
]
const revenue = new Map([['e1', 1000], ['e2', 3000], ['e3', 700]])

describe('revenuePerHeadcount', () => {
  it('exclut du numerateur ET du denominateur les events sans effectif', () => {
    const r = computeRevenuePerHeadcount({ events, revenueByEventId: revenue, kind: 'tpe', shopScopeFiltered: false })
    // (1000 + 3000) / (10 + 20), e3 ignore
    expect(r.value).toBeCloseTo(4000 / 30)
    expect(r.filledCount).toBe(2)
    expect(r.totalCount).toBe(3)
    expect(r.headcount).toBe(30)
    expect(r.rows.find((x) => x.eventId === 'e3')).toEqual({ eventId: 'e3', value: null, reason: 'no-tpe' })
  })

  it('collaborateurs : meme regle avec son propre champ', () => {
    const r = computeRevenuePerHeadcount({ events, revenueByEventId: revenue, kind: 'collaborator', shopScopeFiltered: false })
    expect(r.value).toBeCloseTo((1000 + 700) / 25)
    expect(r.rows.find((x) => x.eventId === 'e2').reason).toBe('no-collaborators')
  })

  it('filtre PdV / type / zone : bloque (pas de valeur ni de lignes)', () => {
    const r = computeRevenuePerHeadcount({ events, revenueByEventId: revenue, kind: 'tpe', shopScopeFiltered: true })
    expect(r).toMatchObject({ blocked: true, value: null, rows: [], filledCount: 2, totalCount: 3 })
  })

  it('aucun event renseigne : pas de valeur, jamais 0', () => {
    const r = computeRevenuePerHeadcount({ events: [{ id: 'x' }], revenueByEventId: revenue, kind: 'tpe', shopScopeFiltered: false })
    expect(r.value).toBeNull()
    expect(eventHeadcount({ numberOfTpe: 0 }, 'tpe')).toBeNull()
  })

  it('somme le CA par event depuis les records', () => {
    const m = sumRevenueByEvent([{ eventId: 'a', revenue: 5 }, { eventId: 'a', revenue: 2 }, { eventId: 'b', revenue: 1 }, {}])
    expect(m.get('a')).toBe(7)
    expect(m.get('b')).toBe(1)
  })
})

describe('stockValuationFilters', () => {
  const floorElements = [
    { id: 'el1', name: 'Bar Nord', shopType: ['beverages'], floorName: 'Niveau 1' },
    { id: 'el2', name: 'Snack Tribune', shopType: ['food', 'beverages'], floorName: 'Niveau 2' },
    { id: 'el3', name: 'Buvette Parvis', shopType: 'beer', floorName: 'Parvis' },
  ]

  it('envoie des noms : noms seuls tels quels, type et zone croises avec la config', () => {
    expect(hasShopScopeFilter({})).toBe(false)
    expect(resolveShopNames({}, floorElements)).toEqual({ active: false, names: [], unresolved: false })
    // Noms seuls : pas besoin de la config, ils partent tels quels.
    expect(resolveShopNames({ selectedShopIds: ['bar nord'] }, [])).toEqual({ active: true, names: ['bar nord'], unresolved: false })
    expect(resolveShopNames({ selectedShopTypes: ['beverages'] }, floorElements).names).toEqual(['Bar Nord', 'Snack Tribune'])
    expect(resolveShopNames({ selectedShopTypes: ['beverages'], selectedShopAreas: ['Niveau 2'] }, floorElements).names).toEqual(['Snack Tribune'])
    expect(resolveShopNames({ selectedShopIds: ['snack tribune'], selectedShopTypes: ['beverages'] }, floorElements).names).toEqual(['Snack Tribune'])
  })

  it('type ou zone sans correspondance dans la config : non resolu (pas un stock global)', () => {
    expect(resolveShopNames({ selectedShopTypes: ['drinkee'] }, floorElements)).toEqual({ active: true, names: [], unresolved: true })
  })

  it('industriel / fournisseur : noms vers ids via l index, texte libre non resoluble', () => {
    const index = buildDimensionIndex([
      { menuItemId: 'a', industrialShares: [{ industrialId: 'i1', name: 'Bridor', share: 1 }], supplierCosts: [{ supplierId: 's1', name: 'Metro', unitCost: 1 }, { supplierId: null, name: 'Libre', unitCost: 1 }] },
    ])
    expect(resolveIdsByName(index, ['Bridor'], 'industrial')).toEqual({ active: true, ids: ['i1'], unresolved: false })
    expect(resolveIdsByName(index, ['Libre'], 'supplier').unresolved).toBe(true)
    expect(resolveIdsByName(index, [NOT_SET_KEY], 'supplier').unresolved).toBe(true)
    expect(resolveIdsByName(index, [], 'supplier').active).toBe(false)
  })

  it('buildStockParams liste les filtres non appliques au stock', () => {
    const out = buildStockParams(
      { selectedBrands: ['X'], selectedMenuItemTypes: ['Food'], selectedShopIds: ['Bar Nord'] },
      floorElements,
      null,
    )
    expect(out.params.shopNames).toEqual(['Bar Nord'])
    expect(out.unresolved).toEqual([])
    expect(out.ignoredKeys).toEqual(['selectedBrands', 'selectedMenuItemTypes'])
  })
})
