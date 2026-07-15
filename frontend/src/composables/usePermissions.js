import { computed } from 'vue'
import store from '@/store'

/**
 * Vérification des droits d'accès (RBAC) côté frontend.
 * Le rôle ADMIN bypass toujours (cf. auth.js getter `can`).
 */
export function usePermissions() {
  const can = (code) => !code || store.getters['auth/can'](code)
  const canAny = (codes = []) => codes.length === 0 || codes.some(can)
  const canAll = (codes = []) => codes.every(can)

  return {
    can,
    canAny,
    canAll,
    isAdmin: computed(() => store.getters['auth/isAdmin']),
    isOwner: computed(() => store.getters['auth/isOwner']),
    roleName: computed(() => store.getters['auth/userRole']),
  }
}
