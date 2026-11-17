/**
 * Recherche indexée des références de stock (`findStockReference` et candidats).
 *
 * L'index doit renvoyer EXACTEMENT les mêmes résultats que l'ancien parcours
 * linéaire (`pool.find` / `for...of` avec `matchesId`), identité des objets
 * comprise. Les deux anciennes implémentations sont copiées ci-dessous (code
 * de `stockPlanning.js` avant l'index, commentaires retirés) et servent
 * d'oracle sur des requêtes générées avec un PRNG à graine fixe.
 */
import { computed, reactive, shallowReactive } from 'vue'
import { findStockReference } from '@/utils/stockPlanning'
import { collectReferenceCandidates, normalizeName } from '@/utils/stockReferenceIndex'

// ---------------------------------------------------------------------------
// Oracle : anciennes implémentations, code copié tel quel.
// ---------------------------------------------------------------------------
function oracleNormalizeName(value) {
  return String(value || '').trim().toLowerCase()
}

function oracleFindStockReference(
  item,
  ingredients = [],
  components = [],
  menuItems = [],
  marketPrices = [],
) {
  const idCandidates = new Set(
    [item?.itemId, item?.id, item?.sourceId, item?.marketPriceId].filter(Boolean).map(String),
  )
  const name = oracleNormalizeName(item?.itemName || item?.name)
  const pools = [ingredients || [], components || [], menuItems || [], marketPrices || []]

  const matchesId = (c) =>
    !!c &&
    [c.id, c.sourceId, c.marketPriceId, c.marketPrice?.id].some(
      (v) => v != null && idCandidates.has(String(v)),
    )
  if (idCandidates.size) {
    for (const pool of pools) {
      const hit = pool.find(matchesId)
      if (hit) return hit
    }
  }
  if (!name) return null
  for (const pool of pools) {
    const hit = pool.find((c) => c && oracleNormalizeName(c.name || c.itemName) === name)
    if (hit) return hit
  }
  return null
}

function oracleFindStockReferenceCandidates(
  item,
  ingredients = [],
  components = [],
  menuItems = [],
  marketPrices = [],
) {
  const idCandidates = new Set(
    [item?.itemId, item?.id, item?.sourceId, item?.marketPriceId].filter(Boolean).map(String),
  )
  const name = oracleNormalizeName(item?.itemName || item?.name)
  const pools = [ingredients || [], components || [], menuItems || [], marketPrices || []]
  const matchesId = (c) =>
    !!c &&
    [c.id, c.sourceId, c.marketPriceId, c.marketPrice?.id].some(
      (v) => v != null && idCandidates.has(String(v)),
    )
  const out = []
  if (idCandidates.size) {
    for (const pool of pools) for (const c of pool) if (matchesId(c)) out.push(c)
  }
  if (name) {
    for (const pool of pools) {
      for (const c of pool) {
        if (c && oracleNormalizeName(c.name || c.itemName) === name && !out.includes(c)) out.push(c)
      }
    }
  }
  return out
}

// Candidats via le module (le wrapper de stockPlanning n'est pas exporté, il se
// réduit à la construction de ces quatre pools).
function newCandidates(item, ingredients = [], components = [], menuItems = [], marketPrices = []) {
  return collectReferenceCandidates(item, [
    ingredients || [],
    components || [],
    menuItems || [],
    marketPrices || [],
  ])
}

// ---------------------------------------------------------------------------
// Générateurs déterministes (PRNG à graine fixe, jamais Math.random).
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BASE_NAMES = ['Beurre', 'Beurre doux motte', 'Coca 33cl', 'Farine T55', 'Sucre', 'Lait']

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)]
}

// Identifiants : nombres ou chaînes qui se recoupent après String(), quelques
// valeurs vides (null, undefined, 0, chaîne vide) et des préfixes distincts.
function randomId(rand, range) {
  const r = rand()
  if (r < 0.12) return null
  if (r < 0.2) return undefined
  if (r < 0.23) return 0
  if (r < 0.26) return ''
  const n = Math.floor(rand() * range)
  const form = rand()
  if (form < 0.2) return `u-${n}`
  return form < 0.55 ? n : String(n)
}

// Noms : homonymes avec casse et espaces différents, valeurs vides.
function randomName(rand, range) {
  const r = rand()
  if (r < 0.18) return undefined
  if (r < 0.25) return null
  if (r < 0.3) return ''
  if (r < 0.33) return '   '
  const base = rand() < 0.4 ? pick(rand, BASE_NAMES) : `Article ${Math.floor(rand() * range)}`
  return [base, base.toUpperCase(), `  ${base} `, base.toLowerCase(), `${base}\t`][
    Math.floor(rand() * 5)
  ]
}

