/**
 * Copie / partage en image : options rétro-compatibles de useAnalyseCapture (fileName, notify,
 * prepareClone) et useComparisonCapture (racine et nom de fichier propres).
 */
const mockHtml2canvas = jest.fn()
jest.mock('html2canvas', () => ({ __esModule: true, default: (...a) => mockHtml2canvas(...a) }))

import { computed } from 'vue'
import { useAnalyseCapture } from '@/composables/useAnalyseCapture'
import { useComparisonCapture } from '@/composables/useComparisonCapture'

let anchor
beforeEach(() => {
  jest.clearAllMocks()
  document.body.innerHTML = '<div id="analyse-capture-root"></div><div id="comparison-capture-root"><div class="cr__snap" style="display:none"></div></div>'
  mockHtml2canvas.mockImplementation(async (target, opts) => {
    opts.onclone(document)
    return { toBlob: (cb) => cb(new Blob(['x'], { type: 'image/png' })) }
  })
  global.URL.createObjectURL = jest.fn(() => 'blob:t')
  global.URL.revokeObjectURL = jest.fn()
  anchor = { click: jest.fn(), href: '', download: '' }
  const realCreate = document.createElement.bind(document)
  jest.spyOn(document, 'createElement').mockImplementation((tag) => (tag === 'a' ? anchor : realCreate(tag)))
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  delete window.ClipboardItem
})
afterEach(() => { document.createElement.mockRestore() })

const spaceName = computed(() => 'Stade Océane')

describe('useAnalyseCapture (rétro-compatibilité)', () => {
  it('sans option : racine de la page Analyse, nom « espace-horodatage », snackbar interne', async () => {
    const cap = useAnalyseCapture({ spaceName })
    await cap.onCopy()
    expect(mockHtml2canvas.mock.calls[0][0].id).toBe('analyse-capture-root')
    expect(anchor.download).toMatch(/^Stade Océane-\d+\.png$/)
    expect(cap.snackbar.value).toBe(true)
    expect(cap.snackbarColor.value).toBe('success')
    expect(cap.copying.value).toBe(false)
  })
})

describe('useComparisonCapture', () => {
  it('capture la racine de la comparaison, nomme le fichier, révèle la bande et notifie la page', async () => {
    const notify = jest.fn()
    const cap = useComparisonCapture({ spaceName, notify })
    const p = cap.onCopy()
    expect(cap.copying.value).toBe(true)
    await p
    expect(cap.copying.value).toBe(false)
    expect(mockHtml2canvas.mock.calls[0][0].id).toBe('comparison-capture-root')
    expect(anchor.download).toMatch(/^comparaison-stade-oceane-\d{4}-\d{2}-\d{2}\.png$/)
    expect(document.querySelector('.cr__snap').style.display).toBe('block')
    expect(notify).toHaveBeenCalledWith(expect.any(String), 'success')
  })

  it('partage : retombe sur le téléchargement sans Web Share et passe sharing à false', async () => {
    const notify = jest.fn()
    const cap = useComparisonCapture({ spaceName, notify })
    await cap.onShare()
    expect(cap.sharing.value).toBe(false)
    expect(anchor.download).toMatch(/^comparaison-stade-oceane-/)
    expect(notify).toHaveBeenCalled()
  })

  it('échec de capture : notification d\'erreur', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockHtml2canvas.mockRejectedValueOnce(new Error('x'))
    const notify = jest.fn()
    const cap = useComparisonCapture({ spaceName, notify })
    await cap.onCopy()
    expect(notify).toHaveBeenCalledWith(expect.any(String), 'error')
    expect(cap.copying.value).toBe(false)
    err.mockRestore()
  })
})
