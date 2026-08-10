import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse';
import * as chardet from 'chardet';
import * as iconv from 'iconv-lite';
import { PrismaService } from '../../../core/database/prisma.service';
import { DigifoodIngestionService } from './digifood-ingestion.service';
import {
    NormalizedItem,
    NormalizedOrder,
    slugifyProductKey,
} from './digifood-order-normalizer';

/**
 * Import CSV d'historique Digifood (PLAN_INTEGRATION_DIGIFOOD §7).
 * Rôles : amorçage (peupler catalogue/PDV/ventes avant les premiers webhooks)
 * et rattrapage (trou de réception > 24 h).
 * Chaque groupe de lignes partageant order_id est reconstruit en NormalizedOrder
 * puis passe par LE MÊME ingestOrder que le webhook → idempotence identique
 * (réimport ou chevauchement avec des webhooks déjà reçus = sans double comptage).
 */

/** Champs normalisés attendus ; le mapping (fourni par le front et/ou persisté dans
 *  CsvMapping, mappingType 'digifood-orders') fait correspondre les colonnes CSV.
 *  Prix : price_pu (CENTIMES, unitaire) OU total_ttc (EUROS, total de ligne → ÷ quantité).
 *  Date : placed_at (ISO) OU placed_at_date + placed_at_time (deux colonnes, export réel). */
const CSV_FIELDS = [
    'order_id', 'placed_at', 'placed_at_date', 'placed_at_time',
    'location_id', 'location_name', 'shop_id', 'shop_name',
    'item_id', 'variation_id', 'item_name', 'variation', 'family',
    'quantity', 'price_pu', 'total_ttc', 'total_ht', 'total_tva',
    'tax_rate', 'external_reference', 'type', 'state',
] as const;
type CsvField = (typeof CSV_FIELDS)[number];
export type CsvColumnMapping = Partial<Record<CsvField, string>>;

/** Mapping par défaut : colonne CSV = nom du champ normalisé (format modèle §7.2) */
const DEFAULT_MAPPING: CsvColumnMapping = Object.fromEntries(
    CSV_FIELDS.map((f) => [f, f]),
);

/** Synonymes d'en-têtes connus (export réel du back-office Digifood, casse/espaces ignorés)
 *  → complètent le mapping pour les champs non couverts. */
const HEADER_SYNONYMS: Record<CsvField, string[]> = {
    order_id: ['long id', 'order id', 'commande', 'reference commande'],
    placed_at: ['placed at', 'date'],
    placed_at_date: ['placed at_date', 'placed at date'],
    placed_at_time: ['placed at_time', 'placed at time', 'heure'],
    location_id: ['location id', 'site id'],
    location_name: ['location', 'site'],
    shop_id: ['shop id', 'pdv id'],
    shop_name: ['shop', 'point de vente', 'pdv', 'buvette'],
    item_id: ['item id', 'product id', 'article id'],
    variation_id: ['variation id'],
    item_name: ['item', 'produit', 'article', 'product'],
    variation: ['variation', 'variante'],
    family: ['item family', 'famille', 'family', 'categorie'],
    quantity: ['quantity', 'quantite', 'qte', 'qty'],
    price_pu: ['price pu', 'prix unitaire centimes'],
    total_ttc: ['total ttc', 'montant ttc', 'ttc'],
    total_ht: ['total ht', 'montant ht', 'ht'],
    total_tva: ['total tva', 'montant tva'],
    tax_rate: ['tva%', 'tva %', 'tva', 'tax rate', 'vat'],
    external_reference: ['external reference', 'reference externe', 'ref externe'],
    type: ['type'],
    state: ['state', 'statut', 'etat'],
};

const normalizeHeader = (h: string) =>
    h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Nombre tolérant : virgule décimale française, espaces/insécables de milliers,
 * et formats mixtes "1.234,56" / "1,234.56" (le DERNIER séparateur est le
 * décimal, l'autre les milliers). Avant : `.replace(',', '.')` ne traitait que
 * la première virgule et "1.234,56" devenait 1.23456.
 */
export function parseAmount(raw: string): number {
    if (raw === null || raw === undefined) return NaN;
    let cleaned = String(raw).replace(/[\s  ]/g, '').replace(/[%€$]/g, '');
    if (cleaned === '') return NaN;
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma !== -1 && lastDot !== -1) {
        if (lastComma > lastDot) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        else cleaned = cleaned.replace(/,/g, '');
    } else if (lastComma !== -1) {
        cleaned = cleaned.indexOf(',') !== lastComma ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
    } else if (lastDot !== -1 && cleaned.indexOf('.') !== lastDot) {
        cleaned = cleaned.replace(/\./g, '');
    }
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
}

