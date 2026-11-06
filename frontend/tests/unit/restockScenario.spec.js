import { computeRestockScenario } from '@/utils/restockScenario'

// ---------- Fixtures ----------
const AFF = 'aff|||L'
const shopRow = (shopId, target, remaining, over = {}) => ({
  shopId, shopName: shopId, itemKey: AFF, unit: 'L', targetQuantity: target, remainingQuantity: remaining, ...over,
})
const settingsRow = (over = {}) => ({ itemKey: AFF, itemId: 'aff', itemName: 'Affligem', unit: 'L', marketPriceId: 'mp-aff', ...over })
const reserveRow = (over = {}) => ({
  key: 'storage:oceanne:aff', elementId: 'oceanne', name: 'Affligem', unit: 'L', menuItemId: null,
  marketPriceId: 'mp-aff', buffer: 3000, remaining: 13, percent: 100, required: 2987, ...over,
})
const groups = (rows) => [{ elementId: 'oceanne', elementName: 'Oceanne', rows }]

function scenario(over = {}) {
  return computeRestockScenario({
    liveRestockRowsAll: [],
    stockExcluded: {},
    liveStockSettingsRows: [settingsRow()],
    storageRestockGroups: [],
    shoppingMode: 'finished',
    shoppingGenerated: false,
    hasLoadedPlan: false,
    shopPackSizeFor: () => 30,
    storagePackSizeFor: () => 30,
    ingredientPackSizeFor: () => 30,
    ...over,
  })
}

const affligemRows = () => [shopRow('HK', 28.4, 240), shopRow('Loire14', 75.2, 6), shopRow('Oceane11', 25.7, 0)]

const stock = (name, qty, extra = {}) => ({ itemId: null, sourceId: null, marketPriceId: `mp-${name}`, name, unit: 'kg', qty, ...extra })

