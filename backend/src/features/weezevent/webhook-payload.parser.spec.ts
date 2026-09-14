import { BadRequestException } from '@nestjs/common';
import { parseWeezeventWebhookPayload } from './webhook-payload.parser';

describe('parseWeezeventWebhookPayload (BUG-379-02)', () => {
    it('parses the documented WeezPay shape and keeps unknown fields', () => {
        const parsed = parseWeezeventWebhookPayload({
            type: 'transaction',
            method: 'create',
            origin: 'gill',
            organization_id: 4242,
            id: 987654,
            values: { id: 987654, amount: 1250 },
            undocumented: true,
        });
        expect(parsed).toMatchObject({
            type: 'transaction',
            method: 'create',
            origin: 'gill',
            organizationId: '4242',
            objectId: '987654',
            values: { id: 987654, amount: 1250 },
        });
        expect(parsed.raw.undocumented).toBe(true);
    });

    it('still understands the legacy { data: { id } } shape', () => {
        const parsed = parseWeezeventWebhookPayload({ type: 'transaction', method: 'delete', data: { id: 'tx-1' } });
        expect(parsed.objectId).toBe('tx-1');
        expect(parsed.values).toEqual({ id: 'tx-1' });
    });

    it('rejects a non-object body, an unknown type or an unknown method', () => {
        expect(() => parseWeezeventWebhookPayload(null)).toThrow(BadRequestException);
        expect(() => parseWeezeventWebhookPayload([])).toThrow(BadRequestException);
        expect(() => parseWeezeventWebhookPayload({ type: 'nope', method: 'create' })).toThrow(BadRequestException);
        expect(() => parseWeezeventWebhookPayload({ type: 'transaction', method: 'upsert' })).toThrow(BadRequestException);
    });
});
