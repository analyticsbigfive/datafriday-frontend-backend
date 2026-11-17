import {
  decideAllConfigsContext,
  ALL_CONFIGS_CTX_AFTER_PHASE1_MS,
} from '@/utils/analyseAllConfigsContextGate'

// État minimal du module store `analyse` : espace connu, union non chargée, aucune config.
const baseState = (over = {}) => ({
  spaceId: 'sp-1',
  space: { id: 'sp-1' },
  selectedToolbox: 'overview',
  filters: { selectedConfigurationId: null },
  configContextLoading: false,
  configShopContext: { configId: null, floorElements: [] },
  ...over,
})

describe('decideAllConfigsContext', () => {
  it("'wait' quand Event Predict est ouvert (ne pas verrouiller)", () => {
    expect(decideAllConfigsContext(baseState({ selectedToolbox: 'event-predict' }))).toBe('wait')
  })

  it("'wait' quand l'espace n'est pas encore connu", () => {
    expect(decideAllConfigsContext(baseState({ spaceId: null, space: null }))).toBe('wait')
    expect(decideAllConfigsContext(baseState({ spaceId: undefined, space: {} }))).toBe('wait')
  })

  it("'dispatch' si l'id d'espace n'est connu que via space.id (espace considéré connu)", () => {
    expect(decideAllConfigsContext(baseState({ spaceId: null, space: { id: 'sp-2' } }))).toBe('dispatch')
  })

  it("'latch' quand une configuration précise est sélectionnée", () => {
    expect(decideAllConfigsContext(baseState({ filters: { selectedConfigurationId: 'cfg-42' } }))).toBe('latch')
  })

  it("'dispatch' quand la sélection est « cfg-all » ou vide", () => {
    expect(decideAllConfigsContext(baseState({ filters: { selectedConfigurationId: 'cfg-all' } }))).toBe('dispatch')
    expect(decideAllConfigsContext(baseState({ filters: { selectedConfigurationId: '' } }))).toBe('dispatch')
  })

  it("'latch' quand un chargement de contexte est déjà en cours", () => {
    expect(decideAllConfigsContext(baseState({ configContextLoading: true }))).toBe('latch')
  })

  it("'latch' quand le contexte union est déjà chargé (configId null et PdV présents)", () => {
    const configShopContext = { configId: null, floorElements: [{ id: 'pdv-1' }] }
    expect(decideAllConfigsContext(baseState({ configShopContext }))).toBe('latch')
  })

  it("'dispatch' quand le contexte courant est celui d'une config précise (pas l'union)", () => {
    const configShopContext = { configId: 'cfg-42', floorElements: [{ id: 'pdv-1' }] }
    expect(decideAllConfigsContext(baseState({ configShopContext }))).toBe('dispatch')
  })

  it("'dispatch' quand l'union est vide ou absente", () => {
    expect(decideAllConfigsContext(baseState({ configShopContext: { configId: null, floorElements: [] } }))).toBe('dispatch')
    expect(decideAllConfigsContext(baseState({ configShopContext: null }))).toBe('dispatch')
  })

  it("'dispatch' dans le cas nominal : espace connu, All Configurations, rien de chargé", () => {
    expect(decideAllConfigsContext(baseState())).toBe('dispatch')
  })

  it("'wait' prime sur 'latch' : Event Predict ouvert avec config précise reste non verrouillé", () => {
    const st = baseState({ selectedToolbox: 'event-predict', filters: { selectedConfigurationId: 'cfg-42' } })
    expect(decideAllConfigsContext(st)).toBe('wait')
  })
})

describe('ALL_CONFIGS_CTX_AFTER_PHASE1_MS', () => {
  it('lance le contexte union dès la fin de la phase 1 (prochaine macrotâche)', () => {
    expect(ALL_CONFIGS_CTX_AFTER_PHASE1_MS).toBe(0)
  })
})