// ---------- Cas figés ----------
describe('computeRestockScenario, cas figés', () => {
  it('(a) Affligem fût 30 L produits finis : PDV 0, HK cède 4 colis, réserve 100 colis', () => {
    const s = scenario({
      liveRestockRowsAll: affligemRows(),
      storageRestockGroups: groups([reserveRow()]),
    })
    expect(s.orderByItem[AFF]).toBe(0)
    expect(s.flowByShopRow['HK|||' + AFF].ceded).toBe(120)
    expect(s.flowByShopRow['Loire14|||' + AFF].received).toBe(90)
    expect(s.flowByShopRow['Oceane11|||' + AFF].received).toBe(30)
    expect(s.transfersByItem[AFF].reduce((n, t) => n + t.packs, 0)).toBe(4)
    expect(s.storageGroups[0].rows[0].required).toBe(2987)
    expect(s.storageFlowByKey['storage:oceanne:aff'].purchase / 30).toBe(100)
    // Hors mode ingrédients, les réserves du réassort sont celles du circuit article.
    expect(s.refillStorageGroups).toEqual(s.storageGroups)
    expect(s.ingredientCircuit).toBeNull()
    // Étape 3 : même achat que l'étape 1.
    const net = s.netShoppingItem({ itemKey: AFF, quantity: 69.2 + 25.7 })
    expect(net.buyQuantity).toBe(0)
    expect(net.storageOnHand).toBeCloseTo(94.9, 6)
  })

  it('(b) même cas en mode ingrédients généré : achat 0, 100 colis pour la réserve', () => {
    const item = { itemKey: 'Affligem|||L', itemName: 'Affligem', unit: 'L', quantity: 129.3, marketPriceId: 'mp-Affligem' }
    const s = scenario({
      liveRestockRowsAll: affligemRows(),
      storageRestockGroups: groups([reserveRow({ marketPriceId: 'mp-Affligem' })]),
      liveStockSettingsRows: [settingsRow({ marketPriceId: 'mp-Affligem' })],
      shoppingMode: 'ingredients',
      shoppingGenerated: true,
      ingredientInputs: () => ({
        items: [item],
        shopEntries: [stock('Affligem', 246, { unit: 'L' })],
        storageEntries: [stock('Affligem', 13, { unit: 'L' })],
      }),
    })
    expect(s.ingredientCircuitActive).toBe(true)
    const net = s.netShoppingItem(item)
    expect(net.buyQuantity).toBe(0)
    expect(net.shopOnHand).toBe(246)
    const line = s.refillStorageGroups[0].rows[0]
    expect(line.required).toBe(2987)
    expect(s.ingredientCircuit.storageFlowByKey['storage:oceanne:aff'].purchase / 30).toBe(100)
  })

  describe('sucre en mode ingrédients (tampon 600, restant 500, besoin 400, colis 100)', () => {
    const item = { itemKey: 'Sucre|||kg', itemName: 'Sucre', unit: 'kg', quantity: 400, marketPriceId: 'mp-Sucre' }
    const sugarRow = { key: 'storage:e1:sucre', elementId: 'e1', name: 'Sucre', unit: 'kg', marketPriceId: 'mp-Sucre', buffer: 600, remaining: 500, percent: 100 }
    const build = (over = {}) =>
      scenario({
        liveStockSettingsRows: [],
        storageRestockGroups: groups([sugarRow]),
        shoppingMode: 'ingredients',
        shoppingGenerated: true,
        shopPackSizeFor: () => 100,
        storagePackSizeFor: () => 100,
        ingredientPackSizeFor: () => 100,
        ingredientInputs: { items: [item], shopEntries: [], storageEntries: [stock('Sucre', 500)] },
        ...over,
      })

    it('(c) achat 0, prélevé 400, remplissage 500, réserve finale 600', () => {
      const s = build()
      expect(s.netShoppingItem(item).buyQuantity).toBe(0)
      const flow = s.ingredientCircuit.storageFlowByKey['storage:e1:sucre']
      expect(flow.drawn).toBe(400)
      expect(flow.purchase).toBe(500)
      expect(500 - flow.drawn + flow.purchase).toBe(600)
      expect(s.refillStorageGroups[0].rows[0].required).toBe(500)
    })

    it('(e) plan chargé : le circuit ingrédient ne pilote pas les réserves', () => {
      const s = build({ hasLoadedPlan: true })
      expect(s.ingredientCircuitActive).toBe(false)
      expect(s.refillStorageGroups).toEqual(s.storageGroups)
      // Circuit article : aucun prélèvement, la réserve se remplit de 600 - 500.
      expect(s.refillStorageGroups[0].rows[0].required).toBe(100)
    })

    it('(e) feuille non générée : le circuit ingrédient ne pilote pas les réserves', () => {
      const s = build({ shoppingGenerated: false })
      expect(s.ingredientCircuitActive).toBe(false)
      expect(s.refillStorageGroups).toEqual(s.storageGroups)
      expect(s.refillStorageGroups[0].rows[0].required).toBe(100)
      // Le netting de la feuille reste celui du circuit ingrédient.
      expect(s.netShoppingItem(item).buyQuantity).toBe(0)
    })
  })

  it('(d) article décoché : absent d orderByItem, ne cède ni ne reçoit', () => {
    const other = (id, t, r) => shopRow(id, t, r, { itemKey: 'biere|||L' })
    const s = scenario({
      liveRestockRowsAll: [...affligemRows(), other('HK', 10, 0), other('Loire14', 10, 0)],
      stockExcluded: { [AFF]: true },
    })
    expect(Object.keys(s.orderByItem)).toEqual(['biere|||L'])
    expect(s.orderByItem[AFF]).toBeUndefined()
    expect(s.transfersByItem[AFF]).toBeUndefined()
    expect(s.flowByShopRow['HK|||' + AFF]).toBeUndefined()
    expect(s.flowByShopRow['Loire14|||' + AFF]).toBeUndefined()
    expect(s.flowByShopRow['HK|||biere|||L']).toBeDefined()
  })

  it('(f) aucun surplus : total acheté égal à l ancien calcul par PDV', () => {
    const rows = [shopRow('A', 70, 10), shopRow('B', 31, 0), shopRow('C', 12, 12)]
    const s = scenario({ liveRestockRowsAll: rows })
    const legacy = rows.reduce((sum, r) => {
      const gap = Math.max(0, r.targetQuantity - r.remainingQuantity)
      return sum + (gap > 0 ? Math.ceil(gap / 30 - 1e-9) * 30 : 0)
    }, 0)
    expect(legacy).toBe(120)
    expect(s.orderByItem[AFF]).toBe(legacy)
    expect(s.transfersByItem[AFF]).toEqual([])
  })
})

// ---------- Invariants sur cas aléatoires déterministes ----------
// Générateur à graine fixe (mulberry32), écrit à la main, sans dépendance.
function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PACKS = [1, 6, 10, 20, 30, null]
const EPS = 1e-6

