import { buildPreEventExpected, expectedKey, aggregateExpectedUnitsFromIndex, flattenExpectedUnits, buildExpectedCalcDetails } from '@/utils/preEventExpected'
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

describe('aggregateExpectedUnitsFromIndex', () => {
  const entry = {
    element: { id: 'el1' },
    consolidatedInventory: [
      { id: 'beer', name: 'Bière', unit: 'L' },
      { id: 'cup', name: 'Gobelet', unit: '' },
      { id: 'coke', name: 'Coca', unit: 'L' },
      { id: 'ghost', name: 'Sans indice', unit: 'Kg' },
    ],
  }

  it('returns null without an index, element id, or items', () => {
    expect(aggregateExpectedUnitsFromIndex(null, entry)).toBeNull()
    expect(aggregateExpectedUnitsFromIndex({}, { element: { id: 'el1' }, consolidatedInventory: [] })).toBeNull()
    expect(aggregateExpectedUnitsFromIndex({}, { consolidatedInventory: [{ id: 'beer' }] })).toBeNull()
  })

  it('returns null when no section item has an entry in the index', () => {
    const index = { [K('other-el', 'beer')]: 4 }
    expect(aggregateExpectedUnitsFromIndex(index, entry)).toBeNull()
  })

  it('sums per display unit, grouping empty units under the fallback', () => {
    const index = {
      [K('el1', 'beer')]: 10.004,
      [K('el1', 'coke')]: 2,
      [K('el1', 'cup')]: 150,
      [K('other-el', 'beer')]: 999, // autre section : ignoré
    }
    expect(aggregateExpectedUnitsFromIndex(index, entry, { fallbackUnit: 'pc' })).toEqual([
      { unit: 'L', total: 12 },
      { unit: 'pc', total: 150 },
    ])
  })

  it('keeps zero and negative hints (signal to display), rounded to 2 decimals', () => {
    const index = { [K('el1', 'beer')]: 0, [K('el1', 'coke')]: -3.005 }
    expect(aggregateExpectedUnitsFromIndex(index, entry)).toEqual([{ unit: 'L', total: -3 }])
  })

  it('reads storageInventory / merchInventory when consolidatedInventory is absent', () => {
    const index = { [K('st1', 'ice')]: 7 }
    const storageEntry = { element: { id: 'st1' }, storageInventory: [{ id: 'ice', unit: 'Kg' }] }
    expect(aggregateExpectedUnitsFromIndex(index, storageEntry)).toEqual([{ unit: 'Kg', total: 7 }])
  })
})

// ── flattenExpectedUnits — badge « Attendu » de section pre-event ─────────────
// (réunion Bertrand 2026-08-19 : post-event précédent + Logistique, plus le
// plan Stockup sauvegardé).

describe('flattenExpectedUnits', () => {
  it('null sans index (pas de baseline / permission absente)', () => {
    expect(flattenExpectedUnits(null)).toBeNull()
    expect(flattenExpectedUnits(undefined)).toBeNull()
  })

  it('passe le total serveur tel quel quand `units` est présent', () => {
    const out = flattenExpectedUnits({ [K('el1', 'beer')]: { packed: 2, loose: 3, units: 51 } })
    expect(out[K('el1', 'beer')]).toBe(51)
  })

  it('conserve un total serveur négatif (signal, jamais clampé)', () => {
    const out = flattenExpectedUnits({ [K('el1', 'beer')]: { packed: 0, loose: 0, units: -3 } })
    expect(out[K('el1', 'beer')]).toBe(-3)
  })

  it('sans `units` ni taille écran : packed + loose (facteur 1)', () => {
    const out = flattenExpectedUnits({ [K('el1', 'beer')]: { packed: 2, loose: 3, units: null } })
    expect(out[K('el1', 'beer')]).toBe(5)
  })

  it('sans `units` mais taille de paquet ÉCRAN connue : packed × taille + loose', () => {
    // Champ légendé « Nombre de Cartons de 24 » → le badge somme ce que
    // l'écran montre (2 × 24 + 3 = 51), pas un packed+loose contradictoire.
    const out = flattenExpectedUnits(
      { [K('el1', 'beer')]: { packed: 2, loose: 3, units: null } },
      { unitsPerItemId: { beer: 24 } },
    )
    expect(out[K('el1', 'beer')]).toBe(51)
  })
})

// ── buildExpectedCalcDetails — détail du calcul (infobulles, demande JLH
// 2026-08-19). Les termes sont DÉRIVÉS pour que l'identité affichée tienne
// toujours : pre `base + moves = attendu`, post `base + moves − sold = attendu`.

describe('buildExpectedCalcDetails', () => {
  const baseline = { el1: { beer: { packedUnits: 2, looseUnits: 3 } } }

  it('null sans index attendu', () => {
    expect(buildExpectedCalcDetails({ baseline, expectedUnits: null })).toBeNull()
    expect(buildExpectedCalcDetails()).toBeNull()
  })

  it('pre-event : base depuis le comptage (taille écran) et moves dérivé', () => {
    const out = buildExpectedCalcDetails({
      baseline,
      expectedUnits: { [K('el1', 'beer')]: 75 },
      unitsPerItemId: { beer: 24 },
    })
    // base = 2 × 24 + 3 = 51 ; moves = 75 − 51 = 24 → « 51 + 24 = 75 »
    expect(out[K('el1', 'beer')]).toEqual({ base: 51, moves: 24, sold: null })
  })

  it('pre-event : article absent du comptage précédent → base 0, tout en moves', () => {
    const out = buildExpectedCalcDetails({
      baseline,
      expectedUnits: { [K('el1', 'wine')]: 12 },
    })
    expect(out[K('el1', 'wine')]).toEqual({ base: 0, moves: 12, sold: null })
  })

  it('post-event : moves = net serveur, sold dérivé (base + moves − attendu)', () => {
    const out = buildExpectedCalcDetails({
      baseline,
      movementUnits: { el1: { beer: 10 } },
      expectedUnits: { [K('el1', 'beer')]: 47 },
      unitsPerItemId: { beer: 24 },
    })
    // base 51 + moves 10 − sold 14 = 47
    expect(out[K('el1', 'beer')]).toEqual({ base: 51, moves: 10, sold: 14 })
  })

  it('post-event : attendu négatif conservé — sold absorbe (identité maintenue)', () => {
    const out = buildExpectedCalcDetails({
      baseline: { el1: { beer: { packedUnits: 0, looseUnits: 5 } } },
      movementUnits: { el1: { beer: -2 } },
      expectedUnits: { [K('el1', 'beer')]: -3 },
    })
    // 5 − 2 − sold = −3 → sold = 6
    expect(out[K('el1', 'beer')]).toEqual({ base: 5, moves: -2, sold: 6 })
  })
})
