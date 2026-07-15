import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { sortObjectDeep } from '../utils/sort-object.util';

/**
 * Signature webhook Digifood : HMAC-SHA256 (hex) calculé sur le JSON du body
 * trié récursivement par clés (sortObjectDeep). Ne PAS réutiliser
 * WebhookSignatureService (Weezevent) : lui signe le JSON.stringify brut non trié.
 * Comparaison en temps constant (timingSafeEqual).
 */
@Injectable()
export class DigifoodSignatureService {
    computeSignature(body: unknown, secret: string): string {
        const canonical = JSON.stringify(sortObjectDeep(body));
        return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
    }

    validateSignature(body: unknown, signature: string, secret: string): boolean {
        if (!signature || !secret) return false;
        const expected = this.computeSignature(body, secret);
        const provided = signature.trim().toLowerCase();
        const expectedBuf = Buffer.from(expected, 'utf8');
        const providedBuf = Buffer.from(provided, 'utf8');
        if (expectedBuf.length !== providedBuf.length) return false;
        return crypto.timingSafeEqual(expectedBuf, providedBuf);
    }
}
