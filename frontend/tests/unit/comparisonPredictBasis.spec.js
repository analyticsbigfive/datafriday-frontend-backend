import { applyQuantityAdjustments, versionForBasis, normalizePredictBasis } from '@/utils/comparisonPredictBasis'

const version = {
  quantityAdjustments: { 's1-m1': 150, 's1-m2': 100, 's2-m3': 50 },
  predictedRecords: [
    { shopId: 's1', menuItemId: 'm1', totalQuantity: 10, totalRevenue: 100 },
    { shopId: 's1', menuItemId: 'm2', totalQuantity: 4, totalRevenue: 40 },
    { shopId: 's2', menuItemId: 'm3', totalQuantity: 8, totalRevenue: 80, isManual: true },
    { shopId: 's3', menuItemId: 'm4', totalQuantity: 2, totalRevenue: 20 },
  ],
}

describe('applyQuantityAdjustments', () => {
  const out = applyQuantityAdjustments(version)
  it('met à l\'échelle quantité et CA par le % du couple PdV x article', () => {
    expect(out.predictedRecords[0]).toMatchObject({ totalQuantity: 15, totalRevenue: 150 })
  })
  it('laisse intactes les lignes à 100 % ou sans ajustement', () => {
    expect(out.predictedRecords[1]).toBe(version.predictedRecords[1])
    expect(out.predictedRecords[3]).toBe(version.predictedRecords[3])
  })
  it('ne réapplique jamais le % aux lignes manuelles', () => {
    expect(out.predictedRecords[2]).toBe(version.predictedRecords[2])
  })
  it('ne mute pas la version d\'origine', () => {
    expect(version.predictedRecords[0].totalQuantity).toBe(10)
  })
  it('sans ajustement, renvoie la version telle quelle', () => {
    const v = { predictedRecords: version.predictedRecords }
    expect(applyQuantityAdjustments(v)).toBe(v)
    expect(applyQuantityAdjustments(null)).toBeNull()
  })
})

describe('versionForBasis', () => {
  it('algo : version brute', () => {
    expect(versionForBasis(version, 'algo')).toBe(version)
  })
  it('adjusted et valeur inconnue : version ajustée', () => {
    expect(versionForBasis(version, 'adjusted').predictedRecords[0].totalQuantity).toBe(15)
    expect(versionForBasis(version, 'zzz').predictedRecords[0].totalQuantity).toBe(15)
  })
  it('normalizePredictBasis', () => {
    expect(normalizePredictBasis('algo')).toBe('algo')
    expect(normalizePredictBasis(undefined)).toBe('adjusted')
  })
})
