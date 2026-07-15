/**
 * Normalisation des payloads Digifood → NormalizedOrder (PLAN_INTEGRATION_DIGIFOOD §5.1/§5.3).
 * Unifie les trois formes d'entrée en un ordre plat unique consommé par l'ingestion
 * (webhook ET import CSV) :
 *  - order.completed type sale/order (ou absent)   → vente, montants tels quels ;
 *  - order.completed type refund (POS v26)         → quantités/total FORCÉS négatifs ;
 *  - order.refunded (POS v24)                      → pseudo-ordre `refund:<id>`, items
 *    = refunded_items[] forcés négatifs, lien vers l'ordre d'origine en métadonnées.
 * Décision 3 du plan : on ne fait pas confiance au signe des payloads refund tant que
 * non vérifié sur données réelles → normalisation tolérante (|x| puis signe imposé).
 */

export interface NormalizedItem {
    /** id de ligne de ticket Digifood (externalItemId) */
    id: string | null;
    /** Clé produit stable : variation_id, sinon fallback slug(name|variation) (§5.2.3) */
    productKey: string;
    name: string;
    namePrivate: string | null;
    variation: string | null;
    variationId: string | null;
    family: string | null;
    /** Quantité EFFECTIVE (× quantités des parents), signée (négative si refund) */
    quantity: number;
    /** Prix unitaire TTC en euros (price_pu / 100), déjà après remise */
    unitPrice: number;
    /** Taux de TVA en % (parseFloat(tax_rate)) — même convention que ti.vat */
    vatRate: number;
    externalReference: string | null;
    barcode: string | null;
    /** Profondeur dans l'arbre formule (0 = racine) + parent pour reconstituer l'arbre */
    depth: number;
    parentItemId: string | null;
    /** Ligne source Digifood complète (rawData) */
    raw: Record<string, unknown>;
}

export interface NormalizedOrder {
    /** externalId de la SalesTransaction (data.id, ou `refund:<data.id>` en v24) */
    id: string;
    type: 'sale' | 'refund';
    /** Total TTC en euros, signé */
    total: number;
    placedAt: Date;
    location: { id: string; name: string } | null;
    shop: { id: string; name: string } | null;
    items: NormalizedItem[];
    payments: unknown[];
    discounts: unknown[];
    relationships: Array<Record<string, unknown>>;
    beforeDiscounts: unknown;
    medium: string | null;
    shortId: string | null;
    sessionId: string | null;
    cashier: unknown;
    softwareVersion: string | null;
    /** v24 : id de l'ordre d'origine remboursé */
    originalOrderId: string | null;
    /** data complet du webhook (rawData de la transaction) */
    raw: Record<string, unknown>;
}

const asString = (v: unknown): string | null =>
    v === null || v === undefined || v === '' ? null : String(v);

