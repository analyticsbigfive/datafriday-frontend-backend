// Machine à états des interactions du plan 2D (doc REFONTE_3D_BUILDER_V2 §4.3) :
//   idle → drawing (outil actif) | moving | resizing (poignée) — retour idle au pointerup.
// Le composable ne rend rien : il reçoit le store et expose l'état d'interaction
// (aperçu de dessin) + les handlers à brancher sur le SVG. Pendant un geste, seules
// des mutations LOCALES sont appliquées (rendu fluide) ; le commit (historique +
// autosave) part une seule fois, au pointerup.
import { reactive, computed } from 'vue'
import { DEFAULTS } from '../constants/elementTaxonomy'

export function usePlanInteractions(store, { svgRef, pxPerMeter, zoom }) {
  const interaction = reactive({
    mode: 'idle', // idle | drawing | moving | resizing
    draw: null, // { x0, y0, x1, y1 } en mètres
    elementId: null,
    handle: null, // se | sw | ne | nw
    start: null, // snapshot du geste (position pointeur + géométrie d'origine)
  })

  function toWorld(evt) {
    const svg = svgRef.value
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const factor = pxPerMeter.value * zoom.value
    return {
      x: (evt.clientX - rect.left) / factor,
      y: (evt.clientY - rect.top) / factor,
    }
  }

  const drawPreview = computed(() => {
    if (interaction.mode !== 'drawing' || !interaction.draw) return null
    const { x0, y0, x1, y1 } = interaction.draw
    return {
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      width: Math.abs(x1 - x0),
      depth: Math.abs(y1 - y0),
    }
  })

  // ── Fond du plan ────────────────────────────────────────────────────────────
  function onCanvasPointerDown(evt) {
    if (evt.button !== 0) return
    const pos = toWorld(evt)
    if (store.state.activeTool) {
      interaction.mode = 'drawing'
      interaction.draw = { x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y }
    } else {
      // Clic dans le vide sans outil : désélection.
      store.selectElement(null)
    }
    evt.currentTarget.setPointerCapture?.(evt.pointerId)
  }

  // ── Élément existant ────────────────────────────────────────────────────────
  function onElementPointerDown(evt, element) {
    // Un placeholder optimiste (création en vol) n'est pas encore adressable côté serveur.
    if (evt.button !== 0 || store.state.activeTool || element.pending) return
    evt.stopPropagation()
    store.selectElement(element.id)
    const pos = toWorld(evt)
    // Snapshot depuis le STORE (source de vérité), pas depuis la prop : le canvas
    // passe une copie CONTENUE dans la zone (rendu), qui peut différer du vrai x/y.
    const raw = store.state.elements[element.id] || element
    interaction.mode = 'moving'
    interaction.elementId = element.id
    interaction.start = {
      pointer: pos,
      x: raw.x,
      y: raw.y,
    }
    evt.currentTarget.ownerSVGElement?.setPointerCapture?.(evt.pointerId)
  }

  function onHandlePointerDown(evt, element, handle) {
    if (evt.button !== 0) return
    evt.stopPropagation()
    const pos = toWorld(evt)
    const raw = store.state.elements[element.id] || element
    interaction.mode = 'resizing'
    interaction.elementId = element.id
    interaction.handle = handle
    interaction.start = {
      pointer: pos,
      x: raw.x,
      y: raw.y,
      width: raw.width,
      depth: raw.depth,
    }
    evt.currentTarget.ownerSVGElement?.setPointerCapture?.(evt.pointerId)
  }

  // ── Mouvement ───────────────────────────────────────────────────────────────
  function onPointerMove(evt) {
    if (interaction.mode === 'idle') return
    const pos = toWorld(evt)

    if (interaction.mode === 'drawing') {
      interaction.draw.x1 = pos.x
      interaction.draw.y1 = pos.y
      return
    }

    const element = store.state.elements[interaction.elementId]
    if (!element) return
    const zone = store.state.zones[element.zoneId]
    const dx = pos.x - interaction.start.pointer.x
    const dy = pos.y - interaction.start.pointer.y

    if (interaction.mode === 'moving') {
      const x = clamp(interaction.start.x + dx, 0, (zone?.width ?? Infinity) - element.width)
      const y = clamp(interaction.start.y + dy, 0, (zone?.length ?? Infinity) - element.depth)
      store.patchElementLocal(element.id, { x: round2(x), y: round2(y) })
      return
    }

    if (interaction.mode === 'resizing') {
      const min = DEFAULTS.element.minDrawSizeM
      const s = interaction.start
      let { x, y, width, depth } = s
      if (interaction.handle.includes('e')) width = Math.max(min, s.width + dx)
      if (interaction.handle.includes('s')) depth = Math.max(min, s.depth + dy)
      if (interaction.handle.includes('w')) {
        width = Math.max(min, s.width - dx)
        x = s.x + (s.width - width)
      }
      if (interaction.handle.includes('n')) {
        depth = Math.max(min, s.depth - dy)
        y = s.y + (s.depth - depth)
      }
      store.patchElementLocal(element.id, {
        x: round2(x), y: round2(y), width: round2(width), depth: round2(depth),
      })
    }
  }

  // ── Fin de geste : commit unique ────────────────────────────────────────────
  async function onPointerUp() {
    const { mode, elementId, start } = interaction

    if (mode === 'drawing') {
      const rect = drawPreview.value
      interaction.mode = 'idle'
      interaction.draw = null
      if (rect && rect.width >= DEFAULTS.element.minDrawSizeM && rect.depth >= DEFAULTS.element.minDrawSizeM) {
        await store.createElementFromDraw(rect)
      }
      return
    }

    if ((mode === 'moving' || mode === 'resizing') && elementId) {
      const element = store.state.elements[elementId]
      if (element) {
        const previous = mode === 'moving'
          ? { x: start.x, y: start.y }
          : { x: start.x, y: start.y, width: start.width, depth: start.depth }
        const current = Object.fromEntries(Object.keys(previous).map((k) => [k, element[k]]))
        const changed = Object.keys(previous).some((k) => previous[k] !== current[k])
        if (changed) store.commitElementPatch(elementId, current, previous)
      }
    }

    interaction.mode = 'idle'
    interaction.elementId = null
    interaction.handle = null
    interaction.start = null
  }

  return { interaction, drawPreview, toWorld, onCanvasPointerDown, onElementPointerDown, onHandlePointerDown, onPointerMove, onPointerUp }
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max)
}

function round2(v) {
  return Math.round(v * 100) / 100
}
