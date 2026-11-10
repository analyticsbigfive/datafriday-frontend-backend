/**
 * Le rôle sert-il cet espace ? 2 = une de ses agences dessert cet espace, 0 = non.
 * Sans agence, ou avec des agences sans espace associé, le rôle ne s'affiche nulle part.
 */
export function roleSpaceRank(role: any, spaceId: string): number {
  const links: any[] = role?.suppliers ?? [];
  return links.some((l) => l.supplier?.spaceIds?.includes(spaceId)) ? 2 : 0;
}
