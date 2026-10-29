import { filterStoredItems, mergeStoredItems, rowMatchesItem, rowsForConfig, rowsForConfigs } from '@/utils/storageStoredFilter'
import { buildManualStorageItem } from '@/utils/storageManualItem'

const names = (l) => l.map((i) => i.name)
const items = [{ name: 'Coca' }, { name: 'Bière' }, { name: 'Eau' }]

describe('filterStoredItems', () => {
  it('garde un article coché', () => {
    expect(names(filterStoredItems(items, [{ name: 'Coca', isStored: true }]))).toEqual(['Coca'])
  })
  it('exclut un article décoché même avec quantité', () => {
    expect(filterStoredItems(items, [{ name: 'Coca', isStored: false, quantity: 10 }])).toEqual([])
  })
  it('historique avec quantité, seuil : gardé', () => {
    const rows = [{ name: 'Coca', quantity: 5 }, { name: 'Eau', minStock: 2 }]
    expect(names(filterStoredItems(items, rows))).toEqual(['Coca', 'Eau'])
  })
  it('historique vide : exclu', () => {
    expect(filterStoredItems(items, [{ name: 'Coca', quantity: 0, isStored: null }])).toEqual([])
  })
  it('article sans ligne : exclu', () => {
    expect(names(filterStoredItems(items, [{ name: 'Eau', isStored: true }]))).toEqual(['Eau'])
  })
  it('nom avec casse et espaces différents', () => {
    expect(names(filterStoredItems(items, [{ name: '  bière ', isStored: true }]))).toEqual(['Bière'])
  })
  it('lignes non chargées : pas de filtre', () => {
    expect(filterStoredItems(items, null)).toEqual(items)
    expect(filterStoredItems(items, undefined)).toEqual(items)
  })
  it('lignes chargées mais vides : tout exclu', () => {
    expect(filterStoredItems(items, [])).toEqual([])
  })
})

describe('rowsForConfig / rowsForConfigs', () => {
  const by = { a: [{ name: 'x' }], b: [{ name: 'y' }], '': [{ name: 'z' }] }
  it('config puis repli clé vide', () => {
    expect(rowsForConfig(by, 'a')).toEqual([{ name: 'x' }])
    expect(rowsForConfig(by, 'zz')).toEqual([{ name: 'z' }])
  })
  it('union sur plusieurs configs', () => {
    expect(rowsForConfigs(by, ['a', 'b']).map((r) => r.name)).toEqual(['x', 'y'])
    expect(rowsForConfigs(by, []).map((r) => r.name)).toEqual(['x', 'y', 'z'])
  })
})

describe('mergeStoredItems', () => {
  const mk = (row) => ({ name: row.name, manual: true })
  it('lignes non chargées : items inchangé', () => {
    expect(mergeStoredItems(items, null, mk)).toBe(items)
    expect(mergeStoredItems(items, undefined, mk)).toBe(items)
  })
  it('intersection plus lignes stockées absentes', () => {
    const rows = [{ name: 'Coca', isStored: true }, { name: 'Jus', isStored: true }]
    expect(names(mergeStoredItems(items, rows, mk))).toEqual(['Coca', 'Jus'])
  })
  it('ligne décochée absente des items : non ajoutée', () => {
    expect(mergeStoredItems(items, [{ name: 'Jus', isStored: false, quantity: 4 }], mk)).toEqual([])
  })
  it('ligne déjà dans les items (casse différente) : pas de doublon', () => {
    const out = mergeStoredItems(items, [{ name: ' coca ', isStored: true }], mk)
    expect(out).toEqual([{ name: 'Coca' }])
  })
  it('doublons de lignes dédupliqués, ligne vide ignorée', () => {
    const rows = [{ name: 'Jus', isStored: true }, { name: 'JUS', isStored: true }, { name: '', isStored: true }]
    expect(names(mergeStoredItems([], rows, mk))).toEqual(['Jus'])
  })
  it('stockage sans articles construits', () => {
    expect(mergeStoredItems([], [{ name: 'Jus', quantity: 2 }], mk)).toEqual([{ name: 'Jus', manual: true }])
  })
})