function randomCase(rng) {
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1))
  const dec = (lo, hi) => Math.round((lo + rng() * (hi - lo)) * 10) / 10
  const itemCount = int(1, 2)
  const items = []
  const rows = []
  const reserves = []
  for (let i = 0; i < itemCount; i += 1) {
    const itemKey = `art${i}|||L`
    const pack = PACKS[int(0, PACKS.length - 1)]
    items.push({ itemKey, pack })
    const shops = int(1, 5)
    for (let s = 0; s < shops; s += 1) {
      const surplusy = rng() < 0.4
      rows.push(shopRow(`S${i}_${s}`, dec(0, 100), surplusy ? dec(60, 300) : dec(0, 60), { itemKey }))
    }
    const reserveCount = int(0, 2)
    for (let r = 0; r < reserveCount; r += 1) {
      reserves.push(reserveRow({
        key: `storage:e${r}:${itemKey}`, elementId: `e${r}`, name: `Reserve ${i}`, marketPriceId: `mp-${i}`,
        buffer: dec(0, 400), remaining: dec(0, 300), percent: [100, 100, 50, 75][int(0, 3)],
      }))
    }
  }
  const settings = items.map((it, i) => settingsRow({ itemKey: it.itemKey, marketPriceId: `mp-${i}`, itemName: `Art ${i}` }))
  const packOf = Object.fromEntries(items.map((it) => [it.itemKey, it.pack]))
  const mpPack = Object.fromEntries(items.map((it, i) => [`mp-${i}`, it.pack]))
  return { rows, reserves, settings, packOf, mpPack }
}

function run(c, over = {}) {
  return computeRestockScenario({
    liveRestockRowsAll: c.rows,
    stockExcluded: {},
    liveStockSettingsRows: c.settings,
    storageRestockGroups: groups(c.reserves),
    shoppingMode: 'finished',
    shopPackSizeFor: (row) => c.packOf[row.itemKey],
    storagePackSizeFor: (row) => c.mpPack[row.marketPriceId] ?? null,
    ...over,
  })
}

const plain = (s) => JSON.parse(JSON.stringify({ ...s, netShoppingItem: undefined }))

