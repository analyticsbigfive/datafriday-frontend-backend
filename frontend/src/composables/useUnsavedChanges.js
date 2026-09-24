// src/composables/useUnsavedChanges.js
// Modifications non enregistrées d'une fiche d'édition : même comportement que la
// fiche Menu Item (MenuItemCreateView) : un instantané de l'état chargé/enregistré,
// comparé à l'état courant. Tant que rien n'a changé, le bouton affiche « Fermer »,
// sinon « Annuler », et quitter demande confirmation (leaveDialog).
//
// Les fonctions prennent l'état en paramètre : la vue (Options API) garde la main sur
// ce qui compte comme « modifié » (p.ex. exclure un aperçu d'image).

import { ref } from 'vue'
import { leaveDialog } from '@/composables/useConfirmDialog'

export function useUnsavedChanges() {
  const savedSnapshot = ref(null)

  const serialize = (state) => JSON.stringify(state)

  /** Mémorise l'état de référence (après chargement ou enregistrement). */
  function takeSnapshot(state) {
    savedSnapshot.value = serialize(state)
  }

  /** true si l'état diffère de la référence. Aucune référence prise = pas modifié. */
  function isDirty(state) {
    if (savedSnapshot.value === null) return false
    return serialize(state) !== savedSnapshot.value
  }

  /**
   * Demande quoi faire des modifications en cours.
   * @returns {Promise<false|'leave'|'save'>} false = rester sur la fiche.
   */
  function askLeave(t) {
    return leaveDialog({
      title: t('menuItemCreate.unsavedTitle'),
      message: t('menuItemCreate.unsavedMessage'),
      leaveText: t('menuItemCreate.leaveWithoutSaving'),
      saveText: t('menuItemCreate.saveAndLeave'),
      cancelText: t('cancel'),
    })
  }

  return { savedSnapshot, takeSnapshot, isDirty, askLeave }
}
