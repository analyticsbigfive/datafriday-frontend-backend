// API RH — fournisseurs (agences), rôles métier (« positions »), personnes
// internes et import one-shot localStorage. Persistance backend (module NestJS
// features/hr/), gardé par `menu.hr.manage`. Réponses liste : { data: [...] }.
// ⚠️ Sans rapport avec les rôles de permissions utilisateurs (features/roles/).
import api from '../client'

// ── Suppliers (agences) ───────────────────────────────────────────────────────

export async function getHrSuppliers() {
  try {
    const res = await api.get('/hr/suppliers')
    return res.data?.data ?? []
  } catch (error) {
    console.error('[HR API] Error fetching suppliers:', error)
    throw error
  }
}

export async function createHrSupplier(payload) {
  try {
    const res = await api.post('/hr/suppliers', payload)
    return res.data
  } catch (error) {
    console.error('[HR API] Error creating supplier:', error)
    throw error
  }
}

export async function updateHrSupplier(id, payload) {
  try {
    const res = await api.patch(`/hr/suppliers/${id}`, payload)
    return res.data
  } catch (error) {
    console.error(`[HR API] Error updating supplier ${id}:`, error)
    throw error
  }
}

export async function deleteHrSupplier(id) {
  try {
    const res = await api.delete(`/hr/suppliers/${id}`)
    return res.data
  } catch (error) {
    console.error(`[HR API] Error deleting supplier ${id}:`, error)
    throw error
  }
}

// ── Roles (« positions ») ─────────────────────────────────────────────────────

export async function getHrRoles() {
  try {
    const res = await api.get('/hr/roles')
    return res.data?.data ?? []
  } catch (error) {
    console.error('[HR API] Error fetching roles:', error)
    throw error
  }
}

export async function createHrRole(payload) {
  try {
    const res = await api.post('/hr/roles', payload)
    return res.data
  } catch (error) {
    console.error('[HR API] Error creating role:', error)
    throw error
  }
}

export async function updateHrRole(id, payload) {
  try {
    const res = await api.patch(`/hr/roles/${id}`, payload)
    return res.data
  } catch (error) {
    console.error(`[HR API] Error updating role ${id}:`, error)
    throw error
  }
}

export async function deleteHrRole(id) {
  try {
    const res = await api.delete(`/hr/roles/${id}`)
    return res.data
  } catch (error) {
    console.error(`[HR API] Error deleting role ${id}:`, error)
    throw error
  }
}

// ── Persons (internes CDI/CDD) ────────────────────────────────────────────────

export async function getHrPersons({ roleId, contractType } = {}) {
  try {
    const res = await api.get('/hr/persons', { params: { roleId, contractType } })
    return res.data?.data ?? []
  } catch (error) {
    console.error('[HR API] Error fetching persons:', error)
    throw error
  }
}

export async function createHrPerson(payload) {
  try {
    const res = await api.post('/hr/persons', payload)
    return res.data
  } catch (error) {
    console.error('[HR API] Error creating person:', error)
    throw error
  }
}

export async function updateHrPerson(id, payload) {
  try {
    const res = await api.patch(`/hr/persons/${id}`, payload)
    return res.data
  } catch (error) {
    console.error(`[HR API] Error updating person ${id}:`, error)
    throw error
  }
}

export async function deleteHrPerson(id) {
  try {
    const res = await api.delete(`/hr/persons/${id}`)
    return res.data
  } catch (error) {
    console.error(`[HR API] Error deleting person ${id}:`, error)
    throw error
  }
}

// ── Sinking rules (STF-2 : dotation conditionnelle par rôle × sous-type FNB) ──

export async function getHrSinkingRules({ roleId } = {}) {
  try {
    const res = await api.get('/hr/sinking-rules', { params: { roleId } })
    return res.data?.data ?? []
  } catch (error) {
    console.error('[HR API] Error fetching sinking rules:', error)
    throw error
  }
}

export async function createHrSinkingRule(payload) {
  try {
    const res = await api.post('/hr/sinking-rules', payload)
    return res.data
  } catch (error) {
    console.error('[HR API] Error creating sinking rule:', error)
    throw error
  }
}

export async function updateHrSinkingRule(id, payload) {
  try {
    const res = await api.patch(`/hr/sinking-rules/${id}`, payload)
    return res.data
  } catch (error) {
    console.error(`[HR API] Error updating sinking rule ${id}:`, error)
    throw error
  }
}

export async function deleteHrSinkingRule(id) {
  try {
    const res = await api.delete(`/hr/sinking-rules/${id}`)
    return res.data
  } catch (error) {
    console.error(`[HR API] Error deleting sinking rule ${id}:`, error)
    throw error
  }
}

// ── Import one-shot localStorage → BD (spec §1.4) ────────────────────────────

export async function importHrFromLocalStorage(payload) {
  try {
    const res = await api.post('/hr/import', payload)
    return res.data
  } catch (error) {
    console.error('[HR API] Error importing localStorage data:', error)
    throw error
  }
}
