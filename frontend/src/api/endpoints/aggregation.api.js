// API functions for data aggregation
import api from '../client'

export async function getEventsTimeline(spaceId, integrationId) {
  try {
    const params = integrationId ? { integrationId } : {}
    const response = await api.get(`/aggregation/events-timeline/${spaceId}`, { params })
    return response.data
  } catch (error) {
    console.error(`[AGGREGATION API] Error fetching events timeline for space ${spaceId}:`, error)
    throw error
  }
}

/**
 * #10 — bundle : timeline + transactionStats + weezeventEvents + hasMappings en 1 appel.
 * Remplace getEventsTimeline + getWeezeventEvents + getLocationShopMappings du mounted().
 */
export async function getStep4Context(spaceId, integrationId) {
  try {
    const params = integrationId ? { integrationId } : {}
    const response = await api.get(`/aggregation/step4-context/${spaceId}`, { params })
    return response.data
  } catch (error) {
    console.error(`[AGGREGATION API] Error fetching step4 context for space ${spaceId}:`, error)
    throw error
  }
}

export async function processEvents(spaceId, eventIds, integrationId) {
  try {
    const response = await api.post(
      '/aggregation/process-events',
      {
        spaceId,
        eventIds,
        ...(integrationId ? { integrationId } : {}),
      },
      { timeout: 1200000 }, // 20 min — le backend peut prendre plus de 30s par événement
    )
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error processing events:', error)
    throw error
  }
}

export async function synchronize(spaceId, integrationId) {
  try {
    const response = await api.post('/aggregation/synchronize', {
      spaceId,
      ...(integrationId ? { integrationId } : {}),
    })
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error synchronizing:', error)
    throw error
  }
}

export async function getJobProgress(jobId) {
  try {
    const response = await api.get(`/aggregation/progress/${jobId}`)
    return response.data
  } catch (error) {
    console.error(`[AGGREGATION API] Error fetching job progress ${jobId}:`, error)
    throw error
  }
}

// ─── Weezevent data endpoints (already exist in weezevent controller) ──

export async function getEventBreakdown(spaceId, eventId) {
  try {
    const response = await api.get(`/aggregation/event-breakdown/${spaceId}/${eventId}`)
    return response.data
  } catch (error) {
    console.error(`[AGGREGATION API] Error fetching event breakdown for event ${eventId}:`, error)
    throw error
  }
}

/**
 * Statistiques directes par événement — requête SQL GROUP BY sans pré-agrégation.
 * @param {string} spaceId
 * @param {string} eventId
 * @param {'minute'|'hour'|'shop'|'product'} groupBy
 */
export async function getEventStats(spaceId, eventId, groupBy) {
  try {
    const response = await api.get(`/aggregation/event-stats/${spaceId}/${eventId}`, { params: { groupBy } })
    return response.data
  } catch (error) {
    console.error(`[AGGREGATION API] Error fetching event stats (groupBy=${groupBy}) for event ${eventId}:`, error)
    throw error
  }
}

/**
 * Minute-level CA chart from pre-aggregated SpaceRevenueMinuteAgg.
 * Returns: { eventId, eventName, eventDate, data: [{ minute, revenueHt, transactionsCount, shopCount }] }
 */
export async function getEventMinuteChart(spaceId, eventId) {
  try {
    const response = await api.get(`/aggregation/event-minute-chart/${spaceId}/${eventId}`)
    return response.data
  } catch (error) {
    console.error(`[AGGREGATION API] Error fetching minute chart for event ${eventId}:`, error)
    throw error
  }
}

