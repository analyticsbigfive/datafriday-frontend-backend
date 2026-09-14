import * as crypto from 'crypto';
import { WebhookSignatureService } from './webhook-signature.service';

describe('WebhookSignatureService (BUG-379-02 : signature sur le corps brut)', () => {
    const service = new WebhookSignatureService();
    const secret = 'super-secret';
    const raw = Buffer.from('{"type":"transaction","method":"create","id":42,"values":{"id":42}}');
    const hex = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const b64 = crypto.createHmac('sha256', secret).update(raw).digest('base64');

    it('accepts a hex HMAC-SHA256 of the raw body', () => {
        expect(service.validateSignature(raw, hex, secret)).toBe(true);
    });

    it('accepts a base64 HMAC-SHA256 of the raw body', () => {
        expect(service.validateSignature(raw, b64, secret)).toBe(true);
    });

    it('accepts the sha256= prefix', () => {
        expect(service.validateSignature(raw, `sha256=${hex}`, secret)).toBe(true);
    });

    it('is computed on the exact bytes, not on a re-serialized object', () => {
        const reordered = Buffer.from('{"method":"create","type":"transaction","id":42,"values":{"id":42}}');
        expect(service.validateSignature(reordered, hex, secret)).toBe(false);
    });

    it('rejects a wrong secret, a wrong signature and empty inputs', () => {
        expect(service.validateSignature(raw, hex, 'other')).toBe(false);
        expect(service.validateSignature(raw, 'deadbeef', secret)).toBe(false);
        expect(service.validateSignature(raw, '', secret)).toBe(false);
        expect(service.validateSignature(raw, hex, '')).toBe(false);
    });

    it('generateSignature round-trips with validateSignature', () => {
        expect(service.validateSignature(raw, service.generateSignature(raw, secret), secret)).toBe(true);
    });
});
