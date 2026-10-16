<template>
  <div class="pos-qr">
    <button type="button" class="pos-qr__btn" :title="t('posShowQr')" :aria-label="t('posShowQr')" @click="qrOpen = true">
      <v-icon size="18">mdi-qrcode</v-icon>
    </button>

    <GuestPinQrDialog v-model="qrOpen" :slug="slug" :element-name="name" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import GuestPinQrDialog from '@/components/guest-pin-manage/dialogs/GuestPinQrDialog.vue'

// QR code de la caisse d'un PdV (/login/pin/:slug). Il s'affiche dans la fenêtre existante des accès
// invités (logo, lien, copie du lien, impression). Utilisable avant le démarrage de la caisse, pour
// imprimer le QR à l'avance.
defineProps({
  slug: { type: String, default: '' }, // PosPdvRow.qrSlug
  name: { type: String, default: '' }, // nom du PdV, titre de la fiche QR
})

const { t } = useI18n()
const qrOpen = ref(false)
</script>

<style scoped>
.pos-qr {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pos-qr__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border: 1px solid #d1d5db;
  border-radius: 20px;
  background: var(--fb-surface, #ffffff);
  color: #374151;
  cursor: pointer;
}
.pos-qr__btn:hover {
  border-color: var(--fb-primary, #d63031);
  color: var(--fb-primary, #d63031);
}
.pos-qr__btn:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
</style>
