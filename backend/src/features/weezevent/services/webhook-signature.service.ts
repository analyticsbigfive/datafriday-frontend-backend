import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Signature des webhooks Weezevent : HMAC-SHA256(secret, corps brut de la requête).
 *
 * BUG-379-02 : vérifiée sur les OCTETS reçus (rawBody), plus sur `JSON.stringify` du body
 * déjà parsé et filtré par Nest : l'ordre des clés ou les espaces suffisaient à faire échouer
 * la comparaison. Weezevent ne documente ni le nom du header ni l'encodage : on accepte hex et
 * base64, avec ou sans préfixe `sha256=`, en comparaison à temps constant. À resserrer une
 * fois la réponse de Weezevent connue (fiche 379-02, questions au contact).
 */
@Injectable()
export class WebhookSignatureService {
    validateSignature(rawBody: Buffer | string, signature: string, secret: string): boolean {
        if (!signature || !secret) return false;
        const provided = signature.trim().replace(/^sha256=/i, '');
        const digest = crypto.createHmac('sha256', secret).update(rawBody).digest();
        return this.safeEqual(provided, digest.toString('hex')) || this.safeEqual(provided, digest.toString('base64'));
    }

    generateSignature(rawBody: Buffer | string, secret: string): string {
        return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    }

    private safeEqual(a: string, b: string): boolean {
        const bufA = Buffer.from(a);
        const bufB = Buffer.from(b);
        return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
    }
}
