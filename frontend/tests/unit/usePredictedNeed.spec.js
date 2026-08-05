jest.mock('@/api/endpoints/eventPredict.api', () => ({
  listEventPredictVersions: jest.fn(),
}))
jest.mock('@/data/localDb', () => ({
  getEventPredictVersions: jest.fn(() => []),
}))

import { listEventPredictVersions } from '@/api/endpoints/eventPredict.api'
import * as localDb from '@/data/localDb'
import {
  pickReferenceVersion,
  buildPredictedNeedIndex,
  lookupPredictedNeed,
  loadPredictedNeed,
} from '@/composables/usePredictedNeed'

const ELEMENTS = [{ id: 'shop-1', name: 'Buvette Nord' }]

/** Version dont les records pointent un menuItemId ABSENT du catalogue : le
 *  besoin sort alors en ligne feuille directe (nom + quantité), sans recette. */
function makeVersion(overrides = {}) {
  return {
    id: 'v1',
    isDefault: true,
    menuConfig: { 'shop-1': ['mi-1'] },
    quantityAdjustments: {},
    predictedRecords: [
      { shopId: 'shop-1', menuItemId: 'mi-1', itemName: 'Biere Pression', totalQuantity: 120 },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  localDb.getEventPredictVersions.mockReturnValue([])
})

describe('pickReferenceVersion', () => {
  it('retient la version marquée par défaut, pas la plus récente', () => {
    const rows = [
      { id: 'brouillon', isDefault: false },
      { id: 'reference', isDefault: true },
    ]
    expect(pickReferenceVersion(rows).id).toBe('reference')
  })

  it('aucune version par défaut → null (jamais un repli implicite)', () => {
    expect(pickReferenceVersion([{ id: 'a', isDefault: false }])).toBeNull()
    expect(pickReferenceVersion([])).toBeNull()
    expect(pickReferenceVersion(null)).toBeNull()
  })
})

describe('buildPredictedNeedIndex', () => {
  it('indexe par itemId ET par nom normalisé (les deux écrans ne keyent pas pareil)', () => {
    const index = buildPredictedNeedIndex({ elements: ELEMENTS, version: makeVersion() })
    expect(index.byItemId['shop-1|mi-1']).toBe(120)
    expect(index.byItemName['shop-1|biere pression']).toBe(120)
  })

  it('applique les quantityAdjustments du scénario', () => {
    const index = buildPredictedNeedIndex({
      elements: ELEMENTS,
      version: makeVersion({ quantityAdjustments: { 'shop-1-mi-1': 50 } }),
    })
    expect(index.byItemId['shop-1|mi-1']).toBe(60)
  })

  it("un PdV hors périmètre de l'écran n'entre pas dans l'index", () => {
    const index = buildPredictedNeedIndex({
      elements: [{ id: 'shop-2', name: 'Buvette Sud' }],
      version: makeVersion(),
    })
    expect(index).toBeNull()
  })

  it('version sans records → null (pas un index vide qui afficherait 0)', () => {
    expect(
      buildPredictedNeedIndex({ elements: ELEMENTS, version: makeVersion({ predictedRecords: [] }) }),
    ).toBeNull()
  })
})

describe('lookupPredictedNeed', () => {
  const index = buildPredictedNeedIndex({ elements: ELEMENTS, version: makeVersion() })

  it("résout par itemId quand l'article en porte un", () => {
    expect(lookupPredictedNeed(index, 'shop-1', { id: 'mi-1', name: 'peu importe' })).toBe(120)
  })

  it('retombe sur le nom normalisé (lignes Logistic, keyées par nom)', () => {
    expect(lookupPredictedNeed(index, 'shop-1', { name: 'BIERE PRESSION' })).toBe(120)
  })

  it('rien de prédit → null, jamais 0', () => {
    expect(lookupPredictedNeed(index, 'shop-1', { id: 'inconnu', name: 'Inconnu' })).toBeNull()
    expect(lookupPredictedNeed(null, 'shop-1', { id: 'mi-1' })).toBeNull()
  })
})

describe('loadPredictedNeed', () => {
  it("l'API fait foi", async () => {
    listEventPredictVersions.mockResolvedValue([makeVersion()])
    const { index, reason } = await loadPredictedNeed({ eventId: 'e1', elements: ELEMENTS })
    expect(reason).toBeNull()
    expect(index.byItemId['shop-1|mi-1']).toBe(120)
    expect(localDb.getEventPredictVersions).not.toHaveBeenCalled()
  })

  it('API en échec → miroir localStorage (une coupure réseau ne doit pas effacer l\'indice)', async () => {
    listEventPredictVersions.mockRejectedValue(new Error('network down'))
    localDb.getEventPredictVersions.mockReturnValue([makeVersion()])
    const { index } = await loadPredictedNeed({ eventId: 'e1', elements: ELEMENTS })
    expect(index.byItemId['shop-1|mi-1']).toBe(120)
  })

  it('API vide → miroir localStorage aussi', async () => {
    listEventPredictVersions.mockResolvedValue([])
    localDb.getEventPredictVersions.mockReturnValue([makeVersion()])
    const { index } = await loadPredictedNeed({ eventId: 'e1', elements: ELEMENTS })
    expect(index.byItemId['shop-1|mi-1']).toBe(120)
  })

  it('aucune version par défaut nulle part → reason explicite (le front invite à en définir une)', async () => {
    listEventPredictVersions.mockResolvedValue([{ id: 'v2', isDefault: false }])
    const { index, reason } = await loadPredictedNeed({ eventId: 'e1', elements: ELEMENTS })
    expect(index).toBeNull()
    expect(reason).toBe('no-default-version')
  })

  it('sans eventId : rien, et aucun appel réseau', async () => {
    const { index } = await loadPredictedNeed({ elements: ELEMENTS })
    expect(index).toBeNull()
    expect(listEventPredictVersions).not.toHaveBeenCalled()
  })
})
