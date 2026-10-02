import { utcOffsetMinutes } from '../../../shared/utils/event-window.util';

/**
 * Analyse des fichiers CSV Digifood : champs attendus, synonymes d'en-têtes, montants et dates.
 * Fonctions pures, sans accès base.
 */

/** Champs normalisés attendus ; le mapping (fourni par le front et/ou persisté dans
 *  CsvMapping, mappingType 'digifood-orders') fait correspondre les colonnes CSV.
 *  Prix : price_pu (CENTIMES, unitaire) OU total_ttc (EUROS, total de ligne → ÷ quantité).
 *  Date : placed_at (ISO) OU placed_at_date + placed_at_time (deux colonnes, export réel). */
export const CSV_FIELDS = [
    'order_id', 'placed_at', 'placed_at_date', 'placed_at_time',
    'location_id', 'location_name', 'shop_id', 'shop_name',
    'item_id', 'variation_id', 'item_name', 'variation', 'family',
    'quantity', 'price_pu', 'total_ttc', 'total_ht', 'total_tva',
    'tax_rate', 'external_reference', 'type', 'state',
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];
export type CsvColumnMapping = Partial<Record<CsvField, string>>;

/** Mapping par défaut : colonne CSV = nom du champ normalisé (format modèle §7.2) */
export const DEFAULT_MAPPING: CsvColumnMapping = Object.fromEntries(
    CSV_FIELDS.map((f) => [f, f]),
);

/** Synonymes d'en-têtes connus (export réel du back-office Digifood, casse/espaces ignorés)
 *  → complètent le mapping pour les champs non couverts. */
export const HEADER_SYNONYMS: Record<CsvField, string[]> = {
    order_id: ['long id', 'order id', 'commande', 'reference commande'],
    placed_at: ['placed at', 'date'],
    placed_at_date: ['placed at_date', 'placed at date'],
    placed_at_time: ['placed at_time', 'placed at time', 'heure'],
    location_id: ['location id', 'site id'],
    location_name: ['location', 'site'],
    shop_id: ['shop id', 'pdv id'],
    shop_name: ['shop', 'point de vente', 'pdv', 'buvette'],
    item_id: ['item id', 'product id', 'article id'],
    variation_id: ['variation id'],
    item_name: ['item', 'produit', 'article', 'product'],
    variation: ['variation', 'variante'],
    family: ['item family', 'famille', 'family', 'categorie'],
    quantity: ['quantity', 'quantite', 'qte', 'qty'],
    price_pu: ['price pu', 'prix unitaire centimes'],
    total_ttc: ['total ttc', 'montant ttc', 'ttc'],
    total_ht: ['total ht', 'montant ht', 'ht'],
    total_tva: ['total tva', 'montant tva'],
    tax_rate: ['tva%', 'tva %', 'tva', 'tax rate', 'vat'],
    external_reference: ['external reference', 'reference externe', 'ref externe'],
    type: ['type'],
    state: ['state', 'statut', 'etat'],
};

export const normalizeHeader = (h: string) =>
    h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Nombre tolérant : virgule décimale française, espaces/insécables de milliers,
 * et formats mixtes "1.234,56" / "1,234.56" (le DERNIER séparateur est le
 * décimal, l'autre les milliers). Avant : `.replace(',', '.')` ne traitait que
 * la première virgule et "1.234,56" devenait 1.23456.
 */
export function parseAmount(raw: string): number {
    if (raw === null || raw === undefined) return NaN;
    let cleaned = String(raw).replace(/[\s  ]/g, '').replace(/[%€$]/g, '');
    if (cleaned === '') return NaN;
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma !== -1 && lastDot !== -1) {
        if (lastComma > lastDot) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        else cleaned = cleaned.replace(/,/g, '');
    } else if (lastComma !== -1) {
        cleaned = cleaned.indexOf(',') !== lastComma ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
    } else if (lastDot !== -1 && cleaned.indexOf('.') !== lastDot) {
        cleaned = cleaned.replace(/\./g, '');
    }
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
}

/** Fuseau d'interprétation des horodatages SANS fuseau des exports Digifood (heure murale
 *  du lieu de vente). BUG-140-01 : `new Date("…T11:58")` les interprétait dans le fuseau du
 *  PROCESS Node — sur Render (UTC), 11:58 heure de Paris était stocké comme 11:58 UTC, et la
 *  conversion de lecture (`AT TIME ZONE Space.timezone`) réaffichait 13:58 : +2 h partout. */
const CSV_NAIVE_TIMEZONE = 'Europe/Paris';

/**
 * Date tolérante : ISO, `YYYY-MM-DD` (+ heure séparée), `JJ/MM/AAAA`, `JJ-MM-AAAA`
 * (exports français, JOUR en premier), et date+heure combinées dans la même
 * cellule (« 05-07-2026 16:45 »). Sans fuseau dans le fichier → heure MURALE
 * `CSV_NAIVE_TIMEZONE`, convertie en vrai instant UTC indépendamment du fuseau du process
 * (convention DB : `transactionDate` = UTC, cf. RUNBOOK 24/08).
 */
export function parseCsvDate(dateRaw: string, timeRaw: string): Date | null {
    if (!dateRaw) return null;
    let datePart = dateRaw.trim();
    let timePart = (timeRaw || '').trim();
    // Date + heure dans la même colonne : « 05-07-2026 16:45(:30) »
    const combined = datePart.match(/^(\S+)[ T](\d{1,2}:\d{2}(?::\d{2})?)$/);
    if (combined && !timePart) {
        datePart = combined[1];
        timePart = combined[2];
    }
    // JJ/MM/AAAA ou JJ-MM-AAAA → ISO (jour en premier : convention des exports FR)
    const dmy = datePart.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) datePart = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    const candidate = timePart && !/[T ]\d/.test(datePart) ? `${datePart}T${timePart}` : datePart;
    // Fuseau explicite (Z ou ±hh[:]mm) → instant déjà absolu, parsing direct.
    if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(candidate)) {
        const d = new Date(candidate);
        return isNaN(d.getTime()) ? null : d;
    }
    // Horodatage NAÏF → heure murale CSV_NAIVE_TIMEZONE. Passe 1 : lu comme UTC ;
    // passe 2 : corrigé du décalage réel du fuseau à cet instant (été/hiver gérés) —
    // même mécanique que combineDayAndLocalTime (event-window.util).
    const naive = candidate.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (!naive) {
        const d = new Date(candidate);
        return isNaN(d.getTime()) ? null : d;
    }
    const naiveUtc = Date.UTC(
        Number(naive[1]), Number(naive[2]) - 1, Number(naive[3]),
        Number(naive[4] ?? 0), Number(naive[5] ?? 0), Number(naive[6] ?? 0),
    );
    if (Number.isNaN(naiveUtc)) return null;
    const offsetMin = utcOffsetMinutes(new Date(naiveUtc), CSV_NAIVE_TIMEZONE);
    return new Date(naiveUtc - offsetMin * 60_000);
}
