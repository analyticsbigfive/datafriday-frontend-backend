import { computeUnmappedVolume } from '@/utils/unmappedVolume'

describe('computeUnmappedVolume', () => {
  it('somme les records dont le produit ou le PdV est non mappé', () => {
    const v = computeUnmappedVolume([
      { mapStatus: 'mapped', shopStatus: 'mapped', totalQuantity: 5, totalRevenue: 50 },
      { mapStatus: 'unmapped', shopStatus: 'mapped', totalQuantity: 2, totalRevenue: 10 },
      { mapStatus: 'mapped', shopStatus: 'unmapped', quantity: 3, revenue: 7.5 },
      { mapStatus: 'noitem', shopStatus: 'mapped', totalQuantity: 9, totalRevenue: 90 },
    ])
    expect(v).toEqual({ units: 5, revenueHt: 17.5, known: true })
  })

  it('known = false sans record, zéros sinon', () => {
    expect(computeUnmappedVolume([])).toEqual({ units: 0, revenueHt: 0, known: false })
    expect(computeUnmappedVolume(null).known).toBe(false)
    expect(computeUnmappedVolume([{ mapStatus: 'mapped', shopStatus: 'mapped' }])).toEqual({ units: 0, revenueHt: 0, known: true })
  })

  it('repli sur revenueHt (lignes summary)', () => {
    expect(computeUnmappedVolume([{ mapStatus: 'unmapped', quantity: 1, revenueHt: 4 }]).revenueHt).toBe(4)
  })
})