/**
 * Date tolérante : ISO, `YYYY-MM-DD` (+ heure séparée), `JJ/MM/AAAA`, `JJ-MM-AAAA`
 * (exports français, JOUR en premier), et date+heure combinées dans la même
 * cellule (« 05-07-2026 16:45 »). Sans fuseau dans le fichier → heure locale.
 */
function parseCsvDate(dateRaw: string, timeRaw: string): Date | null {
    if (!dateRaw) return null;
    let datePart = dateRaw.trim();
    let timePart = (timeRaw || '').trim();
    // Date + heure dans la même colonne : « 05-07-2026 16:45(:30) »
    const combined = datePart.match(/^(\S+)[ T](\d{1,2}:\d{2}(?::\d{2})?)$/);
    if (combined && !timePart) {
        datePart = combined[1];
        timePart = combined[2];
    }
    // JJ/MM/AAAA ou JJ-MM-AAAA → ISO (jour en premier : convention des exports FR)
    const dmy = datePart.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) datePart = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    const candidate = timePart && !/[T ]\d/.test(datePart) ? `${datePart}T${timePart}` : datePart;
    const d = new Date(candidate);
    return isNaN(d.getTime()) ? null : d;
}

export interface CsvImportReport {
    dryRun: boolean;
    ordersDetected: number;
    ordersCreated: number;
    ordersUpdated: number;
    ordersSkipped: number;
    productsCreated: number;
    locationsCreated: number;
    /** Bornes des dates INTERPRÉTÉES (contrôle visuel dans l'aperçu : une inversion
     *  jour/mois ou un format mal deviné se voit immédiatement sur la période). */
    periodStart: string | null;
    periodEnd: string | null;
    rejectedRows: Array<{ line: number; reason: string }>;
}

const BATCH_SIZE = 500;

@Injectable()
export class DigifoodCsvImportService {
    private readonly logger = new Logger(DigifoodCsvImportService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly ingestion: DigifoodIngestionService,
    ) { }

    /**
     * @param dryRun défaut TRUE (même philosophie que backfill-weezevent-prices) :
     *               rapport complet sans AUCUNE écriture ; dryRun=false exécute.
     * @param fileName nom du fichier uploadé, gardé uniquement pour l'historique (DigifoodCsvImportRun).
     */
    async importCsv(
        tenantId: string,
        integrationId: string,
        fileBuffer: Buffer,
        dryRun: boolean,
        providedMapping?: CsvColumnMapping | null,
        fileName?: string | null,
    ): Promise<CsvImportReport> {
        const startedAt = new Date();
        try {
            return await this.doImportCsv(tenantId, integrationId, fileBuffer, dryRun, providedMapping, fileName, startedAt);
        } catch (error) {
            // Les aperçus (dryRun=true) ne sont jamais tracés — seuls les imports réels le sont
            // (voir DigifoodCsvImportRun). Ne doit jamais masquer l'erreur d'origine.
            if (!dryRun) {
                await this.recordFailedImportRun(tenantId, integrationId, fileName, startedAt, error);
            }
            throw error;
        }
    }