describe('computeRestockScenario, invariants (200 cas à graine fixe)', () => {
  const rng = makeRng(20261106)
  const cases = Array.from({ length: 200 }, () => randomCase(rng))

  it('les cas aléatoires exercent bien transferts, prélèvements et achats', () => {
    let transfers = 0
    let draws = 0
    let purchases = 0
    for (const c of cases) {
      const s = run(c)
      Object.values(s.transfersByItem).forEach((t) => { transfers += t.length })
      Object.values(s.storageFlowByKey).forEach((f) => { if (f.drawn > 0) draws += 1 })
      Object.values(s.orderByItem).forEach((q) => { if (q > 0) purchases += 1 })
    }
    expect(transfers).toBeGreaterThan(20)
    expect(draws).toBeGreaterThan(20)
    expect(purchases).toBeGreaterThan(20)
  })

  it('(i) étape 1 égale étape 3 en produits finis, par article', () => {
    for (const c of cases) {
      const s = run(c)
      for (const it of c.settings) {
        const gross = c.rows.filter((r) => r.itemKey === it.itemKey).reduce((n, r) => n + Math.max(0, r.targetQuantity - r.remainingQuantity), 0)
        const net = s.netShoppingItem({ itemKey: it.itemKey, quantity: gross })
        expect(net.buyQuantity).toBe(s.orderByItem[it.itemKey])
        expect(net.storageOnHand).toBeCloseTo(Math.max(0, gross - net.buyQuantity), 9)
      }
    }
  })

  it('(ii) aucune quantité négative nulle part', () => {
    const walk = (value, path) => {
      if (typeof value === 'number') expect({ path, value: value >= 0 }).toEqual({ path, value: true })
      else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`))
      else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, `${path}.${k}`))
    }
    for (const c of cases) {
      const s = run(c)
      walk(s.orderByItem, 'orderByItem')
      walk(s.flowByShopRow, 'flowByShopRow')
      walk(s.transfersByItem, 'transfersByItem')
      walk(s.storageFlowByKey, 'storageFlowByKey')
    }
  })

  // Conservation. Tolérance documentée : les transferts et prélèvements se font en
  // colis entiers, donc un PDV peut recevoir plus que son manque (arrondi au supérieur).
  // On vérifie : Σ reçu = Σ cédé (exact), Σ prélevé aux PDV = Σ prélevé en réserve (exact),
  // et l'achat couvre le résiduel avec un excès strictement inférieur à un colis.
  it('(iii) conservation aux colis près', () => {
    for (const c of cases) {
      const s = run(c)
      for (const it of c.settings) {
        const rows = c.rows.filter((r) => r.itemKey === it.itemKey)
        const flows = rows.map((r) => ({ r, f: s.flowByShopRow[`${r.shopId}|||${r.itemKey}`] }))
        const sum = (fn) => flows.reduce((n, x) => n + fn(x), 0)
        expect(sum((x) => x.f.received)).toBeCloseTo(sum((x) => x.f.ceded), 6)
        const drawn = c.reserves
          .filter((r) => r.marketPriceId === it.marketPriceId)
          .reduce((n, r) => n + (s.storageFlowByKey[r.key]?.drawn || 0), 0)
        expect(sum((x) => x.f.fromStorage)).toBeCloseTo(drawn, 6)
        const pack = c.packOf[it.itemKey]
        for (const { r, f } of flows) {
          const gap = Math.max(0, r.targetQuantity - r.remainingQuantity)
          const residual = Math.max(0, gap - f.received - f.fromStorage)
          expect(f.purchase).toBeGreaterThanOrEqual(residual - EPS)
          if (residual <= EPS) expect(f.purchase).toBe(0)
          // Hors colis connu, l'achat suit ceilForUnit (arrondi à l'unité) : tolérance 1.
          else expect(f.purchase - residual).toBeLessThan((pack || 1) + EPS)
        }
        expect(s.orderByItem[it.itemKey]).toBeCloseTo(sum((x) => x.f.purchase), 6)
      }
    }
  })

  it('(iv) chaque PDV est couvert', () => {
    for (const c of cases) {
      const s = run(c)
      for (const r of c.rows) {
        const f = s.flowByShopRow[`${r.shopId}|||${r.itemKey}`]
        expect(r.remainingQuantity + f.received + f.fromStorage + f.purchase - f.ceded).toBeGreaterThanOrEqual(r.targetQuantity - EPS)
      }
    }
  })

  it('(v) un PDV cédant ne descend jamais sous sa cible', () => {
    for (const c of cases) {
      const s = run(c)
      for (const r of c.rows) {
        const f = s.flowByShopRow[`${r.shopId}|||${r.itemKey}`]
        if (f.ceded > 0) expect(r.remainingQuantity - f.ceded).toBeGreaterThanOrEqual(r.targetQuantity - EPS)
      }
    }
  })

  it('(vi) une réserve n est jamais prélevée au-delà de son restant', () => {
    for (const c of cases) {
      const s = run(c)
      for (const r of c.reserves) {
        expect(s.storageFlowByKey[r.key].drawn).toBeLessThanOrEqual(r.remaining + EPS)
      }
    }
  })

  it('(vii) monotonie : augmenter la cible d un PDV ne baisse jamais l achat de l article', () => {
    const bump = makeRng(77)
    for (const c of cases) {
      const base = run(c)
      const idx = Math.floor(bump() * c.rows.length)
      const target = c.rows[idx]
      const delta = Math.round((1 + bump() * 80) * 10) / 10
      const rows2 = c.rows.map((r, i) => (i === idx ? { ...r, targetQuantity: r.targetQuantity + delta } : r))
      const after = run({ ...c, rows: rows2 })
      const key = target.itemKey
      expect(after.orderByItem[key]).toBeGreaterThanOrEqual(base.orderByItem[key] - EPS)
      const refill = (s) =>
        c.reserves.filter((r) => r.marketPriceId === c.settings.find((x) => x.itemKey === key).marketPriceId)
          .reduce((n, r) => n + s.storageFlowByKey[r.key].purchase, 0)
      expect(after.orderByItem[key] + refill(after)).toBeGreaterThanOrEqual(base.orderByItem[key] + refill(base) - EPS)
    }
  })

  it('(viii) idempotence et aucune mutation des entrées', () => {
    for (const c of cases) {
      const clone = JSON.parse(JSON.stringify(c))
      const first = run(c)
      expect(c).toEqual(clone)
      const second = run(c)
      expect(plain(second)).toEqual(plain(first))
      expect(c).toEqual(clone)
    }
  })
})
