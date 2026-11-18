// Articles par PdV de la configuration (un seul appel batch), lus en parallèle du reste du
// chargement du contexte Inventaire. Fichier volontairement léger : aucun import statique de
// client API (menu.api est importé à la demande), car useInventoryData l'importe.

/** Transforme une promesse en résultat qui ne rejette jamais : { ok, value } ou { ok:false, error }. */
export function settle(promise) {
  return promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }))
}

/**
 * Ne dépend ni de la liste des PdV ni du plan de la configuration : seulement de l'espace et
 * de la configuration. Ne rejette jamais, même si personne ne lit le résultat.
 * @returns {Promise<{ok:true,value:object}|{ok:false,error:Error}>}
 */
export function startShopItemsBatch(spaceId, configId, { allSpace = false } = {}) {
  return settle(
    import('@/api/endpoints/menu.api').then(({ getConfigShopMenuItemsLight }) =>
      // BUG-383-02 : les articles à compter par PdV sont l'union de toutes les configurations
      // de l'espace (itemsScope 'space'); « Voir tout l'inventaire » élargit aussi les PdV.
      getConfigShopMenuItemsLight(spaceId, configId, {
        itemsScope: 'space',
        ...(allSpace ? { shopsScope: 'space' } : {}),
      }),
    ),
  )
}
