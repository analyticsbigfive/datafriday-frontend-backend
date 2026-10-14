/** Capture d'écran du rapport de comparaison (copie / partage). */

/** Id DOM de la racine capturée (ComparisonReport.vue). */
export const COMPARISON_CAPTURE_ROOT_ID = 'comparison-capture-root'

/**
 * Hook `onclone` de html2canvas : révèle dans le DOM cloné les blocs réservés à la capture
 * (`.cr__snap`, masqués à l'écran), par exemple la bande des 8 puces, qui vit dans l'en-tête du
 * drawer, hors de la racine capturée.
 * @param {Document} clonedDoc
 */
export function revealCaptureOnlyBlocks(clonedDoc) {
  clonedDoc
    .querySelectorAll(`#${COMPARISON_CAPTURE_ROOT_ID} .cr__snap`)
    .forEach((el) => { el.style.display = 'block' })
}
