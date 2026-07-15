/**
 * i18n module - Centralized internationalization for the application
 * 
 * Usage in components:
 * 
 * import { t, getCurrentLocale, setCurrentLocale } from '@/i18n';
 * 
 * // In template
 * {{ t('supplierName') }}
 * 
 * // In script
 * const locale = getCurrentLocale();
 * setCurrentLocale('fr');
 */

export { 
  translations, 
  getCurrentLocale, 
  setCurrentLocale, 
  t, 
  getTranslations 
} from './translations';