function randomElement(rand, shared, idRange, nameRange) {
  const r = rand()
  if (r < 0.04) return null
  if (r < 0.07) return undefined
  if (r < 0.09) return 0
  if (r < 0.1) return ''
  if (r < 0.11) return false
  if (r < 0.12) return rand() < 0.5 ? 42 : 'plain'
  // Même objet présent à plusieurs positions / dans plusieurs catalogues.
  if (r < 0.16 && shared.length) return pick(rand, shared)
  const el = {}
  if (rand() < 0.8) el.id = randomId(rand, idRange)
  if (rand() < 0.4) el.sourceId = randomId(rand, idRange)
  if (rand() < 0.3) el.marketPriceId = randomId(rand, idRange)
  if (rand() < 0.35) el.marketPrice = rand() < 0.15 ? null : { id: randomId(rand, idRange) }
  if (rand() < 0.75) el.name = randomName(rand, nameRange)
  if (rand() < 0.4) el.itemName = randomName(rand, nameRange)
  shared.push(el)
  return el
}

function randomCatalogue(rand, size, shared, idRange, nameRange) {
  return Array.from({ length: size }, () => randomElement(rand, shared, idRange, nameRange))
}

function randomQuery(rand, idRange, nameRange) {
  if (rand() < 0.03) return rand() < 0.5 ? null : undefined
  const item = {}
  if (rand() < 0.5) item.itemId = randomId(rand, idRange)
  if (rand() < 0.4) item.id = randomId(rand, idRange)
  if (rand() < 0.3) item.sourceId = randomId(rand, idRange)
  if (rand() < 0.3) item.marketPriceId = randomId(rand, idRange)
  if (rand() < 0.5) item.itemName = randomName(rand, nameRange)
  if (rand() < 0.5) item.name = randomName(rand, nameRange)
  return item
}

function wrap(catalogue, mode) {
  if (mode === 'reactive') return reactive(catalogue)
  if (mode === 'shallow') return shallowReactive(catalogue)
  return catalogue
}

// Mode de chaque catalogue : le premier monde est brut, les autres mélangent
// tableaux bruts et enveloppés `reactive` / `shallowReactive`.
const MODES = [
  ['raw', 'raw', 'raw', 'raw'],
  ['reactive', 'reactive', 'reactive', 'reactive'],
  ['reactive', 'raw', 'shallow', 'reactive'],
]

const SIZES = [0, 1, 50, 300]
const SEEDS = [11, 2024, 90210]
const QUERIES_PER_WORLD = 20

function* worlds() {
  for (const seed of SEEDS) {
    for (const size of SIZES) {
      for (const modes of MODES) {
        const rand = mulberry32(seed * 1000 + size)
        const idRange = Math.max(4, Math.floor(size * 1.5))
        const nameRange = Math.max(3, Math.floor(size / 2))
        const shared = []
        // Tailles variées par catalogue : 0, 1, 50, 300 en rotation.
        const catalogues = modes.map((mode, index) => {
          const catalogueSize = SIZES[(SIZES.indexOf(size) + index) % SIZES.length]
          return wrap(randomCatalogue(rand, catalogueSize, shared, idRange, nameRange), mode)
        })
        const queries = Array.from({ length: QUERIES_PER_WORLD }, () =>
          randomQuery(rand, idRange, nameRange),
        )
        yield { seed, size, modes, catalogues, queries }
      }
    }
  }
}

