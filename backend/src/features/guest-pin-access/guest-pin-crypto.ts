import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Chiffrement réversible du PIN partagé d'une fenêtre (InventoryWindow.pinCiphertext).
 *
 * Pourquoi réversible : critère d'acceptation 2026-09-14, le directeur doit pouvoir
 * retrouver le PIN sous le bouton "Régénérer le PIN" après avoir fermé le popup.
 * Le hash HMAC (pinLookupHash) reste la seule chose comparée au login, ce
 * chiffré ne sert qu'à réafficher le code au directeur.
 *
 * AES-256-GCM, clé = SHA-256(GUEST_PIN_HMAC_SECRET) : pas de nouvelle variable
 * d'environnement à provisionner. Format stocké : `v1:<iv b64>:<tag b64>:<data b64>`.
 */
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function encryptPin(pin: string, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, deriveKey(secret), iv);
  const data = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(
    ':',
  );
}

/** null si le chiffré est absent, corrompu ou d'un format inconnu : on ne laisse
 *  jamais un PIN illisible faire échouer le status board entier. */
export function decryptPin(ciphertext: string | null | undefined, secret: string): string | null {
  if (!ciphertext) return null;
  const [version, ivB64, tagB64, dataB64] = ciphertext.split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv(ALGO, deriveKey(secret), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return out.toString('utf8');
  } catch {
    return null;
  }
}
