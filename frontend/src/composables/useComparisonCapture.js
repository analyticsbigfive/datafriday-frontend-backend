/**
 * useComparisonCapture : copie / partage en image du rapport de comparaison.
 * Seconde instance de useAnalyseCapture (la première capture la page Analyse) : racine
 * #comparison-capture-root, nom de fichier « comparaison-<espace>-<date> », blocs réservés à la
 * capture révélés dans le clone, notifications via le snackbar de la page.
 * À appeler dans un setup.
 */
import { useAnalyseCapture } from '@/composables/useAnalyseCapture'
import { COMPARISON_CAPTURE_ROOT_ID, revealCaptureOnlyBlocks } from '@/utils/comparisonCapture'
import { comparisonFileBase } from '@/utils/comparisonExportTables'

/**
 * @param {object} p
 * @param {import('vue').ComputedRef<string>} p.spaceName
 * @param {(text: string, color?: string) => void} p.notify
 * @returns {{ copying, sharing, onCopy, onShare }}
 */
export function useComparisonCapture({ spaceName, notify }) {
  const { copying, sharing, onCopy, onShare } = useAnalyseCapture({
    spaceName,
    rootId: COMPARISON_CAPTURE_ROOT_ID,
    fileName: () => comparisonFileBase({ spaceName: spaceName.value }),
    notify,
    prepareClone: revealCaptureOnlyBlocks,
  })
  return { copying, sharing, onCopy, onShare }
}
