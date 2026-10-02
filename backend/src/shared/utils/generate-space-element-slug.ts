import { InternalServerErrorException } from '@nestjs/common';
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
 * Le slug candidat est d'abord choisi parmi ceux encore libres (lecture des slugs déjà pris
 * avec la même base) : dans une transaction interactive, une violation de contrainte annule
 * la transaction Postgres entière (25P02), une nouvelle tentative y est donc impossible.
 * C'était le cas de la duplication de zone Builder v2, dont les copies portent le nom de
 * l'original. Pour les créations CONCURRENTES du même nom hors transaction (ex. `Promise.all`
 * sur les éléments d'un floor), on retente encore avec le candidat libre suivant si la
 * contrainte unique sur `slug` est violée.
 *
 * @param buildData construit le reste des champs `data` de `spaceElement.create`, appelé
 *   à nouveau à chaque tentative avec le slug candidat.
 */
export async function createSpaceElementWithUniqueSlug<T>(
  client: {
    spaceElement: {
      create: (args: { data: any; include?: any; select?: any }) => Promise<T>;
      findMany: (args: { where: { slug: { startsWith: string } }; select: { slug: true } }) => Promise<{ slug: string }[]>;
    };
  },
  name: string,
  buildData: (slug: string) => any,
  options?: { include?: any; select?: any; maxAttempts?: number },
): Promise<T> {
  const base = baseSlugFor(name);
  const maxAttempts = options?.maxAttempts ?? 20;

  const taken = new Set((await client.spaceElement.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((r) => r.slug));
  let index = 0;
  const nextFreeSlug = () => {
    for (;;) {
      const candidate = index === 0 ? base : `${base}-${index + 1}`;
      index++;
      if (!taken.has(candidate)) return candidate;
    }
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = nextFreeSlug();
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
  throw new InternalServerErrorException(`generateUniqueSpaceElementSlug: impossible de trouver un slug libre pour "${name}" après ${maxAttempts} tentatives`);
}
