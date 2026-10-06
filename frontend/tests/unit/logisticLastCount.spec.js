import { lastCountMatchesStock } from '@/utils/logisticLastCount'

describe('lastCountMatchesStock (ligne « Dernier comptage physique » de la carte Logistic)', () => {
  it('identique au stock juste après « Mettre à jour la Logistique » : masquée', () => {
    // Coca-Cola Cherry, Nantes-Montpellier F : 0 pack, 12 en vrac compté = stock.
    expect(lastCountMatchesStock({ packedUnits: 0, looseUnits: 12 }, { packed: 0, loose: 12 }, 24)).toBe(true)
  })

  it('même total réparti autrement (36 en vrac = 1 pack de 24 + 12) : identique', () => {
    expect(lastCountMatchesStock({ packedUnits: 0, looseUnits: 36 }, { packed: 1, loose: 12 }, 24)).toBe(true)
  })

  it('écart (stock pas mis à jour, ou mouvement depuis le comptage) : affichée', () => {
    expect(lastCountMatchesStock({ packedUnits: 0, looseUnits: 12 }, { packed: 2, loose: 0 }, 24)).toBe(false)
  })

  it('taille de paquet inconnue : comparaison champ par champ seulement', () => {
    expect(lastCountMatchesStock({ packedUnits: 0, looseUnits: 36 }, { packed: 1, loose: 12 }, null)).toBe(false)
    expect(lastCountMatchesStock({ packedUnits: 2, looseUnits: 0.5 }, { packed: 2, loose: 0.5 }, null)).toBe(true)
  })

  it('sans comptage ou sans stock : jamais « identique »', () => {
    expect(lastCountMatchesStock(null, { packed: 0, loose: 0 }, 24)).toBe(false)
    expect(lastCountMatchesStock({ packedUnits: 0, looseUnits: 0 }, null, 24)).toBe(false)
  })
})
