import { POS_VENDOR_NAME_MAX } from '../pos/pos.contracts';

// Caractères de contrôle (C0, DEL, C1) et chevrons : le nom est affiché et exporté tel quel.
const FORBIDDEN_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f<>]', 'g');

/**
 * Nom de vendeur saisi à la connexion de la caisse : espaces compactés, caractères de contrôle
 * et chevrons retirés, tronqué à POS_VENDOR_NAME_MAX. `null` si rien d'exploitable.
 */
export function sanitizeVendorName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(FORBIDDEN_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, POS_VENDOR_NAME_MAX).trim();
  return cleaned || null;
}
