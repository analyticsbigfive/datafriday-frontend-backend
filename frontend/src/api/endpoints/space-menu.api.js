// API functions for the Space Menu module
// Endpoints (openapi.json):
//   GET /space-menu/{spaceId}/{configId}    → SpaceMenu (per configuration)
//   GET /space-menu/shop/{shopId}            → ShopMenu[]  (per shop)
import { api } from '../client'
import { apiOrMock } from '../apiOrMock'
// PERF: imports mock retirés (cf. analyse.api.js) — cassent la chaîne eager
// vers adidasArenaMock (39KB). `apiOrMock` ignore le mockFactory.

export function getSpaceMenu(spaceId, configId) {
  return apiOrMock(
    () => api.get(`/space-menu/${spaceId}/${configId}`),
    { label: `space-menu/${spaceId}/${configId}` },
  )
}

export function getShopMenus(shopId, configId) {
  // configId : scope l'assignation par configuration (élément v2 partagé entre
  // configs). Sans lui le backend retombe sur une config arbitraire — passer le
  // configId de l'event courant garantit le bon menu par shop.
  return apiOrMock(
    () => api.get(`/space-menu/shop/${shopId}`, { params: configId ? { configId } : {} }),
    { label: `space-menu/shop/${shopId}${configId ? `?configId=${configId}` : ''}` },
  )
}
