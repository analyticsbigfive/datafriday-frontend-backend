import { Prisma } from '@prisma/client';
import { buildSalesPriceAggDeltas, SalesPriceAggDeltaSource } from './sales-price-agg-delta';

const D1 = new Date('2026-09-20T18:00:00Z');
const D2 = new Date('2026-09-20T19:30:00Z');

function item(overrides: Partial<SalesPriceAggDeltaSource> = {}): SalesPriceAggDeltaSource {
    return {
        locationId: 'loc-1',
        productId: 'prod-1',
        productName: '  Hot Dog Porc ',
        rawData: { item_id: 'variation_abc' },
        unitPrice: new Prisma.Decimal('4.5'),
        vat: new Prisma.Decimal('10'),
        transactionDate: D1,
        ...overrides,
    };
}

describe('buildSalesPriceAggDeltas', () => {
    it('regroupe les items identiques sur la clé SalesPriceAgg normalisée', () => {
        const rows = buildSalesPriceAggDeltas([item(), item({ transactionDate: D2 }), item({ productName: 'hot dog porc' })]);

        expect(rows).toEqual([{
            locationId: 'loc-1',
            productId: 'prod-1',
            itemWeezeventId: 'variation_abc',
            productNameNorm: 'hot dog porc',
            unitPrice: '4.50',
            vat: '10.00',
            delta: 3,
            lastSoldAt: D2,
        }]);
    });

    it('sépare les clés par prix, tva, produit et location', () => {
        const rows = buildSalesPriceAggDeltas([
            item(),
            item({ unitPrice: 5 }),
            item({ vat: 5.5 }),
            item({ locationId: 'loc-2' }),
        ]);
        expect(rows).toHaveLength(4);
        expect(rows.every((r) => r.delta === 1)).toBe(true);
    });

    it('ignore les items sans location ou à prix nul/négatif, comme le recalcul SQL', () => {
        const rows = buildSalesPriceAggDeltas([
            item({ locationId: null }),
            item({ unitPrice: 0 }),
            item({ unitPrice: -2 }),
        ]);
        expect(rows).toEqual([]);
    });

    it('dérive itemWeezeventId de rawData.item_id, vide sinon (Digifood), productId vide si non résolu', () => {
        const rows = buildSalesPriceAggDeltas([item({ rawData: { foo: 1 }, productId: null, productName: null })]);
        expect(rows[0]).toMatchObject({ itemWeezeventId: '', productId: '', productNameNorm: '' });
    });

    it('ré-émission : -anciens +nouveaux se compensent, seule la différence est écrite', () => {
        const removed = [item({ unitPrice: 4.5 }), item({ unitPrice: 3 })];
        const added = [item({ unitPrice: 4.5, transactionDate: D2 }), item({ unitPrice: 6 })];

        const rows = buildSalesPriceAggDeltas(added, removed);

        expect(rows).toEqual(expect.arrayContaining([
            expect.objectContaining({ unitPrice: '4.50', delta: 0, lastSoldAt: D2 }),
            expect.objectContaining({ unitPrice: '3.00', delta: -1 }),
            expect.objectContaining({ unitPrice: '6.00', delta: 1 }),
        ]));
        expect(rows).toHaveLength(3);
    });

    it('une clé retirée puis ré-ajoutée à l\'identique garde un delta 0 mais met à jour lastSoldAt', () => {
        const rows = buildSalesPriceAggDeltas([item({ transactionDate: D2 })], [item()]);
        expect(rows).toEqual([expect.objectContaining({ delta: 0, lastSoldAt: D2 })]);
    });

    it('une clé uniquement retirée est conservée (delta négatif) pour la purge', () => {
        const rows = buildSalesPriceAggDeltas([], [item(), item()]);
        expect(rows).toEqual([expect.objectContaining({ delta: -2 })]);
    });
});
