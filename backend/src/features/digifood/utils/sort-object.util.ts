/**
 * Tri récursif des clés d'un objet JSON (doc Digifood §signature).
 * La signature HMAC Digifood est calculée sur le JSON.stringify du body
 * dont TOUTES les clés (à toutes profondeurs) sont triées alphabétiquement —
 * contrairement à Weezevent qui signe le body brut non trié.
 * Les tableaux gardent leur ordre ; seuls les objets sont triés.
 */
export function sortObjectDeep<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => sortObjectDeep(item)) as unknown as T;
    }
    if (value !== null && typeof value === 'object') {
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            sorted[key] = sortObjectDeep((value as Record<string, unknown>)[key]);
        }
        return sorted as unknown as T;
    }
    return value;
}
