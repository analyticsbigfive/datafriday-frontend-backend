import {
  pruneSelection, toggleKey, selectedCardsOf, commonSpaceIds, displayedSpaceIds, distinctProductNames, productsForSpaceClick,
} from '@/components/menu-fb/views/storage/utils/storageSelection'
import { aggregateSpot, findProductRow } from '@/components/menu-fb/views/storage/utils/storageSpots'

const card = (key, name, spaceIds) => ({ key, name, spaceIds })
const A = card('a', 'Cola', ['sp1', 'sp2'])
const B = card('b', 'Eau', ['sp2', 'sp3'])
const C = card('c', 'Jus', ['sp2'])

describe('selection', () => {
  it('toggleKey ajoute puis retire sans muter', () => {
    const base = ['a']
    expect(toggleKey(base, 'b')).toEqual(['a', 'b'])
    expect(toggleKey(base, 'a')).toEqual([])
    expect(base).toEqual(['a'])
  })

  it('pruneSelection retire les cles disparues', () => {
    expect(pruneSelection(['a', 'z'], [A, B])).toEqual(['a'])
  })

  it('selectedCardsOf garde l ordre des cartes', () => {
    expect(selectedCardsOf([A, B, C], ['c', 'a']).map((c) => c.key)).toEqual(['a', 'c'])
  })

  it('commonSpaceIds : intersection', () => {
    expect(commonSpaceIds([A, B])).toEqual(['sp2'])
    expect(commonSpaceIds([A, B, card('d', 'X', ['sp9'])])).toEqual([])
    expect(commonSpaceIds([])).toEqual([])
  })

  it('displayedSpaceIds : intersection seulement pour une carte cochee avec 2 cartes ou plus', () => {
    expect(displayedSpaceIds(A, [A, B])).toEqual(['sp2'])
    expect(displayedSpaceIds(C, [A, B])).toEqual(['sp2'])
    expect(displayedSpaceIds(B, [A])).toEqual(['sp2', 'sp3'])
    expect(displayedSpaceIds(card('z', 'Z', ['sp1', 'sp5']), [A, B])).toEqual(['sp1', 'sp5'])
  })

  it('productsForSpaceClick : tous les cochés ou la carte seule', () => {
    expect(productsForSpaceClick(A, [A, B])).toEqual(['Cola', 'Eau'])
    expect(productsForSpaceClick(C, [A, B])).toEqual(['Jus'])
    expect(productsForSpaceClick(A, [A])).toEqual(['Cola'])
    expect(distinctProductNames([A, card('a2', 'Cola', [])])).toEqual(['Cola'])
  })
})

describe('aggregateSpot', () => {
  const rows = {
    Cola: { name: 'Cola', isStored: true, quantity: 5 },
    Eau: { name: 'Eau', isStored: true, quantity: 5 },
    Jus: { name: 'Jus', isStored: false, quantity: 2 },
  }
  const rowFor = (n) => rows[n] || null

  it('tous stockes, tampon commun', () => {
    expect(aggregateSpot(rowFor, ['Cola', 'Eau'])).toEqual({ stored: true, partial: false, quantity: 5 })
  })
  it('partiel, tampons differents : quantity null', () => {
    const r = aggregateSpot(rowFor, ['Cola', 'Jus'])
    expect(r.stored).toBe(false)
    expect(r.partial).toBe(true)
    expect(r.quantity).toBeNull()
  })
  it('aucun stocke', () => {
    expect(aggregateSpot(rowFor, ['Jus', 'Inconnu']).partial).toBe(false)
    expect(aggregateSpot(rowFor, ['Jus', 'Inconnu']).stored).toBe(false)
  })
  it('valeurs locales appliquees a tous', () => {
    expect(aggregateSpot(rowFor, ['Cola', 'Jus'], { isStored: true, quantity: 3 })).toEqual({ stored: true, partial: false, quantity: 3 })
  })
})

describe('aggregateSpot : tampon en colis', () => {
  const keg = { packedUnits: 20 }
  const pack4 = { packedUnits: 4 }
  const mps = { Biere: keg, Chips: pack4 }
  const packOf = (n) => mps[n] || null
  const rows = {
    Biere: { name: 'Biere', isStored: true, quantity: 240 },
    Chips: { name: 'Chips', isStored: true, quantity: 48 },
  }
  const rowFor = (n) => rows[n] || null

  it('un produit : unités stockées affichées en colis', () => {
    expect(aggregateSpot(rowFor, ['Biere'], {}, packOf).quantity).toBe(12)
  })
  it('plusieurs produits au même nombre de colis : valeur commune', () => {
    expect(aggregateSpot(rowFor, ['Biere', 'Chips'], {}, packOf).quantity).toBe(12)
  })
  it('colis différents : valeurs mixtes (null)', () => {
    const r = { ...rows, Chips: { name: 'Chips', isStored: true, quantity: 40 } }
    expect(aggregateSpot((n) => r[n], ['Biere', 'Chips'], {}, packOf).quantity).toBeNull()
  })
  it('valeur locale déjà en colis', () => {
    expect(aggregateSpot(rowFor, ['Biere'], { quantity: 3 }, packOf).quantity).toBe(3)
  })
})

describe('findProductRow par marketPriceId', () => {
  const by = { c1: [{ name: 'Ancien nom', marketPriceId: 'mp1', isStored: true }, { name: 'Eau', isStored: false }] }
  it('id d abord malgré un nom obsolète', () => {
    expect(findProductRow(by, { name: 'Nouveau nom', marketPriceId: 'mp1' }).name).toBe('Ancien nom')
  })
  it('repli par nom (string ou objet sans id)', () => {
    expect(findProductRow(by, 'eau').name).toBe('Eau')
    expect(findProductRow(by, { name: 'Eau', marketPriceId: 'inconnu' }).name).toBe('Eau')
    expect(findProductRow(by, 'Rien')).toBeNull()
  })
})
