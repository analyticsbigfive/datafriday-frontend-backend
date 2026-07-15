import { flattenItems, normalizeOrder, slugifyProductKey } from './digifood-order-normalizer';

describe('slugifyProductKey', () => {
    it('normalise accents, casse et espaces, et concatène la variation', () => {
        expect(slugifyProductKey('Crêpe Sucrée')).toBe('crepe-sucree');
        expect(slugifyProductKey('Bière', '50cl')).toBe('biere|50cl');
        expect(slugifyProductKey('Menu', 'Menu')).toBe('menu');
    });
});

describe('flattenItems (§5.3 — formules/modificateurs)', () => {
    const formule = [
        {
            id: 'it_1', name: 'Formule Burger + Boisson', price_pu: 0, quantity: 2, variation_id: 'var_f1',
            children: [
                {
                    id: 'it_2', name: 'Burger', price_pu: 4500, quantity: 1, variation_id: 'var_b1',
                    children: [
                        { id: 'it_3', name: 'Sans sauce', price_pu: 0, quantity: 1 },
                    ],
                },
                { id: 'it_4', name: 'Boisson', price_pu: 1500, quantity: 2, variation_id: 'var_d1' },
            ],
        },
    ];

    it('aplati récursivement en lignes sœurs avec quantités effectives (× parents)', () => {
        const lines = flattenItems(formule as any, 1);
        expect(lines).toHaveLength(4);
        const byId = new Map(lines.map((l) => [l.id, l]));
        expect(byId.get('it_1')).toMatchObject({ quantity: 2, unitPrice: 0, depth: 0, parentItemId: null });
        // 2 formules → burger ×2, sans-sauce ×2, boisson 2×2=4
        expect(byId.get('it_2')).toMatchObject({ quantity: 2, unitPrice: 45, depth: 1, parentItemId: 'it_1' });
        expect(byId.get('it_3')).toMatchObject({ quantity: 2, unitPrice: 0, depth: 2, parentItemId: 'it_2' });
        expect(byId.get('it_4')).toMatchObject({ quantity: 4, unitPrice: 15, depth: 1, parentItemId: 'it_1' });
    });

    it('le revenu SUM(unitPrice × qty) reste juste (parent 0 €, enfants porteurs)', () => {
        const lines = flattenItems(formule as any, 1);
        const revenue = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
        expect(revenue).toBe(2 * 45 + 4 * 15); // 150 € = 2 formules à 75 €
    });

    it('productKey = variation_id sinon slug(name|variation)', () => {
        const lines = flattenItems(formule as any, 1);
        expect(lines.find((l) => l.id === 'it_2')?.productKey).toBe('var_b1');
        expect(lines.find((l) => l.id === 'it_3')?.productKey).toBe('sans-sauce');
    });

    it('force les quantités négatives pour un refund, même si le payload est positif', () => {
        const lines = flattenItems(formule as any, -1);
        expect(lines.every((l) => l.quantity < 0)).toBe(true);
        expect(lines.find((l) => l.id === 'it_4')?.quantity).toBe(-4);
    });
});

describe('normalizeOrder (§5.1 — sale / refund v26 / refunded v24)', () => {
    const baseData = {
        id: 'order_1',
        total: 6000,
        placed_at: '2026-07-01T12:00:00Z',
        shop: { id: 'shop_1', name: 'Buvette B-03' },
        location: { id: 'loc_1', name: 'Zoo de Vanves' },
        transactions: [{ method: 'card', amount: 6000 }],
        discounts: [],
        software: { version: '26.1.3' },
        items: [
            { id: 'it_1', name: 'Burger', price_pu: 4500, quantity: 1, tax_rate: '10.0', external_reference: 'MI-42' },
            { id: 'it_2', name: 'Boisson', price_pu: 1500, quantity: 1, tax_rate: '5.5' },
        ],
    };

    it('order.completed sale : montants tels quels, dimensions extraites', () => {
        const order = normalizeOrder({ event: 'order.completed', id: 'whk-1', timestamp: 1751900000, data: baseData });
        expect(order).toMatchObject({
            id: 'order_1',
            type: 'sale',
            total: 60,
            location: { id: 'loc_1', name: 'Zoo de Vanves' },
            shop: { id: 'shop_1', name: 'Buvette B-03' },
            softwareVersion: '26.1.3',
            originalOrderId: null,
        });
        expect(order.items).toHaveLength(2);
        expect(order.items[0]).toMatchObject({ quantity: 1, unitPrice: 45, vatRate: 10, externalReference: 'MI-42' });
        expect(order.placedAt.toISOString()).toBe('2026-07-01T12:00:00.000Z');
    });

    it('type=order (v24 mutable) est traité comme une vente', () => {
        const order = normalizeOrder({ event: 'order.completed', id: 'whk-2', data: { ...baseData, type: 'order' } });
        expect(order.type).toBe('sale');
        expect(order.total).toBe(60);
    });

    it('order.completed type=refund (v26) : total et quantités FORCÉS négatifs même si positifs', () => {
        const order = normalizeOrder({
            event: 'order.completed',
            id: 'whk-3',
            data: {
                ...baseData,
                id: 'order_refund_1',
                type: 'refund',
                total: 6000, // positif dans le payload → on n'y fait pas confiance
                relationships: [{ type: 'original', related_order_id: 'order_1' }],
            },
        });
        expect(order.type).toBe('refund');
        expect(order.total).toBe(-60);
        expect(order.items.every((i) => i.quantity < 0)).toBe(true);
        expect(order.originalOrderId).toBe('order_1');
    });

    it('order.refunded (v24) : pseudo-ordre refund:<id>, items négatifs, lien origine', () => {
        const order = normalizeOrder({
            event: 'order.refunded',
            id: 'whk-4',
            timestamp: 1751900000,
            data: {
                id: 'rf_9',
                order: { id: 'order_1', shop: baseData.shop, location: baseData.location },
                total: 1500,
                refunded_items: [{ id: 'it_2', name: 'Boisson', price_pu: 1500, quantity: -1, tax_rate: '5.5' }],
            },
        });
        expect(order).toMatchObject({
            id: 'refund:rf_9',
            type: 'refund',
            total: -15,
            originalOrderId: 'order_1',
            shop: { id: 'shop_1' },
            location: { id: 'loc_1' },
        });
        expect(order.items[0].quantity).toBe(-1);
    });

    it('rejette les payloads inexploitables (data.id ou items manquants, event inconnu)', () => {
        expect(() => normalizeOrder({ event: 'order.completed', data: {} })).toThrow(/data\.id/);
        expect(() => normalizeOrder({ event: 'order.completed', data: { id: 'x', items: [] } })).toThrow(/items/);
        expect(() => normalizeOrder({ event: 'order.refunded', data: { id: 'x' } })).toThrow(/refunded_items/);
        expect(() => normalizeOrder({ event: 'wallet.updated', data: { id: 'x' } })).toThrow(/non supporté/);
    });
});