export async function getWeezeventLocations(integrationId) {
  try {
    const PER_PAGE = 500
    const params = { type: 'all', perPage: PER_PAGE, page: 1 }
    if (integrationId) params.integrationId = integrationId

    const first = await api.get('/weezevent/locations', { params })
    const firstData = first.data
    const totalPages = firstData?.meta?.total_pages ?? 1
    const allItems = [...(firstData?.data ?? [])]

    for (let p = 2; p <= totalPages; p++) {
      const res = await api.get('/weezevent/locations', { params: { ...params, page: p } })
      allItems.push(...(res.data?.data ?? []))
    }

    return { data: allItems, meta: { ...firstData?.meta, current_page: 1, per_page: allItems.length, total_pages: 1 } }
  } catch (error) {
    console.error('[AGGREGATION API] Error fetching weezevent locations:', error)
    throw error
  }
}

export async function getWeezeventEvents(integrationId) {
  try {
    const params = { perPage: 500 }
    if (integrationId) params.integrationId = integrationId
    const response = await api.get('/weezevent/events', { params })
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error fetching weezevent events:', error)
    throw error
  }
}

export async function getWeezeventProducts(merchantId, integrationId, spaceId, onlySold, opts = {}) {
  try {
    const PER_PAGE = 500
    // PERF : le backend n'a AUCUN filtre tenant/space quand ni integrationId/spaceId/
    // catalogSpaceId ne sont fournis, donc on borne la pagination pour ne pas rapatrier
    // des dizaines de milliers de produits. 4 pages = 2000 produits, largement au-delà
    // d'un catalogue de lieu normal. Troncature LOGGÉE, jamais silencieuse.
    const MAX_PAGES = 4
    const params = { perPage: PER_PAGE, page: 1 }
    if (merchantId) params.merchantId = merchantId
    if (integrationId) params.integrationId = integrationId
    // Avec spaceId, le backend renvoie le prix PRATIQUÉ DANS CET ESPACE (ventes des locations
    // mappées), pas le basePrice figé du produit → prix par espace cohérent partout.
    // ATTENTION coûteux (cascade de repli espace→weezeventId→nom, cf. weezevent.controller.ts) —
    // pour un simple filtrage catalogue par espace sans ce coût, utiliser opts.catalogSpaceId.
    if (spaceId) params.spaceId = spaceId
    // onlySold : le backend ne renvoie que les produits ayant un prix (réellement vendus) → on ne
    // ramène pas le catalogue jamais vendu. meta.total reste le total NON filtré (pour le décompte).
    if (onlySold) params.onlySold = 'true'
    // Filtre LÉGER par espace (intégration Weezevent de l'espace, requête indexée simple) —
    // n'active PAS la cascade de prix scopée-espace de `spaceId`. Ignoré si integrationId/spaceId fournis.
    if (opts.catalogSpaceId) params.catalogSpaceId = opts.catalogSpaceId

    const first = await api.get('/weezevent/products', { params })
    const firstData = first.data
    const totalPages = firstData?.meta?.total_pages ?? 1
    const pagesToFetch = Math.min(totalPages, MAX_PAGES)
    if (totalPages > MAX_PAGES) {
      console.warn(
        `[AGGREGATION API] weezevent/products tronqué à ${MAX_PAGES * PER_PAGE} produits (${totalPages} pages dispo) — filtre serveur tenant/space manquant`,
      )
    }
    const allItems = [...(firstData?.data ?? [])]

    // Pages restantes en PARALLÈLE (la boucle séquentielle multipliait la latence).
    if (pagesToFetch > 1) {
      const rest = await Promise.all(
        Array.from({ length: pagesToFetch - 1 }, (_, i) =>
          api.get('/weezevent/products', { params: { ...params, page: i + 2 } }),
        ),
      )
      for (const res of rest) allItems.push(...(res.data?.data ?? []))
    }

    return { data: allItems, meta: { ...firstData?.meta, current_page: 1, per_page: allItems.length, total_pages: 1 } }
  } catch (error) {
    console.error('[AGGREGATION API] Error fetching weezevent products:', error)
    throw error
  }
}

/**
 * Fetch fresh product details from the Weezevent API and update the local record
 * @param {string} productId - Internal WeezeventProduct ID
 * @returns {Promise<Object>} Updated product with fresh nature/subnature/etc.
 */
