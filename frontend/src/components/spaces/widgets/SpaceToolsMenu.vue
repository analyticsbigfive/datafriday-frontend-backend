<template>
  <v-menu v-if="tools.length" location="bottom end" offset="6">
    <template #activator="{ props: menuProps }">
      <button
        v-bind="menuProps"
        type="button"
        class="stm-btn"
        :title="t('spaceCardTools')"
        :aria-label="t('spaceCardTools')"
        @click.stop
      >
        <Menu :size="14" />
      </button>
    </template>

    <v-list density="compact" class="stm-list">
      <v-list-item
        v-for="tool in tools"
        :key="tool.value"
        :title="tool.label"
        @click="goTo(tool)"
      >
        <template #prepend>
          <v-icon size="18" color="primary">{{ tool.icon }}</v-icon>
        </template>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script setup>
// Menu hamburger de la carte espace : mêmes outils que le sélecteur d'outils du workspace
// (Analyse, Logistique, Inventaire...), filtrés par permission, avec accès direct à la page.
import { computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { Menu } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { clearDemoMode } from '@/utils/demoMode'
import { safePush } from '@/utils/chunkReload'
import { filterToolboxItems, resolveToolLocation } from '@/composables/useWorkspaceToolbox'

const props = defineProps({
  spaceId: { type: [String, Number], default: null },
})

const store = useStore()
const router = useRouter()
const { t } = useI18n()

const tools = computed(() => filterToolboxItems(store.getters['auth/can'], t))

function goTo(tool) {
  if (!props.spaceId) return
  // Choix explicite d'un vrai espace : purge un flag démo collé (cf. SpaceItem.goToAnalyse).
  clearDemoMode()
  safePush(router, resolveToolLocation(tool, props.spaceId))
}
</script>

<style scoped>
.stm-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(255, 255, 255, .9);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #374151;
  transition: background .15s, color .15s, transform .1s;
}
.stm-btn:hover { background: #fff; color: #ff3131; transform: scale(1.08); }

.v-theme--dataFridayDark .stm-btn { background: rgba(30, 41, 59, .9); color: #cbd5e1; }
.v-theme--dataFridayDark .stm-btn:hover { background: #0f172a; color: #ff3131; }
</style>
