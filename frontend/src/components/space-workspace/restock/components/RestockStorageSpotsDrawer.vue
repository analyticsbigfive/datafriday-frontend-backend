<template>
  <StorageSpotsDrawer
    :model-value="modelValue"
    :product-name="product?.name || ''"
    :products="product ? [{ name: product.name, marketPriceId: product.marketPriceId || '' }] : []"
    :reference="product?.reference || product?.name || ''"
    :space-id="spaceId"
    :space-name="spaceName"
    :read-only="!canEdit"
    :is-dark="isDark"
    initial-tab="storages"
    @update:model-value="onToggle"
  />
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useStore } from 'vuex'
import StorageSpotsDrawer from '@/components/menu-fb/views/storage/drawers/StorageSpotsDrawer.vue'

// Enveloppe du drawer Stockage pour la vue Commande : même droit que la page Stockage
// (space.edit, sinon lecture seule), thème lu comme la page Stockage. À la fermeture,
// émet `closed` (après enregistrement) pour que la vue recharge l'inventaire (tampons, réassort, résumé).
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** { name, marketPriceId, reference } */
  product: { type: Object, default: null },
  spaceId: { type: String, default: '' },
  spaceName: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'closed'])
const store = useStore()

const canEdit = computed(() => !!store.getters['auth/can']('space.edit'))

const theme = ref(localStorage.getItem('datafriday:theme') || localStorage.getItem('appTheme') || 'light')
const isDark = computed(() => theme.value === 'dark' || theme.value === 'dataFridayDark')
const onTheme = (e) => { theme.value = e.detail?.theme || 'light' }
window.addEventListener('theme-changed', onTheme)
onBeforeUnmount(() => window.removeEventListener('theme-changed', onTheme))

// Le drawer se ferme avant d'avoir fini d'enregistrer, puis vide le cache stockage de l'espace
// (storageInventory/invalidate) une fois les écritures faites. On émet `closed` à ce moment-là,
// sinon la vue relirait un état antérieur aux dernières saisies.
const cachedEntry = computed(() => store.state.storageInventory?.bySpace?.[String(props.spaceId)])
watch(cachedEntry, (entry, prev) => {
  if (!entry && prev && props.spaceId) emit('closed')
})

function onToggle(v) {
  emit('update:modelValue', v)
}
</script>