export async function refreshWeezeventProduct(productId, spaceId) {
  try {
    // spaceId → prix dérivé des ventes DE CET ESPACE (jamais un prix d'un autre espace).
    const params = spaceId ? { spaceId } : undefined
    const response = await api.get(`/weezevent/products/${productId}/refresh`, params ? { params } : undefined)
    return response.data
  } catch (error) {
    console.error(`[AGGREGATION API] Error refreshing weezevent product ${productId}:`, error)
    throw error
  }
}

/**
 * Backfill de maintenance : relie les ventes orphelines (WeezeventTransactionItem.productId null)
 * à leur produit (créé s'il manque, pour apparaître au mapping de l'étape 3).
 * @param {{ integrationId?: string, dryRun?: boolean }} [opts]
 * @returns {Promise<Object>} résumé { orphanItems, productsCreated, itemsLinked, ... }
 */
export async function backfillWeezeventTransactionItemProducts(opts = {}) {
  try {
    const params = {}
    if (opts.integrationId) params.integrationId = opts.integrationId
    if (opts.dryRun) params.dryRun = 'true'
    const response = await api.post('/weezevent/backfill-transaction-item-products', {}, { params, timeout: 120000 })
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error backfilling transaction-item products:', error)
    throw error
  }
}

// ─── Weezevent sync endpoints ──

export async function syncWeezeventData(type = 'transactions', options = {}) {
  try {
    // Sync runs synchronously on the backend — allow up to 2 minutes for large datasets
    const response = await api.post('/weezevent/sync', { type, ...options }, { timeout: 120000 })
    return response.data
  } catch (error) {
    console.error(`[AGGREGATION API] Error syncing weezevent ${type}:`, error)
    throw error
  }
}

export async function getWeezeventTransactions(options = {}) {
  try {
    const response = await api.get('/weezevent/transactions', { params: options })
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error fetching weezevent transactions:', error)
    throw error
  }
}

export async function getWeezeventRawTransactions(options = {}) {
  try {
    const response = await api.get('/weezevent/raw-transactions', { params: options })
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error fetching raw weezevent transactions:', error)
    throw error
  }
}

export async function getWeezeventSyncStatus(integrationId) {
  try {
    const params = integrationId ? { integrationId } : {}
    const response = await api.get('/weezevent/sync/status', { params })
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error fetching sync status:', error)
    throw error
  }
}

export async function purgeWeezeventData(integrationId) {
  try {
    const params = integrationId ? { integrationId } : {}
    const response = await api.delete('/weezevent/data', { params })
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error purging weezevent data:', error)
    throw error
  }
}

export async function testWeezeventCredentials(organizationId, credentials) {
  try {
    const response = await api.post(`/organizations/${organizationId}/integrations/weezevent/test`, credentials)
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error testing weezevent credentials:', error)
    throw error
  }
}

// ─── Weezevent multi-instance endpoints ──

export async function listWeezeventInstances(organizationId) {
  try {
    const response = await api.get(`/organizations/${organizationId}/integrations/weezevent/instances`)
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error listing weezevent instances:', error)
    throw error
  }
}

export async function createWeezeventInstance(organizationId, payload) {
  try {
    const response = await api.post(`/organizations/${organizationId}/integrations/weezevent/instances`, payload)
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error creating weezevent instance:', error)
    throw error
  }
}

export async function updateWeezeventInstance(organizationId, instanceId, payload) {
  try {
    const response = await api.patch(
      `/organizations/${organizationId}/integrations/weezevent/instances/${instanceId}`,
      payload,
    )
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error updating weezevent instance:', error)
    throw error
  }
}

export async function deleteWeezeventInstance(organizationId, instanceId) {
  try {
    const response = await api.delete(
      `/organizations/${organizationId}/integrations/weezevent/instances/${instanceId}`,
    )
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error deleting weezevent instance:', error)
    throw error
  }
}

