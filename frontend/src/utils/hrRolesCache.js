// Cache mémoire (durée de vie de l'onglet) pour getHrRoles()/getHrSinkingRules() — plusieurs
// sections de l'inspecteur Builder (StaffSection.vue, StaffingInputsSection.vue) ont besoin des
// mêmes données RH pour le même élément sans se coordonner entre elles ; sans ce partage, chacune
// appelait l'API indépendamment à son montage (2 requêtes identiques par ouverture d'écran).
// Volontairement PAS de TTL (contrairement au pattern Vuex 15 min du reste du projet) : ces deux
// composants restent montés tant qu'on navigue entre éléments de type staffé (shop/hospitality/…),
// donc le fetch initial suffit pour la durée d'une session d'édition — cf. trou de rafraîchissement
// croisé déjà documenté (créer un rôle/une règle dans un autre onglet n'invalide pas ce cache).
import { getHrRoles, getHrSinkingRules } from '@/api/endpoints/hr.api'

let rolesPromise = null
let sinkingRulesPromise = null

export function fetchHrRolesCached() {
  if (!rolesPromise) {
    rolesPromise = getHrRoles().catch((e) => { rolesPromise = null; throw e })
  }
  return rolesPromise
}

export function fetchHrSinkingRulesCached() {
  if (!sinkingRulesPromise) {
    sinkingRulesPromise = getHrSinkingRules().catch((e) => { sinkingRulesPromise = null; throw e })
  }
  return sinkingRulesPromise
}

// Utilisé après une création/modification de rôle ou de règle Sinking depuis le Builder lui-même
// (aucun appelant actuel — prévu pour si un futur écran RH inline invalide ce cache explicitement).
export function invalidateHrRolesCache() {
  rolesPromise = null
  sinkingRulesPromise = null
}
