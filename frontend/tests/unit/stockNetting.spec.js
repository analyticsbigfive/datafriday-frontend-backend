/**
 * Netting stock ↔ feuille de course (Règle métier DataFriday).
 * Couvre : cascade de matching (itemId → sourceId → marketPriceId → nom accents),
 * consommation/marquage des entrées (détection non-rattaché), clamp Math.max(0),
 * et la math complète buy = max(0, besoin − stock shops − stock Storage).
 */
import { itemIdentity, consumeFromPool, preparePool } from '@/utils/stockNetting'
import { collectStorageElements } from '@/utils/stockPlanning'

const entry = (over = {}) => ({
  itemId: null,
  sourceId: null,
  marketPriceId: null,
  name: '',
  unit: '',
  qty: 0,
  ...over,
})

describe('itemIdentity', () => {
  it('normalise les ids en string et retombe sur name/itemName', () => {
    expect(itemIdentity({ itemId: 42, itemName: 'Bun' })).toEqual({
      itemId: '42',
      sourceId: null,
      marketPriceId: null,
      name: 'Bun',
      unit: '',
    })
    expect(itemIdentity({ name: 'Patty', unit: 'kg' }).name).toBe('Patty')
  })
})

describe('consumeFromPool — cascade de matching', () => {
  it('matche par itemId en priorité', () => {
    const pool = preparePool([entry({ itemId: 'i1', name: 'Bun', qty: 10 })])
    const cut = consumeFromPool({ itemId: 'i1', itemName: 'autre' }, pool)
    expect(cut).toBe(10)
    expect(pool[0].matched).toBe(true)
    expect(pool[0].remaining).toBe(0)
  })

  it('matche par sourceId quand itemId absent', () => {
    const pool = preparePool([entry({ sourceId: 's9', name: 'X', qty: 4 })])
    expect(consumeFromPool({ sourceId: 's9' }, pool)).toBe(4)
  })

  it('matche par marketPriceId', () => {
    const pool = preparePool([entry({ marketPriceId: 'mp3', qty: 7 })])
    expect(consumeFromPool({ marketPriceId: 'mp3' }, pool)).toBe(7)
  })

  it("matche en croisant les id-space (besoin.sourceId === entrée.itemId)", () => {
    // Cas ingrédient : le besoin porte sourceId=X, l'entrée Storage a pour clé
    // de comptage itemId=X (sourceId non résolu) → doit matcher par intersection.
    const pool = preparePool([entry({ itemId: 'X', sourceId: null, qty: 8 })])
    expect(consumeFromPool({ sourceId: 'X', itemName: 'Bun' }, pool)).toBe(8)
    expect(pool[0].matched).toBe(true)
  })

  it('matche par nom normalisé (accents/casse ignorés)', () => {
    const pool = preparePool([entry({ name: 'Crème fraîche', qty: 3 })])
    expect(consumeFromPool({ itemName: 'CREME FRAICHE' }, pool)).toBe(3)
    expect(pool[0].matched).toBe(true)
  })

  it("ne matche pas et laisse l'entrée non consommée (stock non rattaché)", () => {
    const pool = preparePool([entry({ itemId: 'zzz', name: 'Inconnu', qty: 5 })])
    expect(consumeFromPool({ itemId: 'i1', itemName: 'Bun' }, pool)).toBe(0)
    expect(pool[0].matched).toBe(false)
    expect(pool.filter((e) => !e.matched && e.qty > 0)).toHaveLength(1)
  })

  it("s'arrête au premier niveau de cascade (pas de double comptage)", () => {
    // itemId matche l'entrée A ; l'entrée B (même nom) ne doit PAS être consommée.
    const pool = preparePool([
      entry({ itemId: 'i1', name: 'Bun', qty: 6 }),
      entry({ itemId: 'other', name: 'Bun', qty: 2 }),
    ])
    const cut = consumeFromPool({ itemId: 'i1', itemName: 'Bun' }, pool)
    expect(cut).toBe(6)
    expect(pool[1].matched).toBe(false)
  })

  it('somme plusieurs entrées matchant au même niveau', () => {
    const pool = preparePool([
      entry({ name: 'Bun', qty: 3 }),
      entry({ name: 'bun', qty: 2 }),
    ])
    expect(consumeFromPool({ itemName: 'Bun' }, pool)).toBe(5)
  })

  it('pool vide ou nul → 0', () => {
    expect(consumeFromPool({ itemId: 'i1' }, [])).toBe(0)
    expect(consumeFromPool({ itemId: 'i1' }, null)).toBe(0)
  })
})

describe('math de netting buy = max(0, besoin − shop − storage)', () => {
  const netBuy = (need, shopPool, storagePool) => {
    const item = { itemId: 'i1', itemName: 'Bun' }
    const shopCut = consumeFromPool(item, shopPool)
    const afterShop = Math.max(0, need - shopCut)
    const storageCut = consumeFromPool(item, storagePool)
    return {
      buy: Math.max(0, afterShop - storageCut),
      shopCut,
      storageCut,
    }
  }

  it('mode ingrédients : shop ET storage réduisent l’achat', () => {
    const shop = preparePool([entry({ itemId: 'i1', qty: 20 })])
    const storage = preparePool([entry({ itemId: 'i1', qty: 30 })])
    // besoin 100 − 20 (shops) − 30 (storage) = 50
    expect(netBuy(100, shop, storage).buy).toBe(50)
  })

  it('mode produits finis : besoin déjà net du shop, storage seul réduit', () => {
    const storage = preparePool([entry({ itemId: 'i1', qty: 30 })])
    // besoin (= Σ restock, déjà net shop) 80 − 30 storage = 50 ; pas de shopPool
    expect(netBuy(80, [], storage).buy).toBe(50)
  })

  it('sur-stock : achat clampé à 0, jamais négatif', () => {
    const storage = preparePool([entry({ itemId: 'i1', qty: 999 })])
    expect(netBuy(40, [], storage).buy).toBe(0)
  })

  it('aucun stock rattaché : achat = besoin brut', () => {
    const storage = preparePool([entry({ itemId: 'autre', qty: 50 })])
    const res = netBuy(40, [], storage)
    expect(res.buy).toBe(40)
    expect(res.storageCut).toBe(0)
  })
})

describe('collectStorageElements', () => {
  it('ne retient que les éléments type=storage sur floors/forecourt/externalMerch', () => {
    const config = {
      data: {
        floors: [
          { elements: [
            { id: 'shop1', type: 'shop' },
            { id: 'stoA', type: 'storage' },
            { id: 'merch1', type: 'merchshop' },
          ] },
        ],
        forecourt: { elements: [{ id: 'stoB', type: 'storage' }] },
        externalMerch: { elements: [{ id: 'k1', type: 'kitchen' }] },
      },
    }
    const ids = collectStorageElements(config).map((e) => e.id)
    expect(ids).toEqual(['stoA', 'stoB'])
  })

  it('config nulle → []', () => {
    expect(collectStorageElements(null)).toEqual([])
  })
})
