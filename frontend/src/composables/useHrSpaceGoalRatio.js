// Sauvegarde du Goal/TPE et du Staff/Responsable de zone d'UN espace (ligne mono-espace
// dédiée — cf. utils/hrSettings.js). Logique partagée entre HrSettingsView (carte Edit)
// et EventPredictStaffSection (popup réglages inline, RH-2) : les deux ouvrent le même
// HrSpaceEditDrawer.vue et doivent persister son submit() de la même façon.
import { useStore } from 'vuex'
import { findMonoSpaceLine } from '@/utils/hrSettings'

export function useHrSpaceGoalRatio() {
  const store = useStore()

  async function upsertMono(kind, lines, spaceId, value) {
    const mono = findMonoSpaceLine(lines, spaceId)
    const valueKey = kind === 'goal' ? 'goalPerTpe' : 'staffPerZoneManager'
    const createAction = kind === 'goal' ? 'createGoal' : 'createRatio'
    const updateAction = kind === 'goal' ? 'updateGoal' : 'updateRatio'
    const removeAction = kind === 'goal' ? 'removeGoal' : 'removeRatio'

    if (value == null) {
      if (mono) await store.dispatch(`hrSettings/${removeAction}`, mono.id)
      return
    }
    if (mono) {
      await store.dispatch(`hrSettings/${updateAction}`, { id: mono.id, [valueKey]: value })
    } else {
      await store.dispatch(`hrSettings/${createAction}`, { [valueKey]: value, allSpaces: false, spaceIds: [spaceId] })
    }
  }

  /** payload = { goalPerTpe, staffPerZoneManager } — sortie de HrSpaceEditDrawer @submit. */
  async function saveSpaceGoalRatio(spaceId, payload) {
    await store.dispatch('hrSettings/fetchAll')
    await upsertMono('goal', store.getters['hrSettings/goals'], spaceId, payload.goalPerTpe)
    await upsertMono('staff', store.getters['hrSettings/staffRatios'], spaceId, payload.staffPerZoneManager)
  }

  return { saveSpaceGoalRatio }
}
