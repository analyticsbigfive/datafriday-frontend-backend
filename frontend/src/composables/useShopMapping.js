import { ref } from 'vue'
import {
  getLocationShopMappings,
  bulkLocationShopMappings,
  deleteLocationShopMapping
} from '@/api/endpoints/mapping.api'
import { getSpaceConfigurations } from '@/api/endpoints/space.api'
import { getWeezeventLocations } from '@/api/endpoints/aggregation.api'

export function useShopMapping() {
  const locations = ref([])
  const elements = ref([])
  const configurations = ref([])
  const existingMappings = ref([])
  const localMappings = ref({}) // locationId (DB) → spaceElementId
  const loading = ref(false)
  const saving = ref(false)
  const error = ref(null)

  // locationId is now the integration instance id (used as context, not as a filter)
  async function loadData(integrationId, spaceId) {
    loading.value = true
    error.value = null
    try {
      const [locationsRes, configsRes, mappingsRes] = await Promise.all([
        getWeezeventLocations(integrationId), // scoped to this integration
        getSpaceConfigurations(spaceId),
        getLocationShopMappings()    // all existing location→element mappings (no locationId filter)
      ])

      locations.value = locationsRes?.data || locationsRes || []
      configurations.value = configsRes?.data || configsRes || []
      existingMappings.value = mappingsRes?.data || mappingsRes || []

      // Extract all elements from space configurations
      const allElements = []
      for (const config of configurations.value) {
        if (config.areas) {
          for (const area of config.areas) {
            if (area.elements) {
              for (const el of area.elements) {
                allElements.push({
                  id: el.id,
                  name: el.name,
                  configName: config.name,
                  areaName: area.name,
                })
              }
            }
          }
        }
      }
      elements.value = allElements

      // Initialize local mappings from existing records
      // weezeventLocationId now stores the location's DB id
      const map = {}
      for (const m of existingMappings.value) {
        map[m.weezeventLocationId] = m.spaceElementId
      }
      localMappings.value = map

      // Auto-match unmapped locations
      autoMatch()
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  function autoMatch() {
    for (const location of locations.value) {
      if (localMappings.value[location.id]) continue
      const match = findBestElementMatch(location.name)
      if (match) {
        localMappings.value[location.id] = match.id
      }
    }
  }

  function findBestElementMatch(locationName) {
    if (!locationName || !elements.value.length) return null
    const name = locationName.toLowerCase()

    let best = null
    let bestScore = 0

    for (const el of elements.value) {
      const elName = el.name.toLowerCase()
      // Simple inclusion check + Levenshtein
      let score = 0
      if (name.includes(elName) || elName.includes(name)) {
        score = 0.8
      } else {
        score = similarity(name, elName)
      }

      if (score > bestScore && score > 0.4) {
        bestScore = score
        best = { ...el, matchScore: Math.round(score * 100) }
      }
    }
    return best
  }

  function similarity(a, b) {
    if (a === b) return 1
    const longer = a.length > b.length ? a : b
    const shorter = a.length > b.length ? b : a
    if (longer.length === 0) return 1
    const costs = []
    for (let i = 0; i <= longer.length; i++) {
      let lastValue = i
      for (let j = 0; j <= shorter.length; j++) {
        if (i === 0) { costs[j] = j }
        else if (j > 0) {
          let newValue = costs[j - 1]
          if (longer[i - 1] !== shorter[j - 1])
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
          costs[j - 1] = lastValue
          lastValue = newValue
        }
      }
      if (i > 0) costs[shorter.length] = lastValue
    }
    return (longer.length - costs[shorter.length]) / longer.length
  }

  function updateMapping(locationId, elementId) {
    localMappings.value = { ...localMappings.value, [locationId]: elementId }
  }

  function getMappedCount() {
    return Object.values(localMappings.value).filter(Boolean).length
  }

  async function saveAll() {
    saving.value = true
    error.value = null
    try {
      const mappingsToSave = Object.entries(localMappings.value)
        .filter(([, elementId]) => elementId)
        .map(([locationId, elementId]) => ({
          weezeventLocationId: locationId,
          spaceElementId: elementId
        }))

      // Chunk saves to avoid oversized payloads
      const CHUNK_SIZE = 500
      for (let i = 0; i < mappingsToSave.length; i += CHUNK_SIZE) {
        await bulkLocationShopMappings(mappingsToSave.slice(i, i + CHUNK_SIZE))
      }
      return { count: mappingsToSave.length }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      saving.value = false
    }
  }

  return {
    locations,
    elements,
    configurations,
    existingMappings,
    localMappings,
    loading,
    saving,
    error,
    loadData,
    updateMapping,
    getMappedCount,
    saveAll,
    findBestElementMatch,
  }
}