describe('recherche indexée des références de stock : équivalence avec le parcours linéaire', () => {
  it('findStockReference renvoie le même objet (toBe) que l ancien parcours sur plus de 500 requêtes', () => {
    let total = 0
    let nulls = 0
    const hitCatalogue = [0, 0, 0, 0]
    for (const { catalogues, queries } of worlds()) {
      for (const query of queries) {
        const expected = oracleFindStockReference(query, ...catalogues)
        const actual = findStockReference(query, ...catalogues)
        if (expected === null) {
          expect(actual).toBeNull()
          nulls += 1
        } else {
          expect(actual).toBe(expected)
          const index = catalogues.findIndex((cat) => cat.some((c) => c === expected))
          if (index >= 0) hitCatalogue[index] += 1
        }
        total += 1
      }
    }
    expect(total).toBeGreaterThanOrEqual(500)
    // Le jeu est utile : des échecs, et des résolutions dans chacun des 4 catalogues.
    expect(nulls).toBeGreaterThan(20)
    hitCatalogue.forEach((count) => expect(count).toBeGreaterThan(5))
  })

  it('les candidats sont identiques (même ordre, mêmes objets, mêmes doublons) sur plus de 500 requêtes', () => {
    let total = 0
    let nonEmpty = 0
    let maxLength = 0
    for (const { catalogues, queries } of worlds()) {
      for (const query of queries) {
        const expected = oracleFindStockReferenceCandidates(query, ...catalogues)
        const actual = newCandidates(query, ...catalogues)
        expect(actual).toHaveLength(expected.length)
        expected.forEach((c, index) => expect(actual[index]).toBe(c))
        if (expected.length) nonEmpty += 1
        maxLength = Math.max(maxLength, expected.length)
        total += 1
      }
    }
    expect(total).toBeGreaterThanOrEqual(500)
    expect(nonEmpty).toBeGreaterThan(100)
    expect(maxLength).toBeGreaterThan(3)
  })

  it('couvre 0 à 4 identifiants candidats, avec et sans nom', () => {
    const counts = new Set()
    let withName = 0
    let withoutName = 0
    for (const { queries } of worlds()) {
      for (const query of queries) {
        const ids = [query?.itemId, query?.id, query?.sourceId, query?.marketPriceId].filter(
          Boolean,
        )
        counts.add(new Set(ids.map(String)).size)
        if (normalizeName(query?.itemName || query?.name)) withName += 1
        else withoutName += 1
      }
    }
    ;[0, 1, 2, 3, 4].forEach((n) => expect(counts.has(n)).toBe(true))
    expect(withName).toBeGreaterThan(50)
    expect(withoutName).toBeGreaterThan(50)
  })

  it('rejoue deux fois le même calcul dans la même tâche avec le même résultat (index réutilisé)', () => {
    for (const { catalogues, queries } of worlds()) {
      for (const query of queries) {
        const first = findStockReference(query, ...catalogues)
        const second = findStockReference(query, ...catalogues)
        expect(second).toBe(first)
      }
    }
  })
})

describe('recherche indexée des références de stock : règles de résolution', () => {
  it('BUG-299-01 : une correspondance par id dans un catalogue tardif bat un homonyme par nom plus tôt', () => {
    const ingredients = [
      { id: 'ing-homonyme', name: 'Beurre' },
      { id: 'ing-doux', name: 'Beurre doux motte' },
    ]
    const marketPrices = [{ id: 'mp-1', marketPriceId: 'mp-1', name: 'Autre' }]
    const item = { itemId: 'mp-1', itemName: 'Beurre' }
    expect(findStockReference(item, ingredients, [], [], marketPrices)).toBe(marketPrices[0])
    expect(findStockReference({ itemName: ' BEURRE ' }, ingredients, [], [], marketPrices)).toBe(
      ingredients[0],
    )
  })

  it('l id correspond sur id, sourceId, marketPriceId et marketPrice.id, nombres et chaînes confondus', () => {
    const ingredients = [{ id: 1 }, { sourceId: 'S' }, { marketPriceId: 7 }, { marketPrice: { id: 9 } }]
    expect(findStockReference({ id: '1' }, ingredients)).toBe(ingredients[0])
    expect(findStockReference({ sourceId: 'S' }, ingredients)).toBe(ingredients[1])
    expect(findStockReference({ marketPriceId: '7' }, ingredients)).toBe(ingredients[2])
    expect(findStockReference({ itemId: 9 }, ingredients)).toBe(ingredients[3])
  })

  it('renvoie la plus petite position parmi plusieurs identifiants candidats', () => {
    const ingredients = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(findStockReference({ itemId: 'c', sourceId: 'b' }, ingredients)).toBe(ingredients[1])
  })

  it('un élément porteur du même id dans deux champs n est listé qu une fois dans les candidats', () => {
    const el = { id: 'x', sourceId: 'x', marketPriceId: 'x', marketPrice: { id: 'x' } }
    const out = newCandidates({ itemId: 'x', id: 'x' }, [el])
    expect(out).toHaveLength(1)
    expect(out[0]).toBe(el)
  })

  it('un même objet présent à deux positions apparaît deux fois par id, une seule fois par nom', () => {
    const el = { id: 'x', name: 'Sucre' }
    expect(newCandidates({ itemId: 'x' }, [el, el])).toEqual([el, el])
    const named = { name: 'Sucre' }
    expect(newCandidates({ itemName: 'sucre' }, [named, named])).toHaveLength(1)
  })

  it('tolère catalogues absents (undefined, null) et éléments falsy', () => {
    const real = { id: 'a', name: 'Sel' }
    const withHoles = [null, undefined, 0, '', false, real]
    expect(findStockReference({ itemId: 'a' })).toBeNull()
    expect(findStockReference({ itemId: 'a' }, null, undefined, null, null)).toBeNull()
    expect(findStockReference({ itemId: 'a' }, withHoles)).toBe(real)
    expect(findStockReference({ itemName: 'sel' }, withHoles)).toBe(real)
    expect(newCandidates({ itemId: 'a', itemName: 'sel' }, withHoles, null)).toEqual([real])
    expect(findStockReference(null, withHoles)).toBeNull()
  })

  it('renvoie l élément tel que le catalogue passé le donne (proxy réactif inclus)', () => {
    const raw = [{ id: 'a', name: 'Sel' }, { id: 'b', name: 'Poivre' }]
    const proxy = reactive(raw)
    const viaProxy = findStockReference({ itemId: 'b' }, proxy)
    expect(viaProxy).toBe(proxy[1])
    expect(viaProxy).not.toBe(raw[1])
    const viaRaw = findStockReference({ itemId: 'b' }, raw)
    expect(viaRaw).toBe(raw[1])
  })
})

