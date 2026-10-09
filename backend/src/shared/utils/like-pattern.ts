/**
 * Échappe `%`, `_` et `\` pour un filtre Prisma `equals` ou `contains` en mode insensible à la
 * casse : Prisma le traduit en ILIKE, où ces caractères sont des jokers. Sans échappement,
 * « Heineken 0% 33cl » correspondait aussi à « Heineken 0% - CAN 33CL ».
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