    private async doImportCsv(
        tenantId: string,
        integrationId: string,
        fileBuffer: Buffer,
        dryRun: boolean,
        providedMapping: CsvColumnMapping | null | undefined,
        fileName: string | null | undefined,
        startedAt: Date,
    ): Promise<CsvImportReport> {
        const mapping = await this.resolveMapping(tenantId, providedMapping);
        const { rows, rejectedRows } = await this.parseRows(fileBuffer, mapping);

        // Mapping explicitement choisi par l'utilisateur → persisté pour les prochains
        // imports (même en dry-run : le choix de mapping est une config, pas une écriture métier).
        if (providedMapping && Object.keys(providedMapping).length > 0) {
            await this.persistMapping(tenantId, providedMapping);
        }

        // Groupement par order_id (ordre d'apparition conservé)
        const groups = new Map<string, Array<{ line: number; row: Record<CsvField, string> }>>();
        for (const entry of rows) {
            const orderId = entry.row.order_id;
            if (!groups.has(orderId)) groups.set(orderId, []);
            groups.get(orderId)!.push(entry);
        }

        const orders: NormalizedOrder[] = [];
        for (const [orderId, entries] of groups) {
            try {
                orders.push(this.buildNormalizedOrder(orderId, entries));
            } catch (error) {
                rejectedRows.push({
                    line: entries[0].line,
                    reason: `order ${orderId}: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        }

        // Pré-scan de l'existant (sert au rapport, en dry-run comme en réel)
        const [existingOrderIds, existingProductKeys, existingShopIds] = await Promise.all([
            this.existingSet(
                this.prisma.salesTransaction,
                tenantId,
                integrationId,
                orders.map((o) => o.id),
            ),
            this.existingSet(
                this.prisma.salesProduct,
                tenantId,
                integrationId,
                [...new Set(orders.flatMap((o) => o.items.map((i) => i.productKey)))],
            ),
            this.existingSet(
                this.prisma.salesLocation,
                tenantId,
                integrationId,
                [...new Set(orders.map((o) => o.shop?.id).filter(Boolean) as string[])],
            ),
        ]);

        const orderDates = orders.map((o) => o.placedAt.getTime()).filter((t) => Number.isFinite(t));
        const report: CsvImportReport = {
            dryRun,
            ordersDetected: groups.size,
            ordersCreated: 0,
            ordersUpdated: 0,
            ordersSkipped: 0,
            periodStart: orderDates.length ? new Date(Math.min(...orderDates)).toISOString() : null,
            periodEnd: orderDates.length ? new Date(Math.max(...orderDates)).toISOString() : null,
            productsCreated: [...new Set(orders.flatMap((o) => o.items.map((i) => i.productKey)))]
                .filter((k) => !existingProductKeys.has(k)).length,
            locationsCreated: [...new Set(orders.map((o) => o.shop?.id).filter(Boolean) as string[])]
                .filter((id) => !existingShopIds.has(id)).length,
            rejectedRows,
        };

        if (dryRun) {
            report.ordersCreated = orders.filter((o) => !existingOrderIds.has(o.id)).length;
            report.ordersUpdated = orders.filter((o) => existingOrderIds.has(o.id)).length;
            this.logger.log(
                `Import CSV Digifood (DRY-RUN) tenant ${tenantId} : ${report.ordersDetected} orders détectés, ${report.ordersCreated} nouveaux, ${report.rejectedRows.length} lignes rejetées`,
            );
            return report;
        }

        // Exécution réelle — par lots (gros fichiers), même chemin que le webhook
        for (let i = 0; i < orders.length; i += BATCH_SIZE) {
            for (const order of orders.slice(i, i + BATCH_SIZE)) {
                try {
                    const result = await this.ingestion.ingestOrder(tenantId, integrationId, order, 'csv');
                    if (result.skippedDuplicateRefund) report.ordersSkipped += 1;
                    else if (result.created) report.ordersCreated += 1;
                    else report.ordersUpdated += 1;
                } catch (error) {
                    report.ordersSkipped += 1;
                    report.rejectedRows.push({
                        line: groups.get(order.id)?.[0]?.line ?? 0,
                        reason: `order ${order.id}: ingestion échouée — ${error instanceof Error ? error.message : String(error)}`,
                    });
                }
            }
            this.logger.log(
                `Import CSV Digifood tenant ${tenantId} : ${Math.min(i + BATCH_SIZE, orders.length)}/${orders.length} orders traités`,
            );
        }

        await this.recordImportRun(tenantId, integrationId, fileName, startedAt, report);
        return report;
    }

    /** Trace un import RÉEL terminé (jamais les aperçus) — alimente l'historique affiché au front.
     *  Échec d'écriture volontairement avalé : l'import lui-même a réussi, ne pas le faire échouer
     *  pour un souci d'audit secondaire. */
    private async recordImportRun(
        tenantId: string,
        integrationId: string,
        fileName: string | null | undefined,
        startedAt: Date,
        report: CsvImportReport,
    ): Promise<void> {
        await this.prisma.digifoodCsvImportRun.create({
            data: {
                tenantId,
                integrationId,
                fileName: fileName ?? null,
                status: 'COMPLETED',
                ordersDetected: report.ordersDetected,
                ordersCreated: report.ordersCreated,
                ordersUpdated: report.ordersUpdated,
                ordersSkipped: report.ordersSkipped,
                productsCreated: report.productsCreated,
                locationsCreated: report.locationsCreated,
                rejectedCount: report.rejectedRows.length,
                periodStart: report.periodStart ? new Date(report.periodStart) : null,
                periodEnd: report.periodEnd ? new Date(report.periodEnd) : null,
                startedAt,
                completedAt: new Date(),
            },
        }).catch((err) => {
            this.logger.error(`Échec écriture historique import CSV Digifood tenant ${tenantId} : ${err instanceof Error ? err.message : String(err)}`);
        });
    }

    /** Trace un import RÉEL en échec (ex. CSV illisible/vide) — même logique d'avalement d'erreur
     *  d'écriture que recordImportRun, pour ne jamais masquer l'erreur d'origine à l'appelant. */
    private async recordFailedImportRun(
        tenantId: string,
        integrationId: string,
        fileName: string | null | undefined,
        startedAt: Date,
        error: unknown,
    ): Promise<void> {
        await this.prisma.digifoodCsvImportRun.create({
            data: {
                tenantId,
                integrationId,
                fileName: fileName ?? null,
                status: 'FAILED',
                errorMessage: error instanceof Error ? error.message : String(error),
                startedAt,
                completedAt: new Date(),
            },
        }).catch((err) => {
            this.logger.error(`Échec écriture historique import CSV Digifood (échec) tenant ${tenantId} : ${err instanceof Error ? err.message : String(err)}`);
        });
    }

    /** Historique des imports RÉELS (dryRun=false) pour une intégration — dernières 20 exécutions. */
    async getImportHistory(tenantId: string, integrationId: string) {
        return this.prisma.digifoodCsvImportRun.findMany({
            where: { tenantId, integrationId },
            orderBy: { startedAt: 'desc' },
            take: 20,
            select: {
                id: true,
                fileName: true,
                status: true,
                ordersDetected: true,
                ordersCreated: true,
                ordersUpdated: true,
                ordersSkipped: true,
                productsCreated: true,
                locationsCreated: true,
                rejectedCount: true,
                periodStart: true,
                periodEnd: true,
                errorMessage: true,
                startedAt: true,
                completedAt: true,
            },
        });
    }

    /**
     * Mapping colonnes CSV → champs normalisés. Priorité :
     * mapping fourni par le front > CsvMapping persisté du tenant > défaut (identité).
     * Les synonymes d'en-têtes connus complètent ensuite les champs non couverts
     * au moment du parse (fichiers d'export réels Digifood, cf. HEADER_SYNONYMS).
     */
    private async resolveMapping(
        tenantId: string,
        provided?: CsvColumnMapping | null,
    ): Promise<CsvColumnMapping> {
        const stored = await this.prisma.csvMapping.findFirst({
            where: { tenantId, mappingType: 'digifood-orders' },
            orderBy: { updatedAt: 'desc' },
            select: { mapping: true },
        });
        const storedMapping =
            stored?.mapping && typeof stored.mapping === 'object'
                ? (stored.mapping as Record<string, string>)
                : {};
        return { ...DEFAULT_MAPPING, ...storedMapping, ...(provided ?? {}) };
    }

    /** Persiste le mapping choisi (une seule ligne par tenant, écrasée à chaque choix). */
    private async persistMapping(tenantId: string, mapping: CsvColumnMapping): Promise<void> {
        const existing = await this.prisma.csvMapping.findFirst({
            where: { tenantId, mappingType: 'digifood-orders' },
            select: { id: true },
        });
        if (existing) {
            await this.prisma.csvMapping.update({
                where: { id: existing.id },
                data: { mapping: mapping as any },
            });
        } else {
            await this.prisma.csvMapping.create({
                data: { tenantId, mappingType: 'digifood-orders', mapping: mapping as any },
            });
        }
    }

    /** Complète le mapping avec les synonymes d'en-têtes pour les champs dont la colonne
     *  mappée n'existe pas dans le fichier (auto-détection du format d'export réel). */
    private completeMappingFromHeaders(
        mapping: CsvColumnMapping,
        headers: string[],
    ): CsvColumnMapping {
        const byNormalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
        const completed: CsvColumnMapping = { ...mapping };
        for (const field of CSV_FIELDS) {
            const mapped = completed[field];
            if (mapped && byNormalized.has(normalizeHeader(mapped))) {
                completed[field] = byNormalized.get(normalizeHeader(mapped));
                continue;
            }
            const synonym = HEADER_SYNONYMS[field].find((s) => byNormalized.has(s));
            completed[field] = synonym ? byNormalized.get(synonym) : undefined;
        }
        return completed;
    }

    /** Parse en flux (csv-parse), délimiteur , ; ou TAB auto-détecté, BOM toléré. */
    private async parseRows(
        fileBuffer: Buffer,
        baseMapping: CsvColumnMapping,
    ): Promise<{
        rows: Array<{ line: number; row: Record<CsvField, string> }>;
        rejectedRows: Array<{ line: number; reason: string }>;
    }> {
        if (!fileBuffer?.length) throw new BadRequestException('Fichier CSV vide');

        // Détection d'encodage : les exports Digifood/Excel côté France sont parfois en
        // Windows-1252 plutôt qu'UTF-8. Un décodage UTF-8 forcé transforme alors le "€"
        // (octet seul 0x80, invalide en UTF-8) et les lettres accentuées en "�", ce qui
        // casse ensuite le parsing des montants (parseAmount) → lignes rejetées à tort.
        const detected = chardet.detect(fileBuffer);
        const encoding = detected && iconv.encodingExists(detected) ? detected : 'UTF-8';
        const content = iconv.decode(fileBuffer, encoding);

        const firstLine = content.slice(0, 8192).split(/\r?\n/)[0] ?? '';
        const counts: Array<[string, number]> = [
            ['\t', (firstLine.match(/\t/g) ?? []).length],
            [';', (firstLine.match(/;/g) ?? []).length],
            [',', (firstLine.match(/,/g) ?? []).length],
        ];
        const delimiter = counts.sort((a, b) => b[1] - a[1])[0][1] > 0
            ? counts.sort((a, b) => b[1] - a[1])[0][0]
            : ',';

        const records: Array<Record<string, string>> = await new Promise((resolve, reject) => {
            parse(
                content,
                { columns: true, bom: true, trim: true, delimiter, skip_empty_lines: true, relax_column_count: true },
                (err, out) => (err ? reject(new BadRequestException(`CSV illisible : ${err.message}`)) : resolve(out as Array<Record<string, string>>)),
            );
        });
        if (records.length === 0) return { rows: [], rejectedRows: [] };

        const mapping = this.completeMappingFromHeaders(baseMapping, Object.keys(records[0]));

        const rows: Array<{ line: number; row: Record<CsvField, string> }> = [];
        const rejectedRows: Array<{ line: number; reason: string }> = [];
        records.forEach((record, index) => {
            const line = index + 2; // 1 = header
            const row = Object.fromEntries(
                CSV_FIELDS.map((field) => {
                    const col = mapping[field];
                    return [field, col ? (record[col] ?? '').toString().trim() : ''];
                }),
            ) as Record<CsvField, string>;

            if (!row.order_id) return rejectedRows.push({ line, reason: 'order_id manquant' });
            if (!row.item_name && !row.item_id)
                return rejectedRows.push({ line, reason: 'item_name/item_id manquants' });
            if (row.quantity === '' || !Number.isFinite(parseAmount(row.quantity)))
                return rejectedRows.push({ line, reason: `quantity invalide : "${row.quantity}"` });
            const hasPricePu = row.price_pu !== '' && Number.isFinite(parseAmount(row.price_pu));
            const hasTotalTtc = row.total_ttc !== '' && Number.isFinite(parseAmount(row.total_ttc));
            if (!hasPricePu && !hasTotalTtc)
                return rejectedRows.push({ line, reason: `prix invalide (price_pu="${row.price_pu}", total_ttc="${row.total_ttc}")` });
            if (/cancel|annul|abort/i.test(row.state))
                return rejectedRows.push({ line, reason: `state "${row.state}" — ligne annulée ignorée` });
            rows.push({ line, row });
        });
        return { rows, rejectedRows };
    }

    /** Reconstruit un NormalizedOrder (même contrat que le webhook) depuis les lignes d'un order. */
    private buildNormalizedOrder(
        orderId: string,
        entries: Array<{ line: number; row: Record<CsvField, string> }>,
    ): NormalizedOrder {
        const first = entries[0].row;
        // Export réel : type peut être « Refund »/« Remboursement » — détection tolérante
        const isRefund = entries.some((e) => /refund|rembours/i.test(e.row.type));
        const sign: 1 | -1 = isRefund ? -1 : 1;

        const items: NormalizedItem[] = entries.map(({ row }) => {
            const qtyAbs = Math.abs(parseAmount(row.quantity));
            const qty = qtyAbs * sign;
            // price_pu = unitaire en CENTIMES ; sinon total_ttc = total de ligne en EUROS
            const unitPrice = row.price_pu !== '' && Number.isFinite(parseAmount(row.price_pu))
                ? Math.abs(parseAmount(row.price_pu)) / 100
                : qtyAbs > 0
                    ? Math.abs(parseAmount(row.total_ttc)) / qtyAbs
                    : Math.abs(parseAmount(row.total_ttc));
            // Taux de TVA : colonne TVA% en priorité ; sinon dérivé du ratio TTC/HT réel
            // de la ligne. C'est ce taux (ti.vat) qui rend les prix HT exacts dans tout
            // DataFriday : HT = TTC ÷ (1 + vat/100) (pricing service + agrégats SQL).
            let vatRate = row.tax_rate ? parseAmount(row.tax_rate) : NaN;
            if (!Number.isFinite(vatRate)) {
                const ht = Math.abs(parseAmount(row.total_ht));
                const ttc = Math.abs(parseAmount(row.total_ttc));
                vatRate = Number.isFinite(ht) && Number.isFinite(ttc) && ht > 0
                    ? Math.max(0, Math.round((ttc / ht - 1) * 100 * 100) / 100)
                    : 0;
            }
            return {
                id: row.item_id || null,
                productKey: row.variation_id || slugifyProductKey(row.item_name || row.item_id, row.variation || null),
                name: row.item_name || `Item ${row.item_id}`,
                namePrivate: null,
                variation: row.variation || null,
                variationId: row.variation_id || null,
                family: row.family || null,
                quantity: qty,
                unitPrice,
                vatRate,
                externalReference: row.external_reference || null,
                barcode: null,
                depth: 0,
                parentItemId: null,
                raw: { ...row, source: 'csv' },
            };
        });

        // placed_at (ISO) OU placed_at_date + placed_at_time (export réel en 2 colonnes)
        const placedAt = parseCsvDate(first.placed_at || first.placed_at_date, first.placed_at_time);
        if (first.placed_at || first.placed_at_date) {
            if (!placedAt) {
                throw new Error(`placed_at invalide : "${first.placed_at || first.placed_at_date} ${first.placed_at_time}"`);
            }
        }
        const total = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);

        // L'export réel ne porte pas d'ID de site/PDV, seulement des NOMS → clé stable
        // dérivée du nom (slug). Un même « Buvette B-03 » retombe toujours sur la même
        // SalesLocation ; si l'id existe (format modèle), il reste prioritaire.
        const locationId = first.location_id || (first.location_name ? `loc:${slugifyProductKey(first.location_name)}` : '');
        const shopId = first.shop_id || (first.shop_name ? `shop:${slugifyProductKey(first.shop_name)}` : '');

        return {
            // order_id tel quel (PAS de préfixe refund:) : un même remboursement reçu
            // par webhook v26 puis réimporté en CSV doit retomber sur le MÊME externalId
            // pour que l'upsert reste idempotent (aucun double comptage, §7.2).
            id: orderId,
            type: isRefund ? 'refund' : 'sale',
            total: Math.round(total * 100) / 100,
            placedAt: placedAt ?? new Date(),
            location: locationId
                ? { id: locationId, name: first.location_name || `Location ${locationId}` }
                : null,
            shop: shopId
                ? { id: shopId, name: first.shop_name || `Shop ${shopId}` }
                : null,
            items,
            payments: [],
            discounts: [],
            relationships: [],
            beforeDiscounts: null,
            medium: null,
            shortId: null,
            sessionId: null,
            cashier: null,
            softwareVersion: null,
            originalOrderId: null,
            raw: { source: 'csv', order_id: orderId, rows: entries.map((e) => e.row) },
        };
    }

    /** Set des externalId existants (transaction/produit/location) pour le rapport. */
    private async existingSet(
        model: { findMany: (args: any) => Promise<Array<{ externalId: string }>> },
        tenantId: string,
        integrationId: string,
        externalIds: string[],
    ): Promise<Set<string>> {
        if (externalIds.length === 0) return new Set();
        const found = await model.findMany({
            where: { tenantId, integrationId, externalId: { in: externalIds } },
            select: { externalId: true },
        });
        return new Set(found.map((f) => f.externalId));
    }
}