describe('buildManualStorageItem', () => {
  const mps = [{
    id: 'mp1', itemName: 'Jus Orange', image: 'img.png', unit: 'L',
    inventoryPackagingId: 'pk1', inventoryPackaging: 'Carton', packedUnits: 6,
  }]
  it('résout le Market Price (insensible casse/espaces), nom exact du MP', () => {
    const it = buildManualStorageItem({ name: '  jus   orange ' }, mps)
    expect(it).toMatchObject({
      id: 'mp1', name: 'Jus Orange', marketPriceId: 'mp1', picture: 'img.png', unit: 'L',
      inventoryPackagingId: 'pk1', inventoryPackaging: 'Carton', inventoryQuantityPackaged: 6,
      usedIn: [], storageType: null,
    })
  })
  it('sans Market Price : item minimal', () => {
    const it = buildManualStorageItem({ name: ' Truc ', unit: 'kg' }, [])
    expect(it).toMatchObject({ name: 'Truc', marketPriceId: null, unit: 'kg', usedIn: [] })
  })
})

describe('correspondance par marketPriceId', () => {
  const its = [{ id: 'mp1', name: 'Coca-Cola 33cl' }, { id: 'mp2', name: 'Eau' }, { name: 'Sans id' }]
  it('rowMatchesItem : id malgré un nom obsolète', () => {
    expect(rowMatchesItem({ name: 'Coca 33', marketPriceId: 'mp1', isStored: true }, its[0])).toBe(true)
  })
  it('rowMatchesItem : item.marketPriceId accepté, repli sur le nom sans id', () => {
    expect(rowMatchesItem({ name: 'x', marketPriceId: 'a' }, { name: 'y', marketPriceId: 'a' })).toBe(true)
    expect(rowMatchesItem({ name: ' EAU ' }, its[1])).toBe(true)
    expect(rowMatchesItem({ name: 'Autre' }, its[1])).toBe(false)
    expect(rowMatchesItem(null, its[1])).toBe(false)
  })
  it('filterStoredItems : ligne au nom obsolète retrouve l article par id', () => {
    const rows = [{ name: 'Ancien nom', marketPriceId: 'mp1', isStored: true }]
    expect(filterStoredItems(its, rows).map((i) => i.id)).toEqual(['mp1'])
  })
  it('filterStoredItems : repli nom pour une ligne sans id', () => {
    expect(filterStoredItems(its, [{ name: 'eau', isStored: true }]).map((i) => i.id)).toEqual(['mp2'])
  })
  it('mergeStoredItems : pas de doublon manuel quand l id correspond, ajout sinon', () => {
    const mk = (row) => ({ name: row.name, manual: true })
    const rows = [
      { name: 'Ancien nom', marketPriceId: 'mp1', isStored: true },
      { name: 'Hors liste', marketPriceId: 'mp9', isStored: true },
      { name: 'hors liste', marketPriceId: 'mp9', isStored: true },
    ]
    const out = mergeStoredItems(its, rows, mk)
    expect(out.map((i) => i.name)).toEqual(['Coca-Cola 33cl', 'Hors liste'])
  })
  it('buildManualStorageItem : résout le Market Price par id puis par nom', () => {
    const mps = [{ id: 'mp1', itemName: 'Nouveau nom' }, { id: 'mp2', itemName: 'Eau' }]
    expect(buildManualStorageItem({ name: 'Ancien', marketPriceId: 'mp1' }, mps)).toMatchObject({ name: 'Nouveau nom', marketPriceId: 'mp1' })
    expect(buildManualStorageItem({ name: 'eau' }, mps)).toMatchObject({ name: 'Eau', marketPriceId: 'mp2' })
    expect(buildManualStorageItem({ name: 'Inconnu', marketPriceId: 'zz' }, mps)).toMatchObject({ name: 'Inconnu', marketPriceId: 'zz' })
  })
})
