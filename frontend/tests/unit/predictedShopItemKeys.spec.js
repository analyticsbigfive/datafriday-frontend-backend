import { predictedShopItemKeys } from '@/utils/predictedShopItemKeys'

describe('predictedShopItemKeys (Réarmement : quantités manuelles « Sans ventes prévues »)', () => {
  it('couple prévu à au moins une unité sur le total : présent', () => {
    const rows = [1, 2, 3].map(() => ({ shopId: 's', menuItemId: 'rb', totalQuantity: 0.45 }))
    expect(predictedShopItemKeys(rows).has('s|rb')).toBe(true)
  })

  it('couple à 0,3 unité (Redbull 25cl, Buvette 2 Perrier) : absent, la quantité manuelle passe', () => {
    expect(predictedShopItemKeys([{ shopId: 's', menuItemId: 'rb', totalQuantity: 0.3 }]).has('s|rb')).toBe(false)
    expect(predictedShopItemKeys([{ shop: 's', mappedMenuItemId: 'rb', quantity: 0 }]).has('s|rb')).toBe(false)
  })
})
