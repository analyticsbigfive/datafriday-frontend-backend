// Helpers partagés pour l'affichage des fournisseurs (page /suppliers).
// Le modèle Prisma `Supplier` n'expose que le champ `sites: String[]` (voir
// backend/prisma/schema.prisma), les autres formes (`spaceIds`, `siteIds`, `spaces`) sont des
// compatibilités défensives héritées ; `sites` est donc vérifié en premier.

function extractSpaceId(value) {
  if (!value) return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    return String(value.id || value._id || value.spaceId || value.siteId || value.value || '') || null
  }
  return null
}

export function getSupplierSiteIds(supplier) {
  const raw = Array.isArray(supplier?.sites) ? supplier.sites
    : Array.isArray(supplier?.spaceIds) ? supplier.spaceIds
    : Array.isArray(supplier?.siteIds) ? supplier.siteIds
    : Array.isArray(supplier?.spaces) ? supplier.spaces
    : []
  return raw.map(extractSpaceId).filter(Boolean)
}

export function getSupplierSiteNames(supplier, spaces) {
  const ids = getSupplierSiteIds(supplier)
  if (!ids.length) return []
  const list = Array.isArray(spaces) ? spaces : []
  return ids.map((id) => list.find((sp) => String(sp?.id) === String(id))?.name).filter(Boolean)
}

export function getSupplierPhone(supplier) {
  return supplier?.phone || supplier?.tel || supplier?.phoneNumber || ''
}

export function getSupplierPicture(supplier) {
  return supplier?.image || supplier?.picture || ''
}
