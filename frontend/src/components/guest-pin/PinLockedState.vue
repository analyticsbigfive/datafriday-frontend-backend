<template>
  <PinLoginShell :icon="XCircle" icon-color="#FF6E4A" :title="t('pinLoginLockedTitle')" :subtitle="t('pinLoginLockedMessage')">
    <div class="pin-locked__note">
      <Phone :size="18" color="#94a3b8" class="pin-locked__note-icon" />
      <p>{{ t('pinLoginLockedContact') }}</p>
    </div>
  </PinLoginShell>
</template>

<script>
import { XCircle, Phone } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import PinLoginShell from './PinLoginShell.vue';

export default {
  name: 'PinLockedState',
  components: { PinLoginShell, Phone },
  setup() {
    const { t } = useI18n();
    return { t, XCircle };
  },
};
</script>

<style scoped>
.pin-locked__note {
  width: 100%;
  padding: 14px 16px;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(51, 65, 85, 0.7);
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-align: left;
}

.pin-locked__note-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.pin-locked__note p {
  margin: 0;
  color: #94a3b8;
  font-size: 0.8125rem;
  line-height: 1.5;
}
</style>
