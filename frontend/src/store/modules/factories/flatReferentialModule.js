const TTL = 15 * 60 * 1000

/**
 * Factory for the "flat referential" Vuex modules (Brand, DisplayName, Industrial, PackingType —
 * see BUG-165): entities shaped `{ id, name, tenantId }`, each with its own dedicated CRUD api
 * client, previously implemented as 4 near-identical hand-copied store files.
 *
 * Action/getter names are passed in explicitly rather than derived from `entityName` by
 * pluralization. Several other screens (MenuItemCreateView.vue, MarketPriceCreateDrawer.vue,
 * MenuItemCsvImportDrawer.vue, ComponentCreateView.vue, CreatePackingTypeDialog.vue, ...) dispatch
 * these actions / read these getters by exact string (e.g. `'brandNames/fetchBrandNames'`,
 * `'packingTypes/addPackingType'`) — silently renaming them via a generic convention would break
 * those call sites. Mutation names stay purely internal to this module (nothing outside ever
 * commits directly), so they don't need to be configurable.
 *
 * `mergeOnUpdate` preserves a real, pre-existing behavioral divergence between the 4 entities found
 * while factoring this out: BUG-160 fixed the optimistic-update mutation to merge
 * (`{ ...item, ...updated }`, so fields not present in the partial `{ id, name }` payload — e.g.
 * `createdAt` — survive an edit) only for `brandNames.js` / `displayNames.js`. `industrials.js` /
 * `packingTypes.js` were never touched by that fix and still replace the row wholesale on update.
 * This factory does not silently "fix" that inconsistency (out of scope for BUG-165, a
 * behavior-preserving refactor) — each of the 4 thin module files below passes `mergeOnUpdate`
 * matching its own current behavior.
 */
export function createFlatReferentialModule({
  fetchFn,
  getterName,
  fetchAction,
  addAction,
  updateAction,
  removeAction,
  mergeOnUpdate = true,
}) {
  return {
    namespaced: true,

    state: () => ({
      list: [],
      cachedAt: null,
      fetching: false,
    }),

    getters: {
      [getterName]: (state) => state.list,
      isCacheValid: (state) =>
        state.cachedAt !== null && Date.now() - state.cachedAt < TTL,
    },

    mutations: {
      SET_LIST(state, list) {
        state.list = list
        state.cachedAt = Date.now()
      },
      SET_FETCHING(state, val) {
        state.fetching = val
      },
      INVALIDATE(state) {
        state.cachedAt = null
      },
      ADD_ITEM(state, item) {
        state.list = [...state.list, item]
      },
      UPDATE_ITEM(state, updated) {
        state.list = state.list.map((item) =>
          item.id === updated.id ? (mergeOnUpdate ? { ...item, ...updated } : updated) : item
        )
      },
      REMOVE_ITEM(state, id) {
        state.list = state.list.filter((item) => item.id !== id)
      },
    },

    actions: {
      async [fetchAction]({ state, commit, getters }, { forceRefresh = false } = {}) {
        if (state.fetching) return
        if (!forceRefresh && getters.isCacheValid) return
        commit('SET_FETCHING', true)
        try {
          // BUG-169: le backend plafonne chaque appel à `limit` lignes (même pattern que
          // marketPrices.js/marketPriceTypes.js) : on boucle sur `meta.total` tant qu'il en
          // reste, pour ne pas tronquer silencieusement les dropdowns/pickers consommant
          // cette liste complète ailleurs dans l'app.
          const limit = 200
          let page = 1
          let raw = []
          while (true) {
            const result = await fetchFn({ page, limit })
            const pageRows = Array.isArray(result)
              ? result
              : Array.isArray(result?.data)
                ? result.data
                : Array.isArray(result?.data?.data)
                  ? result.data.data
                  : []
            raw = raw.concat(pageRows)
            const total = result?.meta?.total ?? result?.data?.meta?.total
            if (!total || pageRows.length < limit || raw.length >= total) break
            page += 1
          }

          const list = raw
            .map((item) => ({ ...item, id: item?.id || item?._id }))
            .filter((item) => !!item.id)
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

          commit('SET_LIST', list)
        } finally {
          commit('SET_FETCHING', false)
        }
      },

      invalidate({ commit }) {
        commit('INVALIDATE')
      },

      [addAction]({ commit }, item) {
        commit('ADD_ITEM', item)
      },

      [updateAction]({ commit }, item) {
        commit('UPDATE_ITEM', item)
      },

      [removeAction]({ commit }, id) {
        commit('REMOVE_ITEM', id)
      },
    },
  }
}
