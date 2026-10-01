// BUG-389-02 : la navigation du menu des outils ne doit jamais rejeter en silence.

const mockPush = jest.fn()
const mockRoute = { params: { spaceId: 'sp1' }, query: { event: 'ev1' } }

jest.mock('vuex', () => ({
  useStore: () => ({ getters: { 'auth/can': () => true } }),
}))
jest.mock('vue-router', () => ({
  ...jest.requireActual('vue-router'),
  useRouter: () => ({ push: mockPush }),
  useRoute: () => mockRoute,
}))
jest.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key) => key }) }))

import { useWorkspaceToolbox } from '@/composables/useWorkspaceToolbox'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('useWorkspaceToolbox, navigation sécurisée', () => {
  beforeEach(() => {
    mockPush.mockReset()
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('route vers l\'outil avec le contexte event', () => {
    mockPush.mockResolvedValue(undefined)
    const { onToolboxSelect } = useWorkspaceToolbox('analyse')
    onToolboxSelect('restock')
    expect(mockPush).toHaveBeenCalledWith({ name: 'space-restock', params: { spaceId: 'sp1' }, query: { event: 'ev1' } })
    onToolboxSelect('event-predict')
    expect(mockPush).toHaveBeenLastCalledWith({ name: 'space-analyse', params: { spaceId: 'sp1' }, query: { toolbox: 'event-predict' } })
  })

  it('ne navigue pas vers l\'outil courant', () => {
    const { onToolboxSelect } = useWorkspaceToolbox('analyse')
    onToolboxSelect('analyse')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('journalise une navigation rejetée sans promesse non gérée', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockPush.mockRejectedValue(new Error('guard boom'))
    const { onToolboxSelect } = useWorkspaceToolbox('analyse')
    onToolboxSelect('logistic')
    await flush()
    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })

  it('ne journalise pas une erreur de chunk (gérée par router.onError)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('Loading chunk 5 failed.')
    err.name = 'ChunkLoadError'
    mockPush.mockRejectedValue(err)
    const { onToolboxSelect } = useWorkspaceToolbox('analyse')
    onToolboxSelect('live')
    await flush()
    expect(consoleSpy).not.toHaveBeenCalled()
  })
})
