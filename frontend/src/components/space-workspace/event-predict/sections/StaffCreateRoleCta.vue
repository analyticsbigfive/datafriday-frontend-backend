<template>
  <span class="scr-cta">
    <button type="button" class="scr-btn" @click="open">
      <v-icon size="15" class="mr-1">mdi-plus</v-icon>
      {{ t('epsCreateRoleCta') }}
    </button>
    <HrRoleFormDrawer
      v-model="drawerOpen"
      mode="create"
      :initial="null"
      :suppliers="suppliers"
      :spaces="spaces"
      :position-names="positionNames"
      @saved="$emit('saved')"
    />
  </span>
</template>

<script setup>
import { ref } from 'vue'
import { t } from '@/i18n'
import * as hrApi from '@/utils/hrApi'
import { getSpacesLight } from '@/api/endpoints/space.api'
import HrRoleFormDrawer from '@/components/hr/drawers/HrRoleFormDrawer.vue'

// Aucun rôle ne sert l'espace de l'event : propose de le créer via le tiroir RH existant
// (le rôle doit être lié à une agence qui dessert l'espace pour apparaître ici).
defineEmits(['saved'])

const drawerOpen = ref(false)
const suppliers = ref([])
const spaces = ref([])
const positionNames = ref([])

async function open() {
  const [supplierRows, nameRows, spaceRows] = await Promise.all([
    hrApi.getAllHRSuppliers().catch(() => []),
    hrApi.getAllPositionNames().catch(() => []),
    getSpacesLight().catch(() => []),
  ])
  suppliers.value = Array.isArray(supplierRows) ? supplierRows : []
  positionNames.value = Array.isArray(nameRows) ? nameRows : []
  spaces.value = Array.isArray(spaceRows) ? spaceRows : []
  drawerOpen.value = true
}
</script>

<style scoped>
/* Même rendu que le bouton « Régénérer » voisin (eps-generate-btn--ghost). */
.scr-btn {
  display: inline-flex; align-items: center; min-height: 30px; padding: 0 16px;
  border: 1.5px solid rgba(255, 49, 49, 0.32); border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-primary-soft, #fff5f5); color: #ff3131;
  font-size: 0.8125rem; font-weight: 700; cursor: pointer; transition: all 0.15s;
}
.scr-btn:hover { border-color: #ff3131; background: #ff3131; color: #fff; }
</style>