const asNumber = (v: unknown): number => {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** slug stable pour le fallback de clé produit (lignes v24 sans variation_id) */
export function slugifyProductKey(name: string, variation?: string | null): string {
    const base = variation && variation !== name ? `${name}|${variation}` : name;
    return base
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9|]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function itemProductKey(item: Record<string, unknown>): string {
    const variationId = asString(item.variation_id);
    if (variationId) return variationId;
    return slugifyProductKey(String(item.name ?? 'produit'), asString(item.variation));
}

/**
 * Aplatissement récursif items[] ∪ children[] (toutes profondeurs) en lignes sœurs (§5.3).
 * - quantité effective d'un enfant = child.quantity × quantité effective du parent ;
 * - le revenu reste juste (parent formule à 0 €, enfants porteurs de prix, cf. doc
 *   Digifood ex. 3.2 : total = somme des enfants, pas de double comptage) ;
 * - `sign` = -1 pour un refund : les quantités sont forcées négatives (|q| × sign).
 */
export function flattenItems(
    items: Array<Record<string, unknown>>,
    sign: 1 | -1,
    depth = 0,
    parentItemId: string | null = null,
    parentQty = 1,
): NormalizedItem[] {
    const lines: NormalizedItem[] = [];
    for (const item of items ?? []) {
        if (!item || typeof item !== 'object') continue;
        const ownQty = Math.abs(asNumber(item.quantity ?? 1)) * parentQty;
        const name = String(item.name ?? 'Produit Digifood');
        const variation = asString(item.variation);
        lines.push({
            id: asString(item.id),
            productKey: itemProductKey(item),
            name,
            namePrivate: asString(item.name_private),
            variation,
            variationId: asString(item.variation_id),
            family: asString(item.family),
            quantity: ownQty * sign,
            unitPrice: asNumber(item.price_pu) / 100,
            vatRate: asNumber(item.tax_rate),
            externalReference: asString(item.external_reference),
            barcode: asString(item.barcode),
            depth,
            parentItemId,
            raw: { ...item, children: undefined },
        });
        const children = Array.isArray(item.children) ? item.children : [];
        if (children.length > 0) {
            lines.push(
                ...flattenItems(children, sign, depth + 1, asString(item.id), ownQty),
            );
        }
    }
    return lines;
}

function parseDate(value: unknown, fallback?: unknown): Date {
    for (const candidate of [value, fallback]) {
        if (candidate === null || candidate === undefined) continue;
        const d =
            typeof candidate === 'number'
                ? new Date(candidate * (candidate < 1e12 ? 1000 : 1)) // epoch s ou ms
                : new Date(String(candidate));
        if (!isNaN(d.getTime())) return d;
    }
    return new Date();
}

function extractCommon(data: Record<string, unknown>) {
    const location = data.location as Record<string, unknown> | undefined;
    const shop = data.shop as Record<string, unknown> | undefined;
    const software = data.software as Record<string, unknown> | undefined;
    return {
        location: location?.id != null
            ? { id: String(location.id), name: String(location.name ?? `Location ${location.id}`) }
            : null,
        shop: shop?.id != null
            ? { id: String(shop.id), name: String(shop.name ?? `Shop ${shop.id}`) }
            : null,
        payments: Array.isArray(data.transactions) ? data.transactions : [],
        discounts: Array.isArray(data.discounts) ? data.discounts : [],
        relationships: Array.isArray(data.relationships)
            ? (data.relationships as Array<Record<string, unknown>>)
            : [],
        beforeDiscounts: data.before_discounts ?? null,
        medium: asString(data.medium),
        shortId: asString(data.short_id),
        sessionId: asString(data.session_id),
        cashier: data.cashier ?? null,
        softwareVersion: asString(software?.version),
    };
}

/**
 * Point d'entrée : payload webhook Digifood ({ event, id, timestamp, data }) → NormalizedOrder.
 * Jette une Error descriptive si le payload ne porte pas le minimum exploitable
 * (data.id + items[]/refunded_items[]) — le contrôleur journalise et répond selon §4.6.
 */
export function normalizeOrder(payload: Record<string, unknown>): NormalizedOrder {
    const event = String(payload.event ?? '');
    const data = payload.data as Record<string, unknown> | undefined;
    if (!data || typeof data !== 'object' || data.id == null) {
        throw new Error(`Payload Digifood invalide : data.id manquant (event=${event})`);
    }

    if (event === 'order.refunded') {
        // POS v24 : remboursement séparé, payload minimal, référence à l'ordre d'origine
        const refundedItems = Array.isArray(data.refunded_items) ? data.refunded_items : [];
        if (refundedItems.length === 0) {
            throw new Error(`order.refunded ${data.id} sans refunded_items[]`);
        }
        const common = extractCommon(data);
        const order = data.order as Record<string, unknown> | undefined;
        const items = flattenItems(refundedItems as Array<Record<string, unknown>>, -1);
        const rawTotal = asNumber(data.total ?? data.amount);
        const total = rawTotal !== 0
            ? -Math.abs(rawTotal) / 100
            : items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
        return {
            id: `refund:${data.id}`,
            type: 'refund',
            total,
            placedAt: parseDate(data.refunded_at ?? data.placed_at, payload.timestamp),
            ...common,
            // payload minimal v24 : retomber sur le contexte de l'ordre d'origine si présent
            location: common.location ?? (order ? extractCommon(order).location : null),
            shop: common.shop ?? (order ? extractCommon(order).shop : null),
            items,
            originalOrderId: order?.id != null ? String(order.id) : asString(data.order_id),
            raw: data,
        };
    }

    if (event !== 'order.completed') {
        throw new Error(`Événement Digifood non supporté : ${event}`);
    }

    const type = String(data.type ?? 'sale');
    const isRefund = type === 'refund'; // POS v26 : commande indépendante type=refund
    const sign: 1 | -1 = isRefund ? -1 : 1;
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) {
        throw new Error(`order.completed ${data.id} sans items[]`);
    }
    const common = extractCommon(data);
    const flattened = flattenItems(items as Array<Record<string, unknown>>, sign);
    const rawTotal = asNumber(data.total) / 100;
    const total = isRefund ? -Math.abs(rawTotal) : rawTotal;
    const related = common.relationships.find(
        (r) => r && (r.type === 'original' || r.related_order_id != null),
    );

    return {
        id: String(data.id),
        type: isRefund ? 'refund' : 'sale',
        total,
        placedAt: parseDate(data.placed_at, payload.timestamp),
        ...common,
        items: flattened,
        originalOrderId: related?.related_order_id != null ? String(related.related_order_id) : null,
        raw: data,
    };
}
