import { ref } from 'vue'
import { sanitizeOklchColors } from '@/utils/oklchFallback'

/**
 * Gère la capture d'écran (html2canvas), la copie presse-papiers et le
 * partage natif (Web Share API) pour le tableau de bord Analyse.
 *
 * @param {object} options
 * @param {import('vue').ComputedRef<string>} options.spaceName  nom du space pour nommer le fichier
 * @param {string} [options.rootId]  id DOM de la zone à capturer (défaut : la page Analyse ;
 *   Live passe son propre id pour ne pas dépendre d'AnalyseView.vue)
 * @param {(text: string, color?: string) => void} [options.notify]  notificateur externe (ex.
 *   snackbar déjà monté par la page) ; absent, le composable expose ses propres refs snackbar
 * @param {(clonedDoc: Document) => void} [options.prepareClone]  retouche du DOM cloné par
 *   html2canvas avant le rendu (ex. révéler des blocs réservés à la capture)
 * @param {() => string} [options.fileName]  nom de fichier PNG sans extension (défaut :
 *   « <espace>-<horodatage> » ; la comparaison passe « comparaison-<espace>-<date> »)
 */
export function useAnalyseCapture({ spaceName, rootId = 'analyse-capture-root', fileName = null, notify: externalNotify = null, prepareClone = null }) {
  const pngName = () => `${typeof fileName === 'function' ? fileName() : `${spaceName.value}-${Date.now()}`}.png`
  const copying = ref(false)
  const sharing = ref(false)
  const snackbar = ref(false)
  const snackbarText = ref('')
  const snackbarColor = ref('success')

  function notify(text, color = 'success') {
    if (typeof externalNotify === 'function') {
      externalNotify(text, color)
      return
    }
    snackbarText.value = text
    snackbarColor.value = color
    snackbar.value = true
  }

  async function captureAnalyse() {
    const target = document.getElementById(rootId) || document.body
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: window.devicePixelRatio || 1,
      useCORS: true,
      logging: false,
      // Même contrainte que le Rapport J+1 : html2canvas 1.4.1 ne parse pas
      // `oklch()`, syntaxe des tokens Tailwind v4 hérités par toute la page.
      onclone: (clonedDoc) => {
        sanitizeOklchColors(clonedDoc)
        if (typeof prepareClone === 'function') prepareClone(clonedDoc)
      },
    })
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Échec de capture'))
      }, 'image/png')
    })
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  async function onCopy() {
    copying.value = true
    try {
      const blob = await captureAnalyse()
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
        notify('Capture copiée dans le presse-papiers')
      } else {
        downloadBlob(blob, pngName())
        notify('Capture téléchargée (presse-papiers indisponible)')
      }
    } catch (e) {
      console.error('[useAnalyseCapture] copy', e)
      notify('Impossible de copier la capture', 'error')
    } finally {
      copying.value = false
    }
  }

  async function onShare() {
    sharing.value = true
    try {
      const blob = await captureAnalyse()
      const file = new File([blob], pngName(), { type: 'image/png' })
      const shareData = {
        title: `Tableau de bord ${spaceName.value}`,
        text: `Tableau de bord ${spaceName.value} — DataFriday`,
        files: [file],
      }
      if (navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData)
        notify('Partagé')
      } else if (navigator.share) {
        await navigator.share({ title: shareData.title, text: shareData.text, url: window.location.href })
        notify('Lien partagé (image téléchargée séparément)')
        downloadBlob(blob, file.name)
      } else {
        downloadBlob(blob, file.name)
        notify('Partage natif indisponible — capture téléchargée', 'info')
      }
    } catch (e) {
      if (e?.name === 'AbortError') return
      console.error('[useAnalyseCapture] share', e)
      notify('Impossible de partager', 'error')
    } finally {
      sharing.value = false
    }
  }

  return {
    copying,
    sharing,
    snackbar,
    snackbarText,
    snackbarColor,
    onCopy,
    onShare,
  }
}
