// src/composables/useStorageQrSlug.js
//
// Slug du lien QR code (/login/pin/:slug) d'un stockage, pour sa carte d'inventaire
// (demande Bertrand 2026-10-08 : QR codes sur les espaces de stockage comme pour les
// PdV). Le plan de configuration ne porte pas le slug : une seule requête par
// espace, partagée par toutes les cartes stockage (cache module, requête en vol
// mutualisée). Un stockage absent de la réponse (créé depuis) relance une lecture.

import { computed, ref, unref, watch } from 'vue'
import { getStorageSlugs } from '@/api/endpoints/guestPinAdmin.api'

// spaceId -> ref({ [elementId]: slug })
const slugsBySpace = new Map()
// spaceId -> Promise en cours
const inflight = new Map()

function slugsRef(spaceId) {
  if (!slugsBySpace.has(spaceId)) slugsBySpace.set(spaceId, ref(null))
  return slugsBySpace.get(spaceId)
}

async function load(spaceId) {
  if (inflight.has(spaceId)) return inflight.get(spaceId)
  const run = getStorageSlugs(spaceId)
    .then((slugs) => { slugsRef(spaceId).value = slugs || {} })
    .catch((e) => {
      // Sans slug, la carte n'affiche simplement pas le bouton QR.
      console.warn('[inventory] slugs des stockages indisponibles:', e?.message)
      if (slugsRef(spaceId).value == null) slugsRef(spaceId).value = {}
    })
    .finally(() => inflight.delete(spaceId))
  inflight.set(spaceId, run)
  return run
}

/**
 * @param {import('vue').Ref<string|null>|(() => string|null)} spaceId null = pas de QR (droit absent)
 * @param {import('vue').Ref<string>|(() => string)} elementId
 */
export function useStorageQrSlug(spaceId, elementId) {
  const read = (src) => (typeof src === 'function' ? src() : unref(src))
  const slug = computed(() => {
    const sid = read(spaceId)
    if (!sid) return null
    return slugsRef(String(sid)).value?.[String(read(elementId))] ?? null
  })

  const refreshedFor = new Set()
  watch(
    () => [read(spaceId), read(elementId)],
    ([sid, eid]) => {
      if (!sid || !eid) return
      const key = String(sid)
      const current = slugsRef(key).value
      if (current == null) {
        load(key)
      } else if (!(String(eid) in current) && !refreshedFor.has(`${key}:${eid}`)) {
        refreshedFor.add(`${key}:${eid}`)
        load(key)
      }
    },
    { immediate: true },
  )

  return { slug }
}
