import { createStore } from 'vuex'
import auth from './modules/auth'
import analyse from './modules/analyse'
import inventory from './modules/inventory'
import logistics from './modules/logistics'
import spaces from './modules/spaces'
import suppliers from './modules/suppliers'
import events from './modules/events'
import eventSubcategories from './modules/eventSubcategories'
import eventCategories from './modules/eventCategories'
import eventTypes from './modules/eventTypes'
import productCategories from './modules/productCategories'
import productTypes from './modules/productTypes'
import marketPriceCategories from './modules/marketPriceCategories'
import marketPriceTypes from './modules/marketPriceTypes'
import componentCategories from './modules/componentCategories'
import componentTypes from './modules/componentTypes'
import brandNames from './modules/brandNames'
import displayNames from './modules/displayNames'
import industrials from './modules/industrials'
import packingTypes from './modules/packingTypes'
import promotionTypes from './modules/promotionTypes'
import storageTypes from './modules/storageTypes'
import departments from './modules/departments'
import permissions from './modules/permissions'
import roles from './modules/roles'
import users from './modules/users'
import marketPrices from './modules/marketPrices'
import menuComponents from './modules/menuComponents'
import marketPriceIngredients from './modules/marketPriceIngredients'
import menuItems from './modules/menuItems'
import packaging from './modules/packaging'
import spaceConfigurations from './modules/spaceConfigurations'
import spaceShops from './modules/spaceShops'
import spaceIntegrations from './modules/spaceIntegrations'
import weezeventLocations from './modules/weezeventLocations'
import shopMenuItems from './modules/shopMenuItems'
import shopMenuAvailability from './modules/shopMenuAvailability'
import historyAliases from './modules/historyAliases'
import notifications from './modules/notifications'
import hrSettings from './modules/hrSettings'
import staffing from './modules/staffing'
import seasons from './modules/seasons'
import storageInventory from './modules/storageInventory'

export default createStore({
  state: {
  },
  getters: {
  },
  mutations: {
  },
  actions: {
  },
  modules: {
    auth,
    analyse,
    inventory,
    logistics,
    spaces,
    suppliers,
    events,
    eventSubcategories,
    eventCategories,
    eventTypes,
    productCategories,
    productTypes,
    marketPriceCategories,
    marketPriceTypes,
    componentCategories,
    componentTypes,
    brandNames,
    displayNames,
    industrials,
    packingTypes,
    promotionTypes,
    storageTypes,
    departments,
    permissions,
    roles,
    users,
    marketPrices,
    menuComponents,
    marketPriceIngredients,
    menuItems,
    packaging,
    spaceConfigurations,
    spaceShops,
    spaceIntegrations,
    weezeventLocations,
    shopMenuItems,
    shopMenuAvailability,
    historyAliases,
    notifications,
    hrSettings,
    staffing,
    seasons,
    storageInventory,
  }
})
