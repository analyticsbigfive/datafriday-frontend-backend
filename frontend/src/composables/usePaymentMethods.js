import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { POS_PAYMENT_KINDS_KNOWN } from '@/api/endpoints/pos.contracts'

/** Clé i18n du libellé d'une catégorie connue (cash -> paymentMethodKindCash). */
export function paymentKindKey(kind) {
  return `paymentMethodKind${String(kind).charAt(0).toUpperCase()}${String(kind).slice(1)}`
}

/**
 * Gestion du référentiel « Moyens de paiement » (écran Configuration). Les catégories (`kind`)
 * sont une liste ouverte : les valeurs connues ne sont que des suggestions.
 */
export function usePaymentMethods() {
  const store = useStore()
  const { t } = useI18n()
  const error = ref('')

  const methods = computed(() => store.getters['paymentMethods/paymentMethods'])
  const loading = computed(() => store.state.paymentMethods.fetching)

  const messageOf = (e, fallbackKey) => e?.response?.data?.message || e?.message || t(fallbackKey)

  /** Libellé affichable d'une catégorie : traduit si connue, sinon la valeur brute. */
  function kindLabel(kind) {
    const key = paymentKindKey(kind)
    const label = t(key)
    return label === key ? kind : label
  }

  /** Suggestions de catégories (valeurs de la liste ouverte), libellés traduits. */
  const kindSuggestions = computed(() => POS_PAYMENT_KINDS_KNOWN.map((kind) => ({ title: kindLabel(kind), value: kind })))

  async function load(force = false) {
    error.value = ''
    try {
      await store.dispatch('paymentMethods/fetchList', { force })
    } catch (e) {
      error.value = messageOf(e, 'paymentMethodLoadError')
    }
  }

  /** Crée ou met à jour ; rejette avec un message lisible pour que le formulaire l'affiche. */
  async function save(id, payload) {
    try {
      return id
        ? await store.dispatch('paymentMethods/update', { id, payload })
        : await store.dispatch('paymentMethods/create', payload)
    } catch (e) {
      throw new Error(messageOf(e, 'paymentMethodSaveError'))
    }
  }

  async function setActive(method, active) {
    error.value = ''
    try {
      await store.dispatch('paymentMethods/update', { id: method.id, payload: { active } })
    } catch (e) {
      error.value = messageOf(e, 'paymentMethodSaveError')
    }
  }

  async function remove(method) {
    try {
      await store.dispatch('paymentMethods/remove', method.id)
    } catch (e) {
      throw new Error(messageOf(e, 'paymentMethodDeleteError'))
    }
  }

  return { methods, loading, error, kindSuggestions, kindLabel, load, save, setActive, remove }
}