describe('recherche indexée des références de stock : cache de tâche', () => {
  it('un ajout dans le catalogue (longueur changée) est vu immédiatement, dans la même tâche', () => {
    const catalogue = [{ id: 'a', name: 'Sel' }]
    expect(findStockReference({ itemId: 'z' }, catalogue)).toBeNull()
    const added = { id: 'z', name: 'Poivre' }
    catalogue.push(added)
    expect(findStockReference({ itemId: 'z' }, catalogue)).toBe(added)
    expect(findStockReference({ itemName: 'poivre' }, catalogue)).toBe(added)
    catalogue.pop()
    expect(findStockReference({ itemId: 'z' }, catalogue)).toBeNull()
  })

  it('un ajout dans un tableau réactif est vu immédiatement et relance un computed', () => {
    const catalogue = reactive([{ id: 'a', name: 'Sel' }])
    const result = computed(() => findStockReference({ itemId: 'z' }, catalogue))
    expect(result.value).toBeNull()
    catalogue.push({ id: 'z', name: 'Poivre' })
    expect(result.value).toBe(catalogue[1])
  })

  it('un ajout dans un tableau réactif vide relance aussi un computed', () => {
    const catalogue = reactive([])
    const result = computed(() => findStockReference({ itemName: 'poivre' }, catalogue))
    expect(result.value).toBeNull()
    catalogue.push({ id: 'z', name: 'Poivre' })
    expect(result.value).toBe(catalogue[0])
  })

  it('une modification de nom sur place n est pas vue dans la même tâche synchrone, mais l est après await Promise.resolve()', async () => {
    const catalogue = [{ id: 'a', name: 'Beurre' }, { id: 'b', name: 'Sucre' }]
    expect(findStockReference({ itemName: 'Sucre' }, catalogue)).toBe(catalogue[1])

    catalogue[1].name = 'Sel'
    // Même tâche synchrone : l'index construit au premier appel est encore servi.
    expect(findStockReference({ itemName: 'Sucre' }, catalogue)).toBe(catalogue[1])
    expect(findStockReference({ itemName: 'Sel' }, catalogue)).toBeNull()

    await Promise.resolve()
    // Tâche suivante : l'index est refait à partir des données courantes.
    expect(findStockReference({ itemName: 'Sucre' }, catalogue)).toBeNull()
    expect(findStockReference({ itemName: 'Sel' }, catalogue)).toBe(catalogue[1])
  })

  it('une modification d id sur place n est vue qu après await Promise.resolve()', async () => {
    const catalogue = [{ id: 'a' }, { id: 'b' }]
    expect(findStockReference({ itemId: 'b' }, catalogue)).toBe(catalogue[1])

    catalogue[1].id = 'c'
    expect(findStockReference({ itemId: 'b' }, catalogue)).toBe(catalogue[1])

    await Promise.resolve()
    expect(findStockReference({ itemId: 'b' }, catalogue)).toBeNull()
    expect(findStockReference({ itemId: 'c' }, catalogue)).toBe(catalogue[1])
  })

  it('le cache d un tableau réactif est partagé avec son tableau brut (même index, même tâche)', async () => {
    const raw = [{ id: 'a', name: 'Sel' }, { id: 'b', name: 'Poivre' }]
    const proxy = reactive(raw)
    expect(findStockReference({ itemId: 'b' }, raw)).toBe(raw[1])
    raw.push({ id: 'c', name: 'Curry' })
    expect(findStockReference({ itemId: 'c' }, proxy)).toBe(proxy[2])
    await Promise.resolve()
    expect(findStockReference({ itemId: 'c' }, raw)).toBe(raw[2])
  })
})
