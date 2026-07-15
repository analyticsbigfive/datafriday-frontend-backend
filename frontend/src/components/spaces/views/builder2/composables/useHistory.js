// Pile undo/redo — pattern Commande (doc REFONTE_3D_BUILDER_V2 §4.1).
// Chaque geste enregistré fournit ses deux sens : { label, undo(), redo() }.
// undo/redo ré-appliquent la mutation locale ET renvoient la mutation inverse à
// l'API via la MutationQueue (c'est la commande qui encapsule les deux).
// Cap à 50 commandes ; toute nouvelle commande vide la branche redo.
import { reactive, computed } from 'vue'

export function createHistory(cap = 50) {
  const state = reactive({ past: [], future: [], busy: false })

  function push(command) {
    state.past.push(command)
    if (state.past.length > cap) state.past.shift()
    state.future = []
  }

  async function undo() {
    if (state.busy || state.past.length === 0) return
    const command = state.past.pop()
    state.busy = true
    try {
      await command.undo()
      state.future.push(command)
    } finally {
      state.busy = false
    }
  }

  async function redo() {
    if (state.busy || state.future.length === 0) return
    const command = state.future.pop()
    state.busy = true
    try {
      await command.redo()
      state.past.push(command)
    } finally {
      state.busy = false
    }
  }

  function clear() {
    state.past = []
    state.future = []
  }

  return {
    push,
    undo,
    redo,
    clear,
    canUndo: computed(() => state.past.length > 0 && !state.busy),
    canRedo: computed(() => state.future.length > 0 && !state.busy),
    lastLabel: computed(() => state.past[state.past.length - 1]?.label || null),
  }
}
