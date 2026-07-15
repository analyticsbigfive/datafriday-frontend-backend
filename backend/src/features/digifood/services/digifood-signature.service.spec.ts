import * as crypto from 'crypto';
import { DigifoodSignatureService } from './digifood-signature.service';
import { sortObjectDeep } from '../utils/sort-object.util';

const SECRET = 'test-secret-digifood';

// Payload d'exemple au format webhook Digifood (enveloppe + order minimal)
const payload = {
    event: 'order.completed',
    id: 'c2a4e5f6-1234-4abc-9def-000000000001',
    timestamp: 1751900000,
    data: {
        id: 'order_Qm123',
        type: 'sale',
        total: 6000,
        placed_at: '2026-07-01T12:00:00Z',
        shop: { id: 'shop_1', name: 'Buvette B-03' },
        location: { id: 'loc_1', name: 'Zoo de Vanves' },
        items: [
            { id: 'it_1', name: 'Formule Burger', price_pu: 0, quantity: 1, children: [
                { id: 'it_2', name: 'Burger', price_pu: 4500, quantity: 1 },
                { id: 'it_3', name: 'Boisson', price_pu: 1500, quantity: 1 },
            ] },
        ],
    },
};

describe('sortObjectDeep', () => {
    it('trie les clés à toutes les profondeurs sans toucher aux tableaux', () => {
        const input = { b: 1, a: { z: [3, 1, { y: 2, x: 1 }], w: 2 } };
        expect(JSON.stringify(sortObjectDeep(input))).toBe(
            '{"a":{"w":2,"z":[3,1,{"x":1,"y":2}]},"b":1}',
        );
    });

    it('laisse intacts null, nombres, chaînes et booléens', () => {
        expect(sortObjectDeep(null)).toBeNull();
        expect(sortObjectDeep(42)).toBe(42);
        expect(sortObjectDeep('abc')).toBe('abc');
        expect(sortObjectDeep(true)).toBe(true);
    });
});

describe('DigifoodSignatureService', () => {
    const service = new DigifoodSignatureService();

    it('calcule le HMAC-SHA256 hex du JSON trié récursivement', () => {
        const expected = crypto
            .createHmac('sha256', SECRET)
            .update(JSON.stringify(sortObjectDeep(payload)), 'utf8')
            .digest('hex');
        expect(service.computeSignature(payload, SECRET)).toBe(expected);
    });

    it("est INSENSIBLE à l'ordre des clés du body reçu (≠ Weezevent)", () => {
        const shuffled = {
            timestamp: payload.timestamp,
            data: {
                items: payload.data.items,
                location: { name: 'Zoo de Vanves', id: 'loc_1' },
                shop: { name: 'Buvette B-03', id: 'shop_1' },
                placed_at: payload.data.placed_at,
                total: payload.data.total,
                type: payload.data.type,
                id: payload.data.id,
            },
            id: payload.id,
            event: payload.event,
        };
        expect(service.computeSignature(shuffled, SECRET)).toBe(
            service.computeSignature(payload, SECRET),
        );
    });

    it('valide une signature correcte (et tolère casse/espaces du header)', () => {
        const sig = service.computeSignature(payload, SECRET);
        expect(service.validateSignature(payload, sig, SECRET)).toBe(true);
        expect(service.validateSignature(payload, ` ${sig.toUpperCase()} `, SECRET)).toBe(true);
    });

    it('rejette payload altéré, mauvais secret, signature vide ou de longueur différente', () => {
        const sig = service.computeSignature(payload, SECRET);
        const tampered = { ...payload, data: { ...payload.data, total: 9999 } };
        expect(service.validateSignature(tampered, sig, SECRET)).toBe(false);
        expect(service.validateSignature(payload, sig, 'autre-secret')).toBe(false);
        expect(service.validateSignature(payload, '', SECRET)).toBe(false);
        expect(service.validateSignature(payload, 'deadbeef', SECRET)).toBe(false);
    });
});
