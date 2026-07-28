import { buildPreEventExpected, expectedKey } from '@/utils/preEventExpected'
import { normalizeStr } from '@/utils/predictiveAnalytics'

const K = expectedKey

describe('buildPreEventExpected', () => {
  it('returns null without a baseline (no post-event count for the previous event)', () => {
    expect(buildPreEventExpected(null)).toBeNull()
    expect(buildPreEventExpected({ baseline: null, movements: [] })).toBeNull()
    expect(buildPreEventExpected({})).toBeNull()
  })

  // ── Chemin nominal : blob `expected` normalisé côté serveur (BUG-232) ───────

  it('uses the server-normalized `expected` blob when present (passthrough, flattened)', () => {
    const out = buildPreEventExpected({
      baseline: { el1: { beer: { packedUnits: 9, looseUnits: 9 } } },
      expected: { el1: { beer: { packed: 2, loose: 8.505 } }, el2: { coke: { packed: 5, loose: 0 } } },
      movements: [],
    })
    // `units` reste null tant que le serveur n'envoie ni `units` ni `unitsPerPack`
    // (réponse d'un backend antérieur à BUG-239) — aucun total fabriqué.
    expect(out[K('el1', 'beer')]).toEqual({ packed: 2, loose: 8.51, units: null })
    expect(out[K('el2', 'coke')]).toEqual({ packed: 5, loose: 0, units: null })
    expect(Object.keys(out)).toHaveLength(2)
  })

  it('ignores `movements` entirely when `expected` is present (even contradictory ones)', () => {
    const out = buildPreEventExpected({
      baseline: { el1: { beer: { packedUnits: 1, looseUnits: 0 } } },
      expected: { el1: { beer: { packed: 3, loose: 2 } } },
      movements: [{ elementId: 'el1', menuItemId: 'beer', packedDelta: -99, looseDelta: -99 }],
    })
    expect(out[K('el1', 'beer')]).toEqual({ packed: 3, loose: 2, units: null })
  })

  // ── BUG-239 : le serveur peut avoir calculé avec une AUTRE taille de paquet ──

  it('re-splits the expected units into the packed size of the displayed referential', () => {
    // Serveur : 3 packs de 12 = 36 unités. Écran : packs de 24 → 1 pack + 12 en vrac.
    const out = buildPreEventExpected(
      {
        baseline: { el1: { coke: { packedUnits: 3, looseUnits: 0 } } },
        expected: { el1: { coke: { packed: 3, loose: 0, units: 36, unitsPerPack: 12 } } },
      },
      { unitsPerItemId: { coke: 24 } },
    )
    expect(out[K('el1', 'coke')]).toEqual({ packed: 1, loose: 12, units: 36 })
  })

  it('leaves the server split untouched when both sides agree on the packed size', () => {
    const out = buildPreEventExpected(
      {
        baseline: { el1: { coke: { packedUnits: 3, looseUnits: 0 } } },
        expected: { el1: { coke: { packed: 3, loose: 0, units: 72, unitsPerPack: 24 } } },
      },
      { unitsPerItemId: { coke: 24 } },
    )
    expect(out[K('el1', 'coke')]).toEqual({ packed: 3, loose: 0, units: 72 })
  })

  it('keeps the server split when the displayed referential has no packed size', () => {
    const out = buildPreEventExpected({
      baseline: { el1: { coke: { packedUnits: 3, looseUnits: 0 } } },
      expected: { el1: { coke: { packed: 3, loose: 0, units: 36, unitsPerPack: 12 } } },
    })
    expect(out[K('el1', 'coke')]).toEqual({ packed: 3, loose: 0, units: 36 })
  })

  it('derives the total from packed × unitsPerPack when the server omits `units`', () => {
    const out = buildPreEventExpected(
      {
        baseline: { el1: { coke: { packedUnits: 2, looseUnits: 6 } } },
        expected: { el1: { coke: { packed: 2, loose: 6, unitsPerPack: 12 } } },
      },
      { unitsPerItemId: { coke: 24 } },
    )
    // 2 × 12 + 6 = 30 unités → 1 pack de 24 + 6.
    expect(out[K('el1', 'coke')]).toEqual({ packed: 1, loose: 6, units: 30 })
  })

  it('never returns negatives from the server blob (normalized upstream, BUG-232 repro)', () => {
    // Barre chocolatée 1A : la Logistique casse un pack au lieu de laisser le
    // vrac passer négatif — le blob serveur reflète déjà cette normalisation.
    const out = buildPreEventExpected({
      baseline: { el1: { choco: { packedUnits: 3, looseUnits: 0 } } },
      expected: { el1: { choco: { packed: 2, loose: 5 } } },
    })
    expect(out[K('el1', 'choco')].packed).toBeGreaterThanOrEqual(0)
    expect(out[K('el1', 'choco')].loose).toBeGreaterThanOrEqual(0)
    expect(out[K('el1', 'choco')]).toEqual({ packed: 2, loose: 5, units: null })
  })

  // ── Repli legacy (réponse d'un backend antérieur à BUG-232, sans `expected`) ─

  it('maps the baseline blob to packed/loose per element×item', () => {
    const out = buildPreEventExpected({
      baseline: { el1: { beer: { packedUnits: 4, looseUnits: 7.5 } } },
      movements: [],
    })
    expect(out[K('el1', 'beer')]).toEqual({ packed: 4, loose: 7.5 })
  })

  it('applies movement deltas by menuItemId (direct join)', () => {
    const out = buildPreEventExpected({
      baseline: { el1: { beer: { packedUnits: 4, looseUnits: 2 } } },
      movements: [{ elementId: 'el1', menuItemId: 'beer', packedDelta: 3, looseDelta: -1.5 }],
    })
    expect(out[K('el1', 'beer')]).toEqual({ packed: 7, loose: 0.5 })
  })

  it('falls back to normalized-name join when the movement has no menuItemId', () => {
    const itemIdByNormName = new Map([[normalizeStr('Pinte Bière 50cl'), 'beer']])
    const out = buildPreEventExpected(
      {
        baseline: { el1: { beer: { packedUnits: 1, looseUnits: 0 } } },
        movements: [{ elementId: 'el1', itemKey: 'PINTE BIERE 50CL', packedDelta: 2, looseDelta: 0 }],
      },
      { itemIdByNormName },
    )
    expect(out[K('el1', 'beer')].packed).toBe(3)
  })

  it('ignores movements that resolve to no known item', () => {
    const out = buildPreEventExpected(
      {
        baseline: { el1: { beer: { packedUnits: 1, looseUnits: 0 } } },
        movements: [{ elementId: 'el1', itemKey: 'Inconnu Total', packedDelta: 99, looseDelta: 9 }],
      },
      { itemIdByNormName: new Map() },
    )
    expect(out[K('el1', 'beer')]).toEqual({ packed: 1, loose: 0 })
    expect(Object.keys(out)).toHaveLength(1)
  })

  it('creates a key for a movement on an item absent from the baseline (restock of a new item)', () => {
    const out = buildPreEventExpected({
      baseline: { el1: { beer: { packedUnits: 1, looseUnits: 0 } } },
      movements: [{ elementId: 'el2', menuItemId: 'coke', packedDelta: 5, looseDelta: 0 }],
    })
    expect(out[K('el2', 'coke')]).toEqual({ packed: 5, loose: 0 })
  })

  it('legacy fallback only: keeps negative values (no pack-breaking client-side — BUG-232, fixed server-side)', () => {
    const out = buildPreEventExpected({
      baseline: { el1: { beer: { packedUnits: 1, looseUnits: 0 } } },
      movements: [{ elementId: 'el1', menuItemId: 'beer', packedDelta: -4, looseDelta: -2 }],
    })
    expect(out[K('el1', 'beer')]).toEqual({ packed: -3, loose: -2 })
  })
})
