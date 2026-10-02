import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { SalesPriceAggService } from '../../../../shared/pricing/sales-price-agg.service';

/**
 * Écriture d'un lot de transactions Weezevent (lignes, paiements, référentiels liés) en base.
 */
@Injectable()
export class WeezeventTransactionBatchWriterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceAgg: SalesPriceAggService,
  ) {}

    private readonly logger = new Logger(WeezeventTransactionBatchWriterService.name);

    /**
     * Identifiants Weezevent déjà en base PARMI ceux donnés (une page de l'API). Remplace le
     * préchargement de tous les identifiants de l'intégration, dont la mémoire grandissait avec
     * l'historique (synchro complète sans date de départ).
     */
    async existingTransactionIds(tenantId: string, integrationId: string, weezeventIds: string[]): Promise<Set<string>> {
        if (!weezeventIds.length) return new Set();
        const existing = await this.prisma.salesTransaction.findMany({
            where: { tenantId, integrationId, externalId: { in: weezeventIds } },
            select: { externalId: true },
        });
        return new Set(existing.map(t => t.externalId));
    }

    /**
     * Public entry point for InsertWorkerService — upsert a batch of raw API transactions.
     * Fetches only the relevant existing IDs (scoped to the chunk's weezeventIds).
     */
    async insertTransactionBatch(
        tenantId: string,
        integrationId: string,
        transactions: any[],
    ): Promise<{ created: number; updated: number; errors: number }> {
        if (transactions.length === 0) return { created: 0, updated: 0, errors: 0 };

        // Fetch organizationId — needed for inline entity upserts (event, merchant)
        const integration = await this.prisma.integration.findUnique({
            where: { id: integrationId },
            select: { weezevent: { select: { organizationId: true } } },
        });
        const organizationId = integration?.weezevent?.organizationId ?? '';

        const weezeventIds = transactions.map((t: any) => t.id?.toString()).filter(Boolean);
        const existingIds = await this.existingTransactionIds(tenantId, integrationId, weezeventIds);
        // refreshPriceAgg=false : ce point d'entrée sert les gros imports historiques (bisection
        // worker, PARALLEL_CHUNKS) — un refresh ciblé par chunk ajouterait un coût cumulé non
        // borné. WeezeventInsertWorkerService déclenche un refreshForIntegration unique à la fin
        // du job complet (BUG-337-02, docs/bugs/).
        return this.processBatchTransactions(tenantId, integrationId, transactions, existingIds, organizationId, false);
    }

    /**
     * Process batch of transactions with parallelized upserts.
     *
     * Strategy:
     *  1. Pre-collect all unique entities from the full batch (sync, no DB).
     *  2. Parallel upsert events + merchants + products via Promise.all.
     *  3. Parallel upsert locations (depend on eventId — runs after step 2).
     *  4. Loop over transactions is purely synchronous (map lookups only).
     *  5. Single createMany for all new transactions.
     *
     * This reduces DB round-trips from O(N×entities) sequential to O(unique_entities) parallel.
     */
    async processBatchTransactions(
        tenantId: string,
        integrationId: string,
        transactions: any[],
        existingIds: Set<string>,
        organizationId = '',
        refreshPriceAgg = true,
    ): Promise<{ created: number; updated: number; errors: number }> {
        const result = { created: 0, updated: 0, errors: 0 };

        // ── 1. Pre-collect unique entities (no DB) ───────────────────────────
        const uniqueEvents    = new Map<string, { wid: string; name: string }>();
        const uniqueLocations = new Map<string, { wid: string; name: string; eventWid: string | null }>();
        const uniqueMerchants = new Map<string, { wid: string; name: string }>();
        const uniqueProducts  = new Map<string, { wid: string; name: string; unitPrice: number; vat: number | null; rawRow: any }>();

        for (const t of transactions) {
            const eventWid = t.event_id?.toString() ?? null;
            // event_name peut être null dans l'API pay/v1 — fallback sur l'ID
            if (eventWid && !uniqueEvents.has(eventWid)) {
                uniqueEvents.set(eventWid, { wid: eventWid, name: t.event_name || `Event ${eventWid}` });
            }
            const locationWid = t.location_id?.toString() ?? null;
            if (locationWid && !uniqueLocations.has(locationWid)) {
                uniqueLocations.set(locationWid, { wid: locationWid, name: t.location_name || `Location ${locationWid}`, eventWid });
            }
            // L'API pay/v1 utilise fundation_id/fundation_name (pas merchant_id)
            const merchantWid = t.fundation_id?.toString() ?? null;
            if (merchantWid && !uniqueMerchants.has(merchantWid)) {
                uniqueMerchants.set(merchantWid, { wid: merchantWid, name: t.fundation_name || `Merchant ${merchantWid}` });
            }
            for (const row of (t.rows ?? [])) {
                const productWid = String(row.item_id ?? '');
                if (productWid && !uniqueProducts.has(productWid)) {
                    uniqueProducts.set(productWid, {
                        wid: productWid,
                        name: row.item_name || `Item ${productWid}`,
                        unitPrice: (row.unit_price ?? 0) / 100,
                        vat: row.vat ?? null,
                        rawRow: row,
                    });
                }
            }
        }

        // ── 2. Parallel upsert: events + merchants + products ────────────────
        const eventIdMap    = new Map<string, string>();
        const locationIdMap = new Map<string, string>();
        const merchantIdMap = new Map<string, string>();
        const productIdMap  = new Map<string, string>();

        await Promise.all([
            ...[...uniqueEvents.values()].map(async ({ wid, name }) => {
                try {
                    const r = await this.prisma.salesEvent.upsert({
                        where: { tenantId_integrationId_externalId: { tenantId, integrationId, externalId: wid } },
                        create: { externalId: wid, tenantId, integrationId, name, organizationId, rawData: {}, syncedAt: new Date() },
                        update: { syncedAt: new Date() },
                        select: { id: true },
                    });
                    eventIdMap.set(wid, r.id);
                } catch (err) {
                    this.logger.warn(`[processBatch] Could not upsert event ${wid}: ${(err as Error).message}`);
                }
            }),
            ...[...uniqueMerchants.values()].map(async ({ wid, name }) => {
                try {
                    const r = await this.prisma.weezeventMerchant.upsert({
                        where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId: wid } },
                        create: { weezeventId: wid, tenantId, integrationId, name, organizationId, rawData: {}, syncedAt: new Date() },
                        update: { syncedAt: new Date() },
                        select: { id: true },
                    });
                    merchantIdMap.set(wid, r.id);
                } catch (err) {
                    this.logger.warn(`[processBatch] Could not upsert merchant ${wid}: ${(err as Error).message}`);
                }
            }),
            ...[...uniqueProducts.values()].map(async ({ wid, name, unitPrice, vat, rawRow }) => {
                try {
                    const r = await this.prisma.salesProduct.upsert({
                        where: { tenantId_integrationId_externalId: { tenantId, integrationId, externalId: wid } },
                        create: { externalId: wid, tenantId, integrationId, name, basePrice: unitPrice, vatRate: vat, rawData: rawRow, syncedAt: new Date() },
                        update: { syncedAt: new Date() },
                        select: { id: true },
                    });
                    productIdMap.set(wid, r.id);
                } catch (err) {
                    this.logger.warn(`[processBatch] Could not upsert product ${wid}: ${(err as Error).message}`);
                }
            }),
        ]);

        // ── 3. Upsert locations (after events — need resolved eventId) ────────
        await Promise.all(
            [...uniqueLocations.values()].map(async ({ wid, name, eventWid }) => {
                try {
                    const resolvedEventId = eventWid ? (eventIdMap.get(eventWid) ?? null) : null;
                    const r = await this.prisma.salesLocation.upsert({
                        where: { tenantId_integrationId_externalId: { tenantId, integrationId, externalId: wid } },
                        create: { externalId: wid, tenantId, integrationId, name, eventId: resolvedEventId, rawData: {}, syncedAt: new Date() },
                        update: { syncedAt: new Date() },
                        select: { id: true },
                    });
                    locationIdMap.set(wid, r.id);
                } catch (err) {
                    this.logger.warn(`[processBatch] Could not upsert location ${wid}: ${(err as Error).message}`);
                }
            }),
        );

        // ── 4. Build transaction list (synchronous — map lookups only) ────────
        const toCreate: any[] = [];
        // itemsByTxWeezeventId stores rows per transaction for WeezeventTransactionItem insertion
        const itemsByTxWeezeventId = new Map<string, any[]>();

        for (const apiTransaction of transactions) {
            try {
                const weezeventId = apiTransaction.id.toString();

                const transactionStatus = apiTransaction.status as any;
                const statusValue = typeof transactionStatus === 'object' && transactionStatus?.name
                    ? transactionStatus.name
                    : (typeof transactionStatus === 'string' ? transactionStatus : 'unknown');

                // Seules les transactions Validated (V) sont insérées — W/C/R ignorées
                if (statusValue !== 'V') continue;

                // Collect rows for all V transactions (new + existing) to backfill missing items
                const txRows: any[] = (apiTransaction as any).rows ?? [];
                if (txRows.length > 0) {
                    itemsByTxWeezeventId.set(weezeventId, txRows);
                }

                if (existingIds.has(weezeventId)) continue;

                const rawTx = apiTransaction as any;
                const dateStr = rawTx.created || rawTx.updated || rawTx.validated || rawTx.date || rawTx.created_at;
                if (!dateStr) {
                    this.logger.warn(`Transaction ${weezeventId} has no date field. Keys: ${Object.keys(rawTx).join(', ')}`);
                }
                const transactionDate = dateStr ? new Date(dateStr) : new Date();

                const apiEventId    = apiTransaction.event_id?.toString();
                const apiLocationId = apiTransaction.location_id?.toString();
                const apiMerchantId = apiTransaction.fundation_id?.toString(); // API: fundation_id, pas merchant_id

                const resolvedEventId    = apiEventId    ? (eventIdMap.get(apiEventId)       ?? null) : null;
                const resolvedLocationId = apiLocationId ? (locationIdMap.get(apiLocationId) ?? null) : null;
                const resolvedMerchantId = apiMerchantId ? (merchantIdMap.get(apiMerchantId) ?? null) : null;

                if (apiEventId    && !resolvedEventId)    this.logger.warn(`Transaction ${weezeventId} references event ${apiEventId} not found in DB`);
                if (apiLocationId && !resolvedLocationId) this.logger.warn(`Transaction ${weezeventId} references location ${apiLocationId} not found in DB`);
                if (apiMerchantId && !resolvedMerchantId) this.logger.warn(`Transaction ${weezeventId} references merchant ${apiMerchantId} not found in DB`);

                const txRowsForAmount: any[] = itemsByTxWeezeventId.get(weezeventId) ?? [];
                const totalAmountCents = txRowsForAmount.reduce((sum: number, row: any) =>
                    sum + (row.payments ?? []).reduce((s: number, p: any) => s + (p.amount ?? 0), 0), 0);

                toCreate.push({
                    externalId: weezeventId,
                    tenantId,
                    integrationId,
                    amount: totalAmountCents / 100,
                    status: statusValue,
                    transactionDate,
                    eventId: resolvedEventId,
                    eventName: apiTransaction.event_name,
                    merchantId: resolvedMerchantId,
                    merchantName: apiTransaction.fundation_name,
                    locationId: resolvedLocationId,
                    locationName: apiTransaction.location_name,
                    rawData: apiTransaction as any,
                    syncedAt: new Date(),
                });
            } catch (error) {
                this.logger.error(`Failed to process transaction ${apiTransaction.id}`, error);
                result.errors++;
            }
        }

        // ── 5. Batch insert transactions ──────────────────────────────────────
        if (toCreate.length > 0) {
            const createResult = await this.prisma.salesTransaction.createMany({
                data: toCreate,
                skipDuplicates: true,
            });
            result.created = createResult.count;
        }

        // ── 6. Insert WeezeventTransactionItem rows (new + backfill existing) ─
        if (itemsByTxWeezeventId.size > 0) {
            const allWeezeventIds = [...itemsByTxWeezeventId.keys()];

            // Get DB ids for all V transactions in this batch (locationId/transactionDate :
            // BUG-337-02, nécessaires au delta SalesPriceAgg ci-dessous)
            const dbTxs = await this.prisma.salesTransaction.findMany({
                where: { tenantId, integrationId, externalId: { in: allWeezeventIds } },
                select: { id: true, externalId: true, locationId: true, transactionDate: true },
            });
            const txById = new Map(dbTxs.map(t => [t.id, t]));

            // Find which transactions already have items (to avoid duplicates)
            const txIdsWithItems = new Set<string>();
            if (dbTxs.length > 0) {
                const existingItems = await this.prisma.salesTransactionItem.findMany({
                    where: { transactionId: { in: dbTxs.map(t => t.id) } },
                    select: { transactionId: true },
                    distinct: ['transactionId'],
                });
                for (const item of existingItems) txIdsWithItems.add(item.transactionId);
            }

            const itemsToInsert: any[] = [];
            for (const tx of dbTxs) {
                // Skip transactions that already have items (idempotency)
                if (txIdsWithItems.has(tx.id)) continue;

                const rows = itemsByTxWeezeventId.get(tx.externalId) ?? [];
                for (const row of rows) {
                    const productWid = String(row.item_id ?? '');
                    const resolvedProductId = productWid ? (productIdMap.get(productWid) ?? null) : null;
                    const qty = (row.payments ?? []).reduce((s: number, p: any) => s + (p.quantity ?? 1), 0) || 1;
                    itemsToInsert.push({
                        transactionId: tx.id,
                        externalItemId: row.id?.toString() ?? null,
                        productId: resolvedProductId,
                        productName: row.item_name ?? null,
                        compoundId: null,
                        quantity: qty,
                        unitPrice: (row.unit_price ?? 0) / 100,
                        vat: row.vat ?? 0,
                        reduction: (row.reduction ?? 0) / 100,
                        rawData: row,
                    });
                }
            }

            if (itemsToInsert.length > 0) {
                await this.prisma.salesTransactionItem.createMany({
                    data: itemsToInsert,
                    skipDuplicates: true,
                });

                // BUG-337-02 (docs/bugs/) : delta SalesPriceAgg pour les items de ce lot (un seul
                // upsert, aucun scan d'historique). Additif pur : seules les transactions sans items
                // sont insérées ci-dessus (idempotence), rien à retirer. Best-effort, ne doit jamais
                // faire échouer le sync. Sauté en full-sync/premier-sync (`refreshPriceAgg=false`) :
                // un unique refreshForIntegration en fin de run (cf. syncTransactionsIncremental)
                // couvre l'import historique.
                if (refreshPriceAgg) {
                    await this.priceAgg.applyDeltaSafe(
                        tenantId,
                        integrationId,
                        itemsToInsert.map(item => {
                            const tx = txById.get(item.transactionId);
                            return { ...item, locationId: tx?.locationId ?? null, transactionDate: tx?.transactionDate ?? new Date() };
                        }),
                    );
                }
            }
        }

        return result;
    }
}
