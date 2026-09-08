<template>
  <PinLoginShell :icon="Clock" icon-color="#94a3b8" :title="t('pinLoginInactiveTitle')" :subtitle="t('pinLoginInactiveMessage')">
    <div class="pin-inactive__note">
      <p>{{ t('pinLoginInactiveContact') }}</p>
    </div>
  </PinLoginShell>
</template>

<script>
import { Clock } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import PinLoginShell from './PinLoginShell.vue';

export default {
  name: 'PinInactiveState',
  components: { PinLoginShell },
  setup() {
    const { t } = useI18n();
    return { t, Clock };
  },
};
</script>

<style scoped>
.pin-inactive__note {
  width: 100%;
  padding: 14px 16px;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(51, 65, 85, 0.7);
  text-align: left;
}

.pin-inactive__note p {
  margin: 0;
  color: #94a3b8;
  font-size: 0.8125rem;
  line-height: 1.5;
}
</style>
