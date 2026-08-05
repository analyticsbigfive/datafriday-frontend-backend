// HR API utilities — MIGRÉ localStorage → backend (spec §1.4, branche feat/Hr).
//
// Les signatures historiques sont conservées pour ne pas casser
// HrSuppliersView / HrPositionsView : mêmes noms, mêmes formes d'objets
// (supplier { id, name, email, phone, contactName, picture, spaceIds, departments },
//  position { id, supplierId, positionName, sector, ratePerHour }).
// RH-5 (2026-07-30) : `sectors` renommé `departments` (BD HrSupplier.departments).
// La persistance passe par api/endpoints/hr.api.js (tables HrSupplier / HrRole).
//
// Import one-shot : au premier chargement, si des données existent encore en
// localStorage, elles sont poussées via POST /hr/import (refusé si la BD n'est
// pas vide), puis les clés localStorage sont purgées. Une seule tentative
// (flag HR_MIGRATION_FLAG) pour ne pas boucler.
//
// POSITION_NAMES_KEY (autocomplete du champ « Position Name ») reste local :
// pure commodité d'UI, aucune donnée métier.

import {
  getHrSuppliers,
  createHrSupplier,
  updateHrSupplier,
  deleteHrSupplier,
  getHrRoles,
  createHrRole,
  updateHrRole,
  deleteHrRole,
  importHrFromLocalStorage,
} from '@/api/endpoints/hr.api'

const HR_SUPPLIERS_KEY = 'hr_suppliers'
const STAFF_POSITIONS_KEY = 'staff_positions'
const POSITION_NAMES_KEY = 'position_names'
const HR_MIGRATION_FLAG = 'hr_localstorage_migrated'

// CFG-2 Étape 4 : shim legacy pour les positions à l'ancienne forme (`sector`, sans
// `.department`) — ne sert que les données archivées pré-refonte du drawer RH (le flux normal
// envoie toujours `.department` directement, déjà résolu). Doit désormais retourner un CODE
// Department stable ('shop', pas 'F&B') : le backend rejette un libellé brut depuis cette étape.
// Carte figée intentionnellement (pas de lecture du store `departments` ici, fonction pure
// synchrone) — les 4 libellés legacy qu'elle couvre sont clos, n'évolueront plus.
const SECTOR_TO_DEPARTMENT_CODE = {
  'F&B': 'shop',
  Merchandising: 'merchshop',
  Hospitality: 'hospitality',
  Entertainment: 'entertainment',
  Merch: 'merchshop',
}
function toDepartment(sector) {
  return SECTOR_TO_DEPARTMENT_CODE[sector] || 'shop'
}

// ── Mappings BD ↔ formes legacy des vues ─────────────────────────────────────

function supplierFromDb(s) {
  return {
    id: s.id,
    name: s.name,
    email: s.email || '',
    phone: s.tel || '',
    contactName: s.contact || '',
    picture: s.picture || '',
    spaceIds: s.spaceIds || [],
    spaces: s.spaceIds || [], // certains écrans legacy lisent `spaces`
    departments: s.departments || [],
  }
}

function supplierToDb(supplier) {
  return {
    name: supplier.name,
    contact: supplier.contactName || null,
    email: supplier.email || null,
    tel: supplier.phone || null,
    picture: supplier.picture || null,
    departments: supplier.departments || [],
    spaceIds: supplier.spaceIds || supplier.spaces || [],
  }
}

function positionFromDb(role) {
  return {
    id: role.id,
    supplierId: (role.supplierIds && role.supplierIds[0]) || '',
    positionName: role.name,
    sector: role.department,
    ratePerHour: role.rate,
    // champs enrichis (utilisés par le nouveau HrRoleFormDrawer)
    department: role.department,
    contractType: role.contractType,
    rateType: role.rateType,
    rate: role.rate,
    fnbCategories: role.fnbCategories || [],
    algoKey: role.algoKey,
    supplierIds: role.supplierIds || [],
  }
}

function positionToDb(position) {
  // Forme legacy (positionName + supplierId + ratePerHour) → rôle AGENCY/HOURLY.
  // Le nouveau drawer envoie directement la forme riche (department, contractType…).
  if (position.department || position.contractType) {
    return {
      department: position.department || toDepartment(position.sector),
      name: position.name || position.positionName,
      contractType: position.contractType || null,
      rateType: position.rateType || null,
      rate: position.rate ?? null,
      fnbCategories: position.fnbCategories || [],
      algoKey: position.algoKey || null,
      supplierIds: position.supplierIds || [],
    }
  }
  return {
    department: toDepartment(position.sector),
    name: position.positionName,
    contractType: position.supplierId ? 'AGENCY' : 'OTHER',
    rateType: position.supplierId ? 'HOURLY' : null,
    rate: position.supplierId ? (position.ratePerHour ?? null) : null,
    fnbCategories: [],
    algoKey: null,
    supplierIds: position.supplierId ? [position.supplierId] : [],
  }
}

