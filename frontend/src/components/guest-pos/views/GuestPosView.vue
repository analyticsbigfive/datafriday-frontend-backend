<template>
  <div class="guest-pos" @click="menuOpen = false">
    <GuestPosHeader
      :pdv-name="session.pdvName.value"
      :event-name="session.eventName.value"
      :sync-state="network.state.value"
      :sync-label="network.label.value"
      :menu-open="menuOpen"
      @toggle-menu="toggleMenu"
    >
      <template #menu>
        <GuestPosMenu
          v-if="menuOpen"
          :vendor-name="session.vendorName.value"
          :is-fullscreen="fullscreen.isFullscreen.value"
          :fullscreen-supported="fullscreen.supported.value"
          @click.stop
          @history="openModal('history')"
          @closing="openModal('closing')"
          @toggle-fullscreen="onToggleFullscreen"
        />
      </template>
    </GuestPosHeader>

    <GuestPosLoadState v-if="!catalog.loaded.value" :error="catalog.loadError.value" @retry="catalog.load" @leave="onLeave" />

    <div v-else class="guest-pos__body">
      <GuestPosCategoryRail :categories="catalog.categories.value" :selected-id="catalog.selectedCategoryId.value" @select="catalog.select" />
      <div class="guest-pos__products">
        <GuestPosProductGrid :tiles="catalog.tiles.value" @add="catalog.add" />
        <GuestPosSaleBanner />
      </div>
      <GuestPosTicketPanel @open-split="openModal('split')" />
    </div>

    <GuestPosSplitDialog v-if="modal === 'split'" @close="closeModal" />
    <GuestPosHistoryDialog v-else-if="modal === 'history'" @close="closeModal" />
    <GuestPosClosingDialog v-else-if="modal === 'closing'" @close="closeModal" @leave="onLeave" />
  </div>
</template>

<script setup>
// Caisse plein écran du vendeur (route guest-pos). Assemble les blocs ; chaque bloc vit dans son
// propre fichier et passe par un composable useGuestPos* pour parler au store guestPos.
import { onMounted, ref } from 'vue'
import { useGuestPosCatalog } from '@/composables/useGuestPosCatalog'
import { useGuestPosFullscreen } from '@/composables/useGuestPosFullscreen'
import { useGuestPosNetwork } from '@/composables/useGuestPosNetwork'
import { useGuestPosSession } from '@/composables/useGuestPosSession'
import GuestPosHeader from '../GuestPosHeader.vue'
import GuestPosMenu from '../GuestPosMenu.vue'
import GuestPosLoadState from '../GuestPosLoadState.vue'
import GuestPosCategoryRail from '../GuestPosCategoryRail.vue'
import GuestPosProductGrid from '../GuestPosProductGrid.vue'
import GuestPosSaleBanner from '../GuestPosSaleBanner.vue'
import GuestPosTicketPanel from '../GuestPosTicketPanel.vue'
import GuestPosSplitDialog from '../dialogs/GuestPosSplitDialog.vue'
import GuestPosHistoryDialog from '../dialogs/GuestPosHistoryDialog.vue'
import GuestPosClosingDialog from '../dialogs/GuestPosClosingDialog.vue'

const catalog = useGuestPosCatalog()
const fullscreen = useGuestPosFullscreen()
const network = useGuestPosNetwork()
const session = useGuestPosSession()

const menuOpen = ref(false)
const modal = ref(null) // 'history' | 'split' | 'closing' | null

const toggleMenu = () => {
  menuOpen.value = !menuOpen.value
}
const openModal = (name) => {
  menuOpen.value = false
  modal.value = name
}
const closeModal = () => {
  modal.value = null
}
const onToggleFullscreen = async () => {
  menuOpen.value = false
  await fullscreen.toggle()
}
const onLeave = async () => {
  modal.value = null
  await session.leave()
}

onMounted(catalog.load)
</script>

<style scoped>
.guest-pos {
  --pos-accent: #D63031;
  --pos-accent-soft: #FFF5F5;
  --pos-bg: #F5F5F5;
  --pos-surface: #FFFFFF;
  --pos-border: #E5E7EB;
  --pos-border-strong: #D1D5DB;
  --pos-text: #212121;
  --pos-muted: #6B7280;
  --pos-ok: #16A34A;
  --pos-warn: #B45309;
  --pos-warn-bg: #FFFBEB;
  --pos-danger: #DC2626;

  position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column; overflow: hidden;
  background: var(--pos-bg); color: var(--pos-text); font-family: var(--font-ui); font-size: var(--fs-md);
  touch-action: manipulation;
}
.guest-pos__body { flex: 1; min-height: 0; display: flex; }
.guest-pos__products { flex: 1; min-width: 0; padding: 16px; display: flex; flex-direction: column; position: relative; }
</style>
