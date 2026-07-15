/**
 * Vue composable for i18n
 * Provides reactive locale and translation function
 * 
 * Usage in Vue components:
 * 
 * import { useI18n } from '@/i18n/useI18n';
 * 
 * export default {
 *   setup() {
 *     const { t, locale, setLocale } = useI18n();
 *     return { t, locale, setLocale };
 *   }
 * }
 */

import { ref, onMounted, onBeforeUnmount } from 'vue';
import { getCurrentLocale, setCurrentLocale, t as translate } from './translations';

export function useI18n() {
  const locale = ref(getCurrentLocale());

  const handleLocaleChange = (event) => {
    locale.value = event.detail.locale;
  };

  onMounted(() => {
    window.addEventListener('locale-changed', handleLocaleChange);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('locale-changed', handleLocaleChange);
  });

  const t = (key) => {
    return translate(key, locale.value);
  };

  const setLocale = (newLocale) => {
    if (setCurrentLocale(newLocale)) {
      locale.value = newLocale;
    }
  };

  return {
    locale,
    t,
    setLocale,
  };
}