// ── Import one-shot localStorage → BD ────────────────────────────────────────

let migrationPromise = null

function readLocal(key) {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

async function maybeMigrateLocalStorage() {
  if (localStorage.getItem(HR_MIGRATION_FLAG)) return
  if (migrationPromise) return migrationPromise
  migrationPromise = (async () => {
    const suppliers = readLocal(HR_SUPPLIERS_KEY)
    const positions = readLocal(STAFF_POSITIONS_KEY)
    if (!suppliers.length && !positions.length) {
      localStorage.setItem(HR_MIGRATION_FLAG, '1')
      return
    }
    try {
      await importHrFromLocalStorage({ suppliers, positions })
      localStorage.removeItem(HR_SUPPLIERS_KEY)
      localStorage.removeItem(STAFF_POSITIONS_KEY)
      localStorage.setItem(HR_MIGRATION_FLAG, '1')
      console.info('[HR] Données localStorage importées en BD puis purgées.')
    } catch (error) {
      // 400 = la BD n'est pas vide : on ne réessaie plus, on garde les clés
      // locales en lecture seule à titre d'archive.
      if (error?.response?.status === 400) {
        localStorage.setItem(HR_MIGRATION_FLAG, '1')
        console.warn('[HR] Import localStorage refusé (BD non vide) — clés conservées.')
      } else {
        migrationPromise = null // erreur réseau : on retentera au prochain appel
        throw error
      }
    }
  })()
  return migrationPromise
}

// ── HR Suppliers API (signatures historiques) ────────────────────────────────

export async function getAllHRSuppliers() {
  try {
    await maybeMigrateLocalStorage()
    const rows = await getHrSuppliers()
    return rows.map(supplierFromDb)
  } catch (error) {
    console.error('Failed to load HR suppliers:', error)
    return []
  }
}

export async function createHRSupplier(supplier) {
  try {
    const created = await createHrSupplier(supplierToDb(supplier))
    return supplierFromDb(created)
  } catch (error) {
    console.error('Failed to create HR supplier:', error)
    throw error
  }
}

export async function updateHRSupplier(supplier) {
  try {
    const updated = await updateHrSupplier(supplier.id, supplierToDb(supplier))
    return supplierFromDb(updated)
  } catch (error) {
    console.error('Failed to update HR supplier:', error)
    throw error
  }
}

export async function deleteHRSupplier(id) {
  try {
    await deleteHrSupplier(id)
  } catch (error) {
    console.error('Failed to delete HR supplier:', error)
    throw error
  }
}

// ── Staff Positions API (signatures historiques — table HrRole) ─────────────

export async function getAllStaffPositions() {
  try {
    await maybeMigrateLocalStorage()
    const rows = await getHrRoles()
    return rows.map(positionFromDb)
  } catch (error) {
    console.error('Failed to load staff positions:', error)
    return []
  }
}

export async function createStaffPosition(position) {
  try {
    const created = await createHrRole(positionToDb(position))
    return positionFromDb(created)
  } catch (error) {
    console.error('Failed to create staff position:', error)
    throw error
  }
}

export async function updateStaffPosition(position) {
  try {
    const updated = await updateHrRole(position.id, positionToDb(position))
    return positionFromDb(updated)
  } catch (error) {
    console.error('Failed to update staff position:', error)
    throw error
  }
}

export async function deleteStaffPosition(id) {
  try {
    await deleteHrRole(id)
  } catch (error) {
    console.error('Failed to delete staff position:', error)
    throw error
  }
}

// ── Position Names API (autocomplete — reste local, commodité d'UI) ─────────

export async function getAllPositionNames() {
  try {
    return readLocal(POSITION_NAMES_KEY)
  } catch (error) {
    console.error('Failed to load position names:', error)
    return []
  }
}

export async function createPositionName(positionName) {
  try {
    const positionNames = readLocal(POSITION_NAMES_KEY)
    positionNames.push(positionName)
    localStorage.setItem(POSITION_NAMES_KEY, JSON.stringify(positionNames))
  } catch (error) {
    console.error('Failed to create position name:', error)
    throw error
  }
}

export async function deletePositionName(id) {
  try {
    const positionNames = readLocal(POSITION_NAMES_KEY)
    const filtered = positionNames.filter((p) => p.id !== id)
    localStorage.setItem(POSITION_NAMES_KEY, JSON.stringify(filtered))
  } catch (error) {
    console.error('Failed to delete position name:', error)
    throw error
  }
}
