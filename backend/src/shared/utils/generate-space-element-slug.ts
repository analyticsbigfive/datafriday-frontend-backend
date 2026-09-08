import { Prisma } from '@prisma/client';
import { generateSlug } from './index';

const COMBINING_DIACRITICS_REGEX = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

/** Slugify + retrait des accents (le slugify générique de shared/utils ne le fait pas). */
function baseSlugFor(name: string): string {
  const withoutAccents = name.normalize('NFD').replace(COMBINING_DIACRITICS_REGEX, '');
  return generateSlug(withoutAccents) || 'pdv';
}

function isUniqueSlugConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    Array.isArray((err.meta as { target?: unknown })?.target) &&
    ((err.meta as { target: unknown[] }).target).includes('slug')
  );
}

/**
 * Crée un SpaceElement avec un slug stable et opaque, unique par construction — utilisé
 * pour les URLs publiques d'accès invité PIN (/login/pin/:slug/:phase). Généré une seule
 * fois à la création, jamais recalculé au renommage : un lien/QR déjà imprimé doit rester
 * valable (cf. migration 20260908090000_guest_pin_slug_and_freeze pour le backfill des
 * lignes existantes).
 *
 * Résiste aux créations CONCURRENTES du même nom (plusieurs éléments créés en parallèle,
 * ex. `Promise.all` sur les éléments d'un floor) : au lieu d'un check-then-insert racy,
 * on retente la création avec un suffixe incrémenté si la contrainte unique sur `slug`
 * est violée — la seule stratégie correcte sous concurrence sans verrou applicatif.
 *
 * @param buildData construit le reste des champs `data` de `spaceElement.create`, appelé
 *   à nouveau à chaque tentative avec le slug candidat.
 */
export async function createSpaceElementWithUniqueSlug<T>(
  client: { spaceElement: { create: (args: { data: any; include?: any; select?: any }) => Promise<T> } },
  name: string,
  buildData: (slug: string) => any,
  options?: { include?: any; select?: any; maxAttempts?: number },
): Promise<T> {
  const base = baseSlugFor(name);
  const maxAttempts = options?.maxAttempts ?? 20;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      return await client.spaceElement.create({
        data: buildData(slug),
        ...(options?.select ? { select: options.select } : { include: options?.include }),
      });
    } catch (err) {
      if (isUniqueSlugConflict(err) && attempt < maxAttempts - 1) continue;
      throw err;
    }
  }
  throw new Error(`generateUniqueSpaceElementSlug: impossible de trouver un slug libre pour "${name}" après ${maxAttempts} tentatives`);
}
