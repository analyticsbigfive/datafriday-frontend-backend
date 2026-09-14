import { BadRequestException } from '@nestjs/common';

export const WEEZEVENT_WEBHOOK_TYPES = ['transaction', 'wallet', 'refill', 'scan', 'transfer', 'order', 'product'] as const;
export const WEEZEVENT_WEBHOOK_METHODS = ['create', 'update', 'delete'] as const;

export interface WeezeventWebhookPayload {
    type: (typeof WEEZEVENT_WEBHOOK_TYPES)[number];
    method: (typeof WEEZEVENT_WEBHOOK_METHODS)[number];
    /** Micro-service Weezevent émetteur : gill (WeezPay), butter (WeezAccess), pyvar (WeezTicket). */
    origin?: string;
    organizationId: string | null;
    /** Id de l'objet (transaction, wallet, ...). */
    objectId: string | null;
    /** Détails de l'objet (`values` WeezPay ; `data` dans l'ancien format supposé). */
    values: Record<string, unknown>;
    raw: Record<string, unknown>;
}

/**
 * BUG-379-02 : format réel des webhooks WeezPay (docapi.weezevent.com, "Webhooks") :
 * `{ type, method, origin, organization_id, id, values }`. L'ancien DTO attendait `{ data }`
 * et, avec le ValidationPipe global `forbidNonWhitelisted`, rejetait tout vrai payload en 400.
 * Weezevent prévient que des champs non documentés peuvent apparaître : on ne rejette jamais
 * un champ inconnu, on ne valide que ce dont on a besoin. L'ancien format `{ data: { id } }`
 * reste accepté (tests, éventuel formatter personnalisé côté Weezevent).
 */
export function parseWeezeventWebhookPayload(body: unknown): WeezeventWebhookPayload {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new BadRequestException('Webhook body must be a JSON object');
    }
    const raw = body as Record<string, unknown>;
    const type = String(raw.type ?? '');
    const method = String(raw.method ?? '');
    if (!(WEEZEVENT_WEBHOOK_TYPES as readonly string[]).includes(type)) {
        throw new BadRequestException(`Unsupported webhook type "${type}"`);
    }
    if (!(WEEZEVENT_WEBHOOK_METHODS as readonly string[]).includes(method)) {
        throw new BadRequestException(`Unsupported webhook method "${method}"`);
    }

    const values = isRecord(raw.values) ? raw.values : isRecord(raw.data) ? raw.data : {};
    const objectId = firstDefined(raw.id, values.id) ?? null;
    const organizationId = firstDefined(raw.organization_id, raw.organizationId, values.organization_id) ?? null;

    return {
        type: type as WeezeventWebhookPayload['type'],
        method: method as WeezeventWebhookPayload['method'],
        origin: typeof raw.origin === 'string' ? raw.origin : undefined,
        organizationId,
        objectId,
        values,
        raw,
    };
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function firstDefined(...candidates: unknown[]): string | undefined {
    for (const c of candidates) {
        if (c !== undefined && c !== null && c !== '') return String(c);
    }
    return undefined;
}
