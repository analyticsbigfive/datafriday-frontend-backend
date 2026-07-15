// Amorçage du builder : bootstrap au montage + garde beforeunload limitée au SEUL
// cas restant — une file d'autosave non vide (doc WF-04). Le changement d'espace est
// géré par remontage (BuilderPage rend BuilderWorkspace avec :key="spaceId").
import { onMounted, onBeforeUnmount } from 'vue'

export function useBuilderBootstrap(store) {
  function handleBeforeUnload(event) {
    if (store.hasPendingWork()) {
      event.preventDefault()
      event.returnValue = ''
    }
  }

  onMounted(() => {
    // TOUJOURS resynchroniser au montage : le store survit à la navigation (Map par
    // espace) et les configs/éléments peuvent avoir changé ailleurs (builder v1, autre
    // onglet, Data Integration). Si déjà hydraté, c'est un refresh en arrière-plan
    // (1 requête) — le plein-écran de chargement ne s'affiche qu'au premier montage.
    if (!store.state.loading) store.bootstrap()
    window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })
}
