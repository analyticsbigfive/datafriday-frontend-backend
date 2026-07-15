import { ref, computed } from 'vue'
import { getAllSpaces, createSpace } from '@/api/endpoints/space.api'
import {
  getLocationSpaceMappings,
  createLocationSpaceMapping,
  deleteLocationSpaceMapping,
  getIntegrationProgress
} from '@/api/endpoints/mapping.api'

export function useSpaceMapping() {
  const spaces = ref([])
  const mappings = ref([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref(null)
  const selectedSpaceId = ref(null)

  async function loadSpaces() {
    try {
      const result = await getAllSpaces()
      spaces.value = result?.data || result || []
    } catch (err) {
      console.error('[useSpaceMapping] loadSpaces error:', err)
      error.value = err.message
    }
  }

  async function loadMappings() {
    try {
      const result = await getLocationSpaceMappings()
      mappings.value = result?.data || result || []
    } catch (err) {
      console.error('[useSpaceMapping] loadMappings error:', err)
      error.value = err.message
    }
  }

  async function loadAll() {
    loading.value = true
    error.value = null
    try {
      await Promise.all([loadSpaces(), loadMappings()])
    } finally {
      loading.value = false
    }
  }

  function getMappingForLocation(locationId) {
    return mappings.value.find(m => m.weezeventLocationId === locationId)
  }

  function getSpaceForLocation(locationId) {
    const mapping = getMappingForLocation(locationId)
    if (!mapping) return null
    return spaces.value.find(s => s.id === mapping.spaceId)
  }

  async function mapLocationToSpace(locationId, spaceId) {
    saving.value = true
    error.value = null
    try {
      const result = await createLocationSpaceMapping(locationId, spaceId)
      await loadMappings()
      return result
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      saving.value = false
    }
  }

  async function unmapLocation(locationId) {
    saving.value = true
    try {
      await deleteLocationSpaceMapping(locationId)
      await loadMappings()
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      saving.value = false
    }
  }

  async function handleCreateSpace(spaceData) {
    saving.value = true
    try {
      const newSpace = await createSpace(spaceData)
      await loadSpaces()
      return newSpace
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      saving.value = false
    }
  }

  function suggestSpace(locationName) {
    if (!locationName || !spaces.value.length) return null

    let bestMatch = null
    let bestScore = 0

    for (const space of spaces.value) {
      const score = calculateSimilarity(
        locationName.toLowerCase(),
        space.name.toLowerCase()
      )
      if (score > bestScore && score > 0.4) {
        bestScore = score
        bestMatch = { space, score: Math.round(score * 100) }
      }
    }
    return bestMatch
  }

  function calculateSimilarity(a, b) {
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
          if (longer[i - 1] !== shorter[j - 1]) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
          }
          costs[j - 1] = lastValue
          lastValue = newValue
        }
      }
      if (i > 0) costs[shorter.length] = lastValue
    }
    return (longer.length - costs[shorter.length]) / longer.length
  }

  return {
    spaces,
    mappings,
    loading,
    saving,
    error,
    selectedSpaceId,
    loadAll,
    loadSpaces,
    loadMappings,
    getMappingForLocation,
    getSpaceForLocation,
    mapLocationToSpace,
    unmapLocation,
    handleCreateSpace,
    suggestSpace,
  }
}
