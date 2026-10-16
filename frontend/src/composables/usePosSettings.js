import { computed, ref, unref } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'

/** Valeurs par défaut quand le serveur n'a pas encore de réglage pour l'évènement. */
export const POS_SETTINGS_DEFAULTS = {
  paymentMethodIds: [],
  promosEnabled: true,
  cancelEnabled: true,
  lowStockUnits: 5,
  tipsEnabled: false,
}

/** Corps complet envoyé au serveur (PUT settings) : réglages courants + modification. */
export function buildSettingsPayload(current, patch = {}) {
  const merged = { ...POS_SETTINGS_DEFAULTS, ...(current || {}), ...patch }
  return {
    paymentMethodIds: [...(merged.paymentMethodIds || [])],
    promosEnabled: !!merged.promosEnabled,
    cancelEnabled: !!merged.cancelEnabled,
    lowStockUnits: Math.max(0, Math.min(9999, Math.round(Number(merged.lowStockUnits) || 0))),
    tipsEnabled: !!merged.tipsEnabled,
  }
}

/**
 * Nouvelle sélection de moyens de paiement après un clic. Liste vide côté serveur = tous les
 * moyens actifs ; on renvoie donc [] quand tout est coché, et on refuse de décocher le dernier
 * moyen (une caisse sans moyen d'encaisser n'a pas de sens).
 * @returns {string[]|null} null = changement refusé
 */
export function nextPaymentSelection(currentIds, activeIds, toggledId) {
  const selected = new Set(currentIds.length ? currentIds : activeIds)
  if (selected.has(toggledId)) selected.delete(toggledId)
  else selected.add(toggledId)
  if (selected.size === 0) return null
  const next = activeIds.filter((id) => selected.has(id))
  return next.length === activeIds.length ? [] : next
}

/**
 * Réglages de caisse de l'évènement affiché. Chaque changement est envoyé tout de suite (PUT
 * complet) et affiché en optimiste ; en cas d'erreur l'affichage revient à l'état du serveur.
 * @param {{ spaceId: import('vue').Ref<string>|string, eventId: import('vue').Ref<string>|string }} target
 */
export function usePosSettings(target) {
  const store = useStore()
  const { t } = useI18n()
  const pending = ref(null)
  const saving = ref(false)
  const notice = ref('')

  const server = computed(() => store.getters['pos/settings'])
  const effective = computed(() => ({ ...POS_SETTINGS_DEFAULTS, ...(server.value || {}), ...(pending.value || {}) }))

  const methods = computed(() => store.getters['paymentMethods/paymentMethods'])
  const activeMethods = computed(() => methods.value.filter((m) => m.active))
  const selectedIds = computed(() =>
    effective.value.paymentMethodIds.length ? effective.value.paymentMethodIds : activeMethods.value.map((m) => m.id)
  )

  async function loadMethods() {
    try {
      await store.dispatch('paymentMethods/fetchList')
    } catch (e) {
      notice.value = e?.response?.data?.message || t('paymentMethodLoadError')
    }
  }

  async function save(patch) {
    const payload = buildSettingsPayload(effective.value, patch)
    pending.value = payload
    saving.value = true
    notice.value = ''
    try {
      await store.dispatch('pos/saveSettings', {
        spaceId: unref(target.spaceId),
        eventId: unref(target.eventId),
        settings: payload,
      })
    } catch (e) {
      notice.value = e?.response?.data?.message || e?.message || t('posSettingsSaveError')
    } finally {
      pending.value = null
      saving.value = false
    }
  }

  function toggleMethod(id) {
    const next = nextPaymentSelection(
      effective.value.paymentMethodIds,
      activeMethods.value.map((m) => m.id),
      id
    )
    if (next === null) {
      notice.value = t('posSettingsKeepOneMethod')
      return
    }
    return save({ paymentMethodIds: next })
  }

  return { settings: effective, methods: activeMethods, allMethods: methods, selectedIds, saving, notice, loadMethods, save, toggleMethod }
}