export async function testWeezeventInstance(organizationId, instanceId, payload = {}) {
  try {
    const response = await api.post(
      `/organizations/${organizationId}/integrations/weezevent/instances/${instanceId}/test`,
      payload,
    )
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error testing weezevent instance:', error)
    throw error
  }
}

export async function startWeezeventSyncJob(options = {}) {
  try {
    const response = await api.post('/weezevent/sync/start', options)
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error starting sync job:', error)
    throw error
  }
}

export async function getWeezeventJobStatus(jobId) {
  try {
    const response = await api.get(`/weezevent/sync/status/${jobId}`)
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error getting sync job status:', error)
    throw error
  }
}

export async function listWeezeventSyncJobs(integrationId) {
  try {
    const response = await api.get('/weezevent/sync/jobs', { params: { integrationId } })
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error listing sync jobs:', error)
    throw error
  }
}

export async function deleteWeezeventSyncJob(jobId) {
  try {
    const response = await api.delete(`/weezevent/sync/jobs/${jobId}`)
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error deleting sync job:', error)
    throw error
  }
}

export async function getWeezeventJobStats(jobId) {
  try {
    const response = await api.get(`/weezevent/sync/jobs/${jobId}/stats`)
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error fetching sync job stats:', error)
    throw error
  }
}

// ─── Digifood multi-instance endpoints ──
// Digifood = webhooks temps réel (pas de sync API) : la config expose l'URL de
// webhook à communiquer à Digifood ; « test » = statut du dernier webhook reçu.

export async function listDigifoodInstances(organizationId) {
  try {
    const response = await api.get(`/organizations/${organizationId}/integrations/digifood/instances`)
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error listing digifood instances:', error)
    throw error
  }
}

export async function createDigifoodInstance(organizationId, payload) {
  try {
    const response = await api.post(`/organizations/${organizationId}/integrations/digifood/instances`, payload)
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error creating digifood instance:', error)
    throw error
  }
}

export async function updateDigifoodInstance(organizationId, instanceId, payload) {
  try {
    const response = await api.patch(
      `/organizations/${organizationId}/integrations/digifood/instances/${instanceId}`,
      payload,
    )
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error updating digifood instance:', error)
    throw error
  }
}

export async function deleteDigifoodInstance(organizationId, instanceId) {
  try {
    const response = await api.delete(
      `/organizations/${organizationId}/integrations/digifood/instances/${instanceId}`,
    )
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error deleting digifood instance:', error)
    throw error
  }
}

export async function testDigifoodInstance(organizationId, instanceId) {
  try {
    const response = await api.post(
      `/organizations/${organizationId}/integrations/digifood/instances/${instanceId}/test`,
    )
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error testing digifood instance:', error)
    throw error
  }
}

/**
 * Import CSV d'historique Digifood. dryRun=true (défaut) = rapport SANS écriture ;
 * dryRun=false exécute. Multipart champ `file` + champ `mapping` optionnel
 * (JSON { champ_normalisé: 'Colonne CSV' }, persisté côté back pour les prochains
 * imports). Timeout long (gros fichiers).
 */
export async function importDigifoodCsv(organizationId, instanceId, file, dryRun = true, mapping = null) {
  try {
    const form = new FormData()
    // ⚠️ les champs texte AVANT le fichier : @fastify/multipart n'expose que les
    // fields déjà parsés au moment où le stream du fichier est consommé.
    if (mapping && Object.keys(mapping).length) form.append('mapping', JSON.stringify(mapping))
    form.append('file', file)
    const response = await api.post(
      `/organizations/${organizationId}/integrations/digifood/instances/${instanceId}/import-csv`,
      form,
      {
        params: { dryRun: dryRun ? 'true' : 'false' },
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
      },
    )
    return response.data
  } catch (error) {
    console.error('[AGGREGATION API] Error importing digifood CSV:', error)
    throw error
  }
}
