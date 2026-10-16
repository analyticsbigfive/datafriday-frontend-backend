import { reactive, ref, unref } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { confirmDialog } from '@/composables/useConfirmDialog'

/** URL de connexion invité de la caisse d'un PdV (QR du PdV), ouverte dans un nouvel onglet. */
export function posCashierUrl(qrSlug, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  return `${origin}/login/pin/${qrSlug}`
}

/**
 * Actions sur les caisses : ▶ / ■ par PdV et pour tous, nouveau PIN, responsable RH, ouverture
 * de la caisse. Chaque appel passe par le store ; les erreurs remontent dans `notice`.
 * @param {{ spaceId: import('vue').Ref<string>|string, eventId: import('vue').Ref<string>|string }} target
 */
export function usePosPdvActions(target) {
  const store = useStore()
  const { t } = useI18n()
  const working = reactive({}) // elementId -> true pendant un appel
  const bulkWorking = ref(false)
  const notice = ref('')

  const scope = (extra = {}) => ({ spaceId: unref(target.spaceId), eventId: unref(target.eventId), ...extra })
  const messageOf = (e) => e?.response?.data?.message || e?.message || t('posActionError')

  async function runOne(elementId, action) {
    working[elementId] = true
    try {
      await store.dispatch(action, scope({ elementId }))
    } catch (e) {
      notice.value = messageOf(e)
    } finally {
      working[elementId] = false
    }
  }

  const startPdv = (elementId) => runOne(elementId, 'pos/startPdv')
  const stopPdv = (elementId) => runOne(elementId, 'pos/stopPdv')
  const togglePdv = (pdv) => (pdv.status === 'inactive' ? startPdv(pdv.elementId) : stopPdv(pdv.elementId))

  async function resetPin(pdv) {
    const ok = await confirmDialog({
      title: t('posResetPinTitle'),
      message: t('posResetPinMessage').replace('{name}', pdv.name),
      confirmText: t('posResetPinConfirm'),
      cancelText: t('cancel'),
      icon: 'mdi-key-change',
    })
    if (ok) await runOne(pdv.elementId, 'pos/resetPin')
  }

  async function runBulk(action) {
    bulkWorking.value = true
    try {
      const result = await store.dispatch(action, scope())
      if (result?.failures?.length) {
        notice.value = t('posBulkPartial').replace('{count}', String(result.failures.length))
      }
    } catch (e) {
      notice.value = messageOf(e)
    } finally {
      bulkWorking.value = false
    }
  }
  const startAll = () => runBulk('pos/startAll')
  const stopAll = () => runBulk('pos/stopAll')

  async function setResponsible(pdv, hrPersonId, hrPersonName) {
    working[pdv.elementId] = true
    try {
      await store.dispatch('pos/setResponsible', scope({ elementId: pdv.elementId, hrPersonId, hrPersonName }))
    } catch (e) {
      notice.value = messageOf(e)
    } finally {
      working[pdv.elementId] = false
    }
  }

  /** Caisse du PdV dans un nouvel onglet (plein écran géré par l'écran de la caisse). */
  function openCashier(pdv) {
    if (!pdv?.qrSlug || typeof window === 'undefined') return
    window.open(posCashierUrl(pdv.qrSlug), '_blank', 'noopener')
  }

  return { working, bulkWorking, notice, togglePdv, resetPin, startAll, stopAll, setResponsible, openCashier }
}
