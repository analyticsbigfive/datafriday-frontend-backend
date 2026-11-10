<template>
  <button
    type="button"
    class="rct"
    :aria-expanded="expanded ? 'true' : 'false'"
    :aria-label="expanded ? t('srCollapseSection') : t('srExpandSection')"
    :title="expanded ? t('srCollapseSection') : t('srExpandSection')"
    @click.stop="$emit('toggle')"
  >
    <v-icon size="18">{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
  </button>
</template>

<script setup>
// Bouton de repli d'une section des colonnes de la page Commandes (retour Bertrand
// 2026-11-10). Présentation seule : le parent porte l'état et masque le corps.
import { useI18n } from '@/i18n/useI18n'

defineProps({ expanded: { type: Boolean, default: true } })
defineEmits(['toggle'])
const { t } = useI18n()
</script>

<style scoped>
.rct {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--sr-muted, #6b7280);
  cursor: pointer;
}
.rct:hover { background: rgba(var(--v-theme-on-surface), 0.06); color: var(--sr-text, #212121); }
.rct:focus-visible { outline: 2px solid var(--sr-primary, #ff3131); outline-offset: 2px; }
</style>
