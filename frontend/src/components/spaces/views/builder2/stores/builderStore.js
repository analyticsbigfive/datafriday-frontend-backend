// Store normalisé du Builder v2 (doc REFONTE_3D_BUILDER_V2 §4.2).
// Un seul flux de données : composants → actions du store → état réactif → rendu.
// Implémenté en composable réactif Vue natif (le projet n'embarque pas Pinia) —
// même forme normalisée que la doc : zones{}, elements{}, configs{}, memberships{}.
//
// Chaque action suit le même patron (doc §4.1) :
//   1. mutation optimiste de l'état ; 2. commande {undo, redo} dans l'historique ;
//   3. requête dans la MutationQueue (coalescée si géométrique, immédiate sinon).
import { reactive, computed } from 'vue'
import vuexStore from '@/store'
import * as api from '@/api/endpoints/builder-v2.api'
import { t } from '@/i18n'
import { createMutationQueue } from '../composables/useMutationQueue'
import { createHistory } from '../composables/useHistory'
import {
  toolOf, labelOf, normalizeType, buildTools, DEFAULTS, ZONE_KINDS,
} from '../constants/elementTaxonomy'

// CFG-2 Étape 5 : ce store n'est pas un composant Vue (composable réactif natif, doc §4.2) —
// import direct du store Vuex plutôt que useStore(), même motif que router/guards.js. Lecture
// synchrone au moment de l'appel (pas de computed caché ici) : suffisant, ce store n'a pas
// besoin de re-render sur un changement de département, contrairement aux composants d'affichage.
function currentTools() {
  return buildTools(vuexStore.getters['departments/departments'] || [])
}

const stores = new Map()

/** Un store par espace — survivant au keep-alive, réinitialisé par bootstrap(). */
export function getBuilderStore(spaceId) {
  if (!stores.has(spaceId)) stores.set(spaceId, createBuilderStore(spaceId))
  return stores.get(spaceId)
}

