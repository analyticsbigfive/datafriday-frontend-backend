// API Builder v2 — contrat défini dans docs/REFONTE_3D_BUILDER_V2.md §3.
// Préfixe /builder-v2 le temps de la cohabitation avec le builder v1 : PATCH/DELETE
// /configurations/:id sont déjà pris par le contrôleur v1 (save-blob). Bascule sur
// les chemins nus en P4, à la dépose des routes v1.
// Mutations granulaires : 1 geste utilisateur = 1 petite requête idempotente.
// Les éléments portent un verrou optimiste par ligne (header If-Match: version).
import api from '../client'

// ─── Lecture (bootstrap, §3.1) ────────────────────────────────────────────────

/**
 * État complet du builder en 1 round-trip :
 * { space, zones: [{...zone, elements: [...]}], configurations: [...],
 *   memberships: [{ elementId, configIds }], usage?: [{ elementId, weezeventMapped, menuItemsCount }] }
 */
export async function getBuilderState(spaceId) {
  const response = await api.get(`/builder-v2/spaces/${spaceId}/state`)
  return response.data
}

// ─── Zones ────────────────────────────────────────────────────────────────────

export async function createZone(spaceId, payload) {
  const response = await api.post(`/builder-v2/spaces/${spaceId}/zones`, payload)
  return response.data
}

export async function updateZone(zoneId, patch) {
  const response = await api.patch(`/builder-v2/zones/${zoneId}`, patch)
  return response.data
}

export async function reorderZones(spaceId, orderedIds) {
  const response = await api.patch('/builder-v2/zones/reorder', { spaceId, orderedIds })
  return response.data
}

/**
 * Suppression consciente d'une zone : sans force, le backend répond 409 si elle
 * contient des éléments utilisés — { blockers } affiché par DeleteZoneDialog.
 * force=true après confirmation (la cascade délie mappings Weezevent et menus).
 */
export async function deleteZone(zoneId, { force = false } = {}) {
  const response = await api.delete(`/builder-v2/zones/${zoneId}`, { params: force ? { force: 'true' } : {} })
  return response.data
}

/** Duplique un étage (zone + éléments + adhésions, PAS les mappings) — parité v1. */
export async function duplicateZone(zoneId) {
  const response = await api.post(`/builder-v2/zones/${zoneId}/duplicate`)
  return response.data
}

// ─── Éléments ─────────────────────────────────────────────────────────────────

/** L'id est généré par le serveur et renvoyé dans la réponse — jamais d'id temporaire. */
export async function createElement(zoneId, payload) {
  const response = await api.post(`/builder-v2/zones/${zoneId}/elements`, payload)
  return response.data
}

/** PATCH partiel avec verrou optimiste : 409 si `version` a changé côté serveur. */
export async function patchElement(elementId, patch, version) {
  const response = await api.patch(`/builder-v2/elements/${elementId}`, patch, {
    headers: version != null ? { 'If-Match': String(version) } : {},
  })
  return response.data
}

/** Fin de drag multi-éléments : une seule transaction serveur. */
export async function patchElementsBatch(items) {
  const response = await api.patch('/builder-v2/elements/batch', { items })
  return response.data
}

export async function duplicateElement(elementId, opts = {}) {
  const response = await api.post(`/builder-v2/elements/${elementId}/duplicate`, opts)
  return response.data
}

/**
 * 409 si l'élément est utilisé (mapping Weezevent, menu items) — le corps du 409
 * contient { reasons } affiché par DeleteElementDialog. force=true après confirmation.
 */
export async function deleteElement(elementId, { force = false } = {}) {
  const response = await api.delete(`/builder-v2/elements/${elementId}`, { params: force ? { force: 'true' } : {} })
  return response.data
}

// ─── Sous-ressources d'élément (remplacement complet, diff côté serveur) ──────
// Scopées par CONFIG : passer la config active du builder — sans elle le backend
// retombe sur la 1re adhésion (arbitraire pour un élément partagé entre configs).

export async function putElementPerformance(elementId, performance, configId) {
  const response = await api.put(`/builder-v2/elements/${elementId}/performance`, performance, {
    params: configId ? { configId } : {},
  })
  return response.data
}

export async function putElementStaff(elementId, staff, configId) {
  const response = await api.put(`/builder-v2/elements/${elementId}/staff`, { staff }, {
    params: configId ? { configId } : {},
  })
  return response.data
}

// Postes obligatoires selon les sous-types F&B de l'élément + règles Sinking RH
// (2026-07-30) — auto-remplissage de la section Staff, voir StaffSection.vue.
export async function getElementStaffSuggestions(elementId, configId) {
  const response = await api.get(`/builder-v2/elements/${elementId}/staff-suggestions`, {
    params: configId ? { configId } : {},
  })
  return response.data
}

// Saisie manuelle "vendu/prévu" par Menu Item, scopée par config — source des associations
// Rôle↔MenuItem (11_RH_STAFFING.md §11.16), voir MenuItemSalesInputSection.vue.
export async function getElementMenuItemSalesInput(elementId, configId) {
  const response = await api.get(`/builder-v2/elements/${elementId}/menu-item-sales-input`, {
    params: configId ? { configId } : {},
  })
  return response.data
}

export async function putElementMenuItemSalesInput(elementId, rows, configId) {
  const response = await api.put(`/builder-v2/elements/${elementId}/menu-item-sales-input`, { rows }, {
    params: configId ? { configId } : {},
  })
  return response.data
}

export async function putElementInventory(elementId, inventory, configId) {
  const response = await api.put(`/builder-v2/elements/${elementId}/inventory`, { inventory }, {
    params: configId ? { configId } : {},
  })
  return response.data
}

// ─── Adhésions élément ↔ configuration (cœur du modèle v2) ───────────────────

/** Cocher une config = 1 INSERT (idempotent). */
export async function addMembership(configId, elementId) {
  const response = await api.post(`/builder-v2/configurations/${configId}/elements/${elementId}`)
  return response.data
}

/** Décocher = 1 DELETE. 409 si c'est la dernière adhésion de l'élément. */
export async function removeMembership(configId, elementId) {
  const response = await api.delete(`/builder-v2/configurations/${configId}/elements/${elementId}`)
  return response.data
}

// ─── Configurations ───────────────────────────────────────────────────────────

/** cloneFromConfigId : copie serveur des adhésions (1 transaction, instantané). */
export async function createConfiguration(spaceId, { name, cloneFromConfigId = null }) {
  const body = { name }
  if (cloneFromConfigId) body.cloneFromConfigId = cloneFromConfigId
  const response = await api.post(`/builder-v2/spaces/${spaceId}/configurations`, body)
  return response.data
}

/** Sémantique stricte : 404 si la configuration n'existe pas (pas d'upsert). */
export async function renameConfiguration(configId, name) {
  const response = await api.patch(`/builder-v2/configurations/${configId}`, { name })
  return response.data
}

/**
 * 409 si des éléments n'appartiendraient plus à aucune config. Le dialog propose alors
 * orphanPolicy: 'reassign' (+ reassignToConfigId) ou 'delete'.
 */
export async function deleteConfiguration(configId, { orphanPolicy = null, reassignToConfigId = null } = {}) {
  const params = {}
  if (orphanPolicy) params.orphanPolicy = orphanPolicy
  if (reassignToConfigId) params.reassignToConfigId = reassignToConfigId
  const response = await api.delete(`/builder-v2/configurations/${configId}`, { params })
  return response.data
}
