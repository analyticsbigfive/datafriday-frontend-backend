import { computed, ref } from 'vue'
import { getPosHrPersons } from '@/api/endpoints/pos.api'

/**
 * Personnes RH actives du tenant, proposées comme responsable d'une caisse. Route dédiée
 * GET /pos/hr-persons, ouverte avec front.fb.pos (la route RH complète exige menu.hr.manage).
 * En cas de refus, la liste reste vide et la sélection passe en lecture seule.
 */
const persons = ref([])
const loaded = ref(false)
const forbidden = ref(false)
let inflight = null

export function toHrPersonOption(person) {
  const name = `${person.firstName || ''} ${person.lastName || ''}`.trim()
  return { value: person.id, title: name || person.id }
}

export function usePosHrPersons() {
  async function load() {
    // Stale-while-revalidate : la liste connue reste affichee, remplacee a la reponse.
    if (inflight) return inflight
    inflight = getPosHrPersons()
      .then((rows) => {
        persons.value = (Array.isArray(rows) ? rows : []).filter((p) => p.active !== false)
        forbidden.value = false
      })
      .then(() => {
        loaded.value = true
      })
      .catch((e) => {
        if (e?.response?.status === 403) {
          persons.value = []
          forbidden.value = true
          loaded.value = true
        }
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  const options = computed(() => persons.value.map(toHrPersonOption).sort((a, b) => a.title.localeCompare(b.title)))

  return { options, loaded, forbidden, load }
}