function createBuilderStore(spaceId) {
  const state = reactive({
    spaceId,
    space: null,
    zones: {}, // zoneId → Zone
    elements: {}, // elementId → SpaceElement (à plat, zoneId dedans)
    configs: {}, // configId → Configuration
    memberships: {}, // elementId → [configId] (adhésion EXPLICITE — plus de « vide = partout »)
    usage: {}, // elementId → { weezeventMapped, menuItemsCount } (servi par le bootstrap)

    activeConfigId: null,
    activeZoneId: null,
    selectedElementId: null,
    activeTool: null,
    activeSubtypes: {}, // toolType → [subtype]
    syncingMemberships: [], // clés `${elementId}:${configId}` (spinner par chip)

    loading: false,
    bootstrapped: false,
    busyCount: 0, // actions structurelles awaited en vol (zones, configs, duplications…)
    error: null, // erreur bloquante de bootstrap (backend v2 absent, 404…)
    toast: null, // { message, color } — consommé par BuilderPage
    isPlanFullscreen: false,
  })

  const queue = createMutationQueue()
  const history = createHistory(50)
  // Patches d'éléments accumulés entre deux flushs de la queue (coalescing SANS perte :
  // deux commits successifs sur le même élément fusionnent leurs champs).
  const pendingPatches = new Map()

  function notify(message, color = 'error') {
    state.toast = { message, color, at: Date.now() }
  }

  /**
   * Toute action structurelle awaited passe ici : le compteur alimente la barre
   * d'activité globale (BuilderWorkspace) — jamais de requête en vol sans loader visible.
   */
  async function withBusy(fn) {
    state.busyCount += 1
    try {
      return await fn()
    } finally {
      state.busyCount -= 1
    }
  }

  // ── Getters ──────────────────────────────────────────────────────────────────

  const zonesSorted = computed(() => {
    const rank = { [ZONE_KINDS.FLOOR]: 0, [ZONE_KINDS.FORECOURT]: 1, [ZONE_KINDS.EXTERNAL]: 2 }
    return Object.values(state.zones).sort((a, b) => {
      if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind]
      if (a.kind === ZONE_KINDS.FLOOR && a.level !== b.level) return b.level - a.level
      return (a.sortIndex ?? 0) - (b.sortIndex ?? 0)
    })
  })

  const configsSorted = computed(() =>
    Object.values(state.configs).sort((a, b) => {
      if (!!a.isSystem !== !!b.isSystem) return a.isSystem ? 1 : -1
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    }),
  )

  const activeZone = computed(() => state.zones[state.activeZoneId] || null)
  const activeConfig = computed(() => state.configs[state.activeConfigId] || null)
  const selectedElement = computed(() => state.elements[state.selectedElementId] || null)

  function isVisibleInActiveConfig(element) {
    if (!state.activeConfigId) return true
    const memberOf = state.memberships[element.id]
    // Fail open : un élément sans enregistrement d'adhésion (donnée incomplète) reste
    // visible plutôt que de disparaître silencieusement.
    if (!Array.isArray(memberOf)) return true
    return memberOf.includes(state.activeConfigId)
  }

  function elementsOfZone(zoneId) {
    return Object.values(state.elements).filter((e) => e.zoneId === zoneId)
  }

  function visibleElementsOfZone(zoneId) {
    return elementsOfZone(zoneId).filter(isVisibleInActiveConfig)
  }

  const visibleElements = computed(() =>
    Object.values(state.elements).filter(isVisibleInActiveConfig),
  )

  const activeConfigCapacity = computed(() =>
    visibleElements.value.reduce((sum, e) => sum + (Number(e.capacity) || 0), 0),
  )

  function elementUsage(elementId) {
    return state.usage[elementId] || { weezeventMapped: false, menuItemsCount: 0 }
  }

  /**
   * Count de menu items pour la CONFIG ACTIVE — c'est ce que les badges affichent
   * (un item vendu en config A seulement ne doit pas apparaître sous B).
   * `elementUsage().menuItemsCount` reste le count GLOBAL toutes configs : c'est lui
   * qui gouverne les dialogues de suppression (supprimer l'élément touche tout).
   */
  function elementMenuCountForActiveConfig(elementId) {
    const u = state.usage[elementId]
    if (!u) return 0
    if (u.menuCountsByConfig && state.activeConfigId) {
      return Number(u.menuCountsByConfig[state.activeConfigId]) || 0
    }
    // Ancien backend (pas de ventilation par config) : repli sur le global.
    return u.menuItemsCount || 0
  }

  // Une activité réseau quelconque est en cours : actions structurelles awaited,
  // (re)bootstrap, ou autosave (queue) — alimente la barre d'activité globale.
  const isBusy = computed(
    () => state.busyCount > 0 || state.loading || queue.status.value === 'saving',
  )

  // ── Bootstrap ────────────────────────────────────────────────────────────────

  async function bootstrap() {
    state.loading = true
    state.error = null
    try {
      const data = await api.getBuilderState(spaceId)
      hydrate(data)
      state.bootstrapped = true
    } catch (err) {
      state.error = err?.response?.status === 404
        ? t('b2ErrorApiUnavailable')
        : err?.response?.data?.message || err.message || t('b2ErrorLoadingGeneric')
    } finally {
      state.loading = false
    }
  }

  function hydrate(data) {
    state.space = data.space || null

    const zones = {}
    const elements = {}
    for (const zone of data.zones || []) {
      const { elements: zoneElements, ...zoneRow } = zone
      zones[zone.id] = normalizeZone(zoneRow)
      for (const el of zoneElements || []) {
        elements[el.id] = normalizeElement({ ...el, zoneId: zone.id })
      }
    }
    state.zones = zones
    state.elements = elements

    state.configs = Object.fromEntries((data.configurations || []).map((c) => [c.id, c]))

    const memberships = {}
    for (const m of data.memberships || []) {
      memberships[m.elementId] = [...(m.configIds || [])]
    }
    state.memberships = memberships

    state.usage = Object.fromEntries(
      (data.usage || []).map((u) => [u.elementId, {
        weezeventMapped: !!u.weezeventMapped,
        weezeventLocationName: u.weezeventLocationName || null,
        menuItemsCount: Number(u.menuItemsCount) || 0,
        menuCountsByConfig: u.menuCountsByConfig || null,
      }]),
    )

    ensureSelections()
  }

  function ensureSelections() {
    if (!state.configs[state.activeConfigId]) {
      state.activeConfigId = configsSorted.value.find((c) => !c.isSystem)?.id
        || configsSorted.value[0]?.id || null
    }
    if (!state.zones[state.activeZoneId]) {
      state.activeZoneId = zonesSorted.value[0]?.id || null
    }
    if (state.selectedElementId && !state.elements[state.selectedElementId]) {
      state.selectedElementId = null
    }
  }

  // ── Sélections & outils ──────────────────────────────────────────────────────

  function setActiveConfig(configId) {
    state.activeConfigId = configId
    if (selectedElement.value && !isVisibleInActiveConfig(selectedElement.value)) {
      state.selectedElementId = null
    }
  }

  function setActiveZone(zoneId) {
    state.activeZoneId = zoneId
  }

  function selectElement(elementId) {
    state.selectedElementId = elementId
    if (elementId) {
      state.activeTool = null
      const el = state.elements[elementId]
      if (el && el.zoneId !== state.activeZoneId) state.activeZoneId = el.zoneId
    }
  }

  function setActiveTool(tool) {
    state.activeTool = state.activeTool === tool ? null : tool
    if (state.activeTool) state.selectedElementId = null
  }

  function setSubtypes(tool, values) {
    state.activeSubtypes = { ...state.activeSubtypes, [tool]: values }
  }

  // ── Éléments ─────────────────────────────────────────────────────────────────

  function mergeElement(fresh) {
    if (!fresh?.id) return
    state.elements[fresh.id] = normalizeElement({
      ...(state.elements[fresh.id] || {}),
      ...fresh,
    })
  }

  function patchElementLocal(elementId, patch) {
    const el = state.elements[elementId]
    if (el) state.elements[elementId] = { ...el, ...patch }
  }

  function queueElementPatch(elementId) {
    queue.push(async () => {
      const patch = pendingPatches.get(elementId)
      pendingPatches.delete(elementId)
      if (!patch || Object.keys(patch).length === 0) return
      const el = state.elements[elementId]
      if (!el) return // supprimé entre-temps
      const fresh = await api.patchElement(elementId, patch, el.version)
      // La réponse est l'ÉCHO de ce qu'on vient d'envoyer (tout écart concurrent aurait
      // fait 409 via If-Match) : ne fusionner QUE la version. Réécrire la géométrie
      // écraserait un geste local plus récent le temps de l'aller-retour réseau —
      // l'élément sautait en arrière après chaque déplacement rapproché.
      if (fresh?.version !== undefined) patchElementLocal(elementId, { version: fresh.version })
    }, {
      key: `el:${elementId}`,
      onError: (err) => {
        if (err?.response?.status === 409) {
          notify(t('b2ToastElementChangedElsewhere'), 'warning')
          bootstrap()
        } else {
          notify(err?.response?.data?.message || t('b2ToastSaveElementFailed'))
        }
      },
    })
  }

  /**
   * Commit d'un patch d'élément : mutation locale + historique + autosave coalescé.
   * `previous` doit contenir les MÊMES clés que `patch` avec les valeurs d'origine.
   */
  function commitElementPatch(elementId, patch, previous, label = 'Modification') {
    const apply = (values) => {
      patchElementLocal(elementId, values)
      pendingPatches.set(elementId, { ...(pendingPatches.get(elementId) || {}), ...values })
      queueElementPatch(elementId)
    }
    apply(patch)
    history.push({
      label,
      undo: () => apply(previous),
      redo: () => apply(patch),
    })
  }

  /**
   * Création OPTIMISTE : l'élément apparaît INSTANTANÉMENT (placeholder local,
   * `pending: true`, non interactif) ; la requête part en parallèle et le vrai id
   * serveur remplace le placeholder à la réponse. Jamais d'id temporaire envoyé au
   * serveur (doc §3.2) — le placeholder ne vit que dans le store.
   */
  function createElementFromDraw(rect) {
    const tool = toolOf(state.activeTool, currentTools())
    if (!tool || !state.activeZoneId) return
    const zoneId = state.activeZoneId
    const sameType = Object.values(state.elements)
      .filter((e) => normalizeType(e.type) === tool.type).length
    const payload = {
      name: `${tool.label} ${sameType + 1}`,
      type: tool.type,
      subtypes: state.activeSubtypes[tool.type] || [],
      x: rect.x,
      y: rect.y,
      width: rect.width,
      depth: rect.depth,
      height3d: DEFAULTS.element.height3d,
      rotation: 0,
      // L'élément naît membre de la config active (doc §2.3) — jamais « partout ».
      configIds: state.activeConfigId ? [state.activeConfigId] : [],
    }

    const localId = `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    state.elements[localId] = normalizeElement({ ...payload, id: localId, zoneId, pending: true })
    state.memberships[localId] = [...payload.configIds]

    queue.push(
      async () => {
        const created = await api.createElement(zoneId, payload)
        const element = created.element || created
        delete state.elements[localId]
        delete state.memberships[localId]
        mergeElement({ ...element, zoneId })
        state.memberships[element.id] = [...(created.configIds || payload.configIds)]
        // Sélectionne le vrai élément si rien d'autre n'a été sélectionné entre-temps.
        if (!state.selectedElementId || state.selectedElementId === localId) {
          selectElement(element.id)
        }
      },
      {
        onError: (err) => {
          delete state.elements[localId]
          delete state.memberships[localId]
          if (state.selectedElementId === localId) state.selectedElementId = null
          const status = err?.response?.status
          notify(err?.response?.data?.message || t('b2ToastCreateElementFailed'))
          // 400/404 = état local périmé (config/zone supprimée ailleurs) → resync auto.
          if (status === 400 || status === 404) bootstrap()
        },
      },
    )
  }

  function rotateSelected(stepDeg = 15) {
    const el = selectedElement.value
    if (!el) return
    const previous = { rotation: el.rotation || 0 }
    const patch = { rotation: ((el.rotation || 0) + stepDeg) % 360 }
    commitElementPatch(el.id, patch, previous, 'Rotation')
  }

  async function duplicateElement(elementId) {
    try {
      const res = await withBusy(() => api.duplicateElement(elementId, { offsetX: 1, offsetY: 1 }))
      const element = res.element || res
      mergeElement(element)
      state.memberships[element.id] = [...(res.configIds || state.memberships[elementId] || [])]
      selectElement(element.id)
    } catch (err) {
      notify(err?.response?.data?.message || t('b2ToastDuplicateFailed'))
    }
  }

  /**
   * Suppression : le backend renvoie 409 { reasons } si l'élément est utilisé (mapping
   * Weezevent, menus). L'appelant (DeleteElementDialog) rappelle avec force=true après
   * confirmation explicite. Jamais de suppression silencieuse (doc §1.2).
   */
  async function removeElement(elementId, { force = false } = {}) {
    await withBusy(() => api.deleteElement(elementId, { force })) // laisse remonter le 409 au dialog
    delete state.elements[elementId]
    delete state.memberships[elementId]
    delete state.usage[elementId]
    if (state.selectedElementId === elementId) state.selectedElementId = null
  }

  // ── Adhésions élément ↔ configuration ────────────────────────────────────────

  function toggleMembership(elementId, configId, checked) {
    const current = state.memberships[elementId] || []
    if (!checked && current.length <= 1) {
      notify(t('b2ToastLastConfigForElement'), 'warning')
      return
    }
    const apply = (on) => {
      const ids = state.memberships[elementId] || []
      state.memberships[elementId] = on
        ? [...new Set([...ids, configId])]
        : ids.filter((id) => id !== configId)
      const syncKey = `${elementId}:${configId}`
      state.syncingMemberships = [...state.syncingMemberships, syncKey]
      queue.push(
        () => (on ? api.addMembership(configId, elementId) : api.removeMembership(configId, elementId)),
        {
          onSuccess: () => {
            state.syncingMemberships = state.syncingMemberships.filter((k) => k !== syncKey)
          },
          onError: (err) => {
            state.syncingMemberships = state.syncingMemberships.filter((k) => k !== syncKey)
            // Rollback optimiste
            const rollback = state.memberships[elementId] || []
            state.memberships[elementId] = on
              ? rollback.filter((id) => id !== configId)
              : [...new Set([...rollback, configId])]
            notify(err?.response?.data?.message || t('b2ToastUpdateConfigsFailed'))
          },
        },
      )
    }
    apply(checked)
    history.push({
      label: 'Configurations',
      undo: () => apply(!checked),
      redo: () => apply(checked),
    })
  }

  // ── Zones ────────────────────────────────────────────────────────────────────

  async function addZone(kind, { isBasement = false } = {}) {
    const floors = Object.values(state.zones).filter((z) => z.kind === ZONE_KINDS.FLOOR)
    let payload
    if (kind === ZONE_KINDS.FLOOR) {
      const level = isBasement
        ? Math.min(0, ...floors.map((z) => z.level)) - 1
        : floors.length ? Math.max(...floors.map((z) => z.level)) + 1 : 0
      // Dimensions héritées de l'étage adjacent dans l'empilement (étage le plus
      // haut pour un étage, le plus bas pour un sous-sol) — DEFAULTS seulement
      // pour le tout premier : un « Étage 1 » doit naître aux dimensions du RDC.
      const reference = floors.length
        ? floors.reduce((best, z) => ((isBasement ? z.level < best.level : z.level > best.level) ? z : best))
        : null
      const dims = reference
        ? {
            width: reference.width ?? DEFAULTS.floor.width,
            length: reference.length ?? DEFAULTS.floor.length,
            height: reference.height ?? DEFAULTS.floor.height,
          }
        : DEFAULTS.floor
      payload = {
        kind, level,
        name: isBasement
          ? `${t('b2ZoneKindBasement')} ${Math.abs(level)}`
          : level === 0 ? t('b2ZoneKindGroundFloor') : `${t('b2ZoneKindFloor')} ${level}`,
        ...dims,
      }
    } else if (kind === ZONE_KINDS.FORECOURT) {
      payload = { kind, level: 0, name: t('b2ZoneKindForecourt'), ...DEFAULTS.forecourt }
    } else {
      payload = { kind, level: 0, name: t('b2ZoneKindExternal'), ...DEFAULTS.external }
    }
    try {
      const zone = await withBusy(() => api.createZone(spaceId, payload))
      state.zones[zone.id] = normalizeZone(zone)
      setActiveZone(zone.id)
      return zone
    } catch (err) {
      notify(err?.response?.data?.message || t('b2ToastCreateZoneFailed'))
      return null
    }
  }

  /** Mutation locale pure (pendant un geste — drag iso) : pas d'historique ni d'autosave. */
  function patchZoneLocal(zoneId, patch) {
    const zone = state.zones[zoneId]
    if (zone) state.zones[zoneId] = { ...zone, ...patch }
  }

  function commitZonePatch(zoneId, patch, previous, label = 'Zone') {
    const apply = (values) => {
      patchZoneLocal(zoneId, values)
      queue.push(() => api.updateZone(zoneId, values), {
        key: `zone:${zoneId}`,
        onError: (err) => notify(err?.response?.data?.message || t('b2ToastSaveZoneFailed')),
      })
    }
    apply(patch)
    history.push({ label, undo: () => apply(previous), redo: () => apply(patch) })
  }

  /**
   * Réordonne les étages via drag & drop du panneau. Les « emplacements » (les levels
   * existants : 2, 1, 0, -1…) restent fixes ; on réassigne quelle zone occupe quel
   * level selon le nouvel ordre → un swap Floor 1 ↔ Floor 2 échange leurs levels.
   * Se répercute automatiquement sur le panneau (tri par level) ET sur IsoView
   * (empilement 3D par level). Persistance ATOMIQUE via l'API reorder (évite la
   * collision de contrainte d'unicité de level lors d'un échange). Rollback si erreur.
   */
  async function reorderZones(draggedId, targetId, insertBefore = true) {
    if (!draggedId || draggedId === targetId) return
    const floors = zonesSorted.value.filter((z) => z.kind === ZONE_KINDS.FLOOR)
    const fromIdx = floors.findIndex((z) => z.id === draggedId)
    if (fromIdx === -1 || !floors.some((z) => z.id === targetId)) return

    // Nouvel ordre d'affichage (haut → bas).
    const reordered = [...floors]
    const [moved] = reordered.splice(fromIdx, 1)
    let insertIdx = reordered.findIndex((z) => z.id === targetId)
    if (!insertBefore) insertIdx += 1
    reordered.splice(insertIdx, 0, moved)

    // Réassigne les levels existants selon le nouvel ordre (optimiste, local).
    const levels = floors.map((z) => z.level) // décroissant, ex : [2, 1, 0, -1]
    const prev = {}
    floors.forEach((z) => { prev[z.id] = z.level })
    let changed = false
    reordered.forEach((z, i) => {
      if (z.level !== levels[i]) { patchZoneLocal(z.id, { level: levels[i] }); changed = true }
    })
    if (!changed) return

    try {
      await withBusy(() => api.reorderZones(spaceId, reordered.map((z) => z.id)))
    } catch (err) {
      for (const id in prev) patchZoneLocal(id, { level: prev[id] }) // rollback
      notify(err?.response?.data?.message || t('b2ToastSaveZoneFailed'))
    }
  }

  /** Duplication d'un étage (parité v1) : clone serveur zone + éléments + adhésions. */
  async function duplicateZone(zoneId) {
    try {
      const res = await withBusy(() => api.duplicateZone(zoneId))
      const { elements: zoneElements, ...zoneRow } = res.zone
      state.zones[zoneRow.id] = normalizeZone(zoneRow)
      for (const el of zoneElements || []) {
        state.elements[el.id] = normalizeElement({ ...el, zoneId: zoneRow.id })
      }
      for (const m of res.memberships || []) {
        state.memberships[m.elementId] = [...(m.configIds || [])]
      }
      setActiveZone(zoneRow.id)
    } catch (err) {
      notify(err?.response?.data?.message || t('b2ToastDuplicateZoneFailed'))
    }
  }

  async function removeZone(zoneId, opts = {}) {
    await withBusy(() => api.deleteZone(zoneId, opts)) // 409 → DeleteZoneDialog (zone avec éléments utilisés)
    for (const el of elementsOfZone(zoneId)) {
      delete state.elements[el.id]
      delete state.memberships[el.id]
      delete state.usage[el.id]
    }
    delete state.zones[zoneId]
    ensureSelections()
  }

  // ── Configurations ───────────────────────────────────────────────────────────

  async function createConfig({ name, cloneFromConfigId = null }) {
    const config = await withBusy(() => api.createConfiguration(spaceId, { name, cloneFromConfigId }))
    // Le clone copie des adhésions côté serveur : on recharge l'état (1 requête)
    // plutôt que de reconstituer les memberships à la main.
    await bootstrap()
    state.activeConfigId = config.id
    return config
  }

  async function renameConfig(configId, name) {
    const updated = await withBusy(() => api.renameConfiguration(configId, name))
    if (state.configs[configId]) {
      state.configs[configId] = { ...state.configs[configId], name: updated?.name || name }
    }
  }

  async function removeConfig(configId, opts = {}) {
    await withBusy(() => api.deleteConfiguration(configId, opts)) // 409 → DeleteConfigDialog
    await bootstrap()
  }

  // ── Cycle de vie ─────────────────────────────────────────────────────────────

  /** beforeunload : seul cas restant de garde de sortie (doc WF-04). */
  function hasPendingWork() {
    return queue.hasPendingWork.value
  }

  return {
    state,
    // getters
    zonesSorted,
    configsSorted,
    activeZone,
    activeConfig,
    selectedElement,
    visibleElements,
    activeConfigCapacity,
    elementsOfZone,
    visibleElementsOfZone,
    isVisibleInActiveConfig,
    elementUsage,
    elementMenuCountForActiveConfig,
    isBusy,
    // actions
    bootstrap,
    notify,
    setActiveConfig,
    setActiveZone,
    selectElement,
    setActiveTool,
    setSubtypes,
    patchElementLocal,
    commitElementPatch,
    createElementFromDraw,
    rotateSelected,
    duplicateElement,
    removeElement,
    toggleMembership,
    addZone,
    patchZoneLocal,
    commitZonePatch,
    reorderZones,
    duplicateZone,
    removeZone,
    createConfig,
    renameConfig,
    removeConfig,
    hasPendingWork,
    // infra
    queue,
    history,
  }
}

// ── Normalisation des entités reçues du serveur ────────────────────────────────

function normalizeZone(zone) {
  return {
    sortIndex: 0,
    level: 0,
    height: zone.kind === 'FLOOR' ? DEFAULTS.floor.height : 0,
    geometry: null,
    ...zone,
  }
}

function normalizeElement(el) {
  return {
    subtypes: [],
    rotation: 0,
    height3d: DEFAULTS.element.height3d,
    version: 0,
    ...el,
    type: normalizeType(el.type),
  }
}
