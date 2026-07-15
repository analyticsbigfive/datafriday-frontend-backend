import { ref } from 'vue'

/**
 * Gère la capture d'écran (html2canvas), la copie presse-papiers et le
 * partage natif (Web Share API) pour le tableau de bord Analyse.
 *
 * @param {object} options
 * @param {import('vue').ComputedRef<string>} options.spaceName  nom du space pour nommer le fichier
 */
export function useAnalyseCapture({ spaceName }) {
  const copying = ref(false)
  const sharing = ref(false)
  const snackbar = ref(false)
  const snackbarText = ref('')
  const snackbarColor = ref('success')

  function notify(text, color = 'success') {
    snackbarText.value = text
    snackbarColor.value = color
    snackbar.value = true
  }

  async function captureAnalyse() {
    const target = document.getElementById('analyse-capture-root') || document.body
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: window.devicePixelRatio || 1,
      useCORS: true,
      logging: false,
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
        downloadBlob(blob, `${spaceName.value}-${Date.now()}.png`)
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
      const file = new File([blob], `${spaceName.value}-${Date.now()}.png`, { type: 'image/png' })
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
