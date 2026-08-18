/**
 * Sérialisation des lignes `SpaceMenuItem` (source de vérité association espace↔item + prix
 * par espace) vers le contrat API historique (`spaceIds: string[]`, `spacePrices: { [spaceId]:
 * { ttc, vatRate } }`). Le front n'a PAS changé : il continue de lire/envoyer ces deux champs ;
 * seul le stockage est passé des colonnes dénormalisées de MenuItem à la table relationnelle.
 */

/** Forme minimale d'une ligne SpaceMenuItem telle que sélectionnée par les services. */
export type SpaceLinkRow = {
  spaceId: string;
  priceTtc?: unknown; // Prisma.Decimal | number | null selon le select
  vatRate?: unknown;
  discountType?: unknown; // promo par espace (combo) : "percent" | "amount" | null
  discountValue?: unknown;
};

/** Contrat API `spaceIds` : ids d'espaces associés (condition 0). */
export function linksToSpaceIds(links: SpaceLinkRow[] | null | undefined): string[] {
  return [...new Set((links ?? []).map((l) => l.spaceId))];
}

/**
 * Contrat API `spacePrices` : map des prix par espace, liens sans prix omis.
 * `null` si aucun prix (parité avec l'ancienne colonne Json nullable — les
 * consommateurs testent la nullité, pas l'objet vide).
 */
export function linksToSpacePrices(
  links: SpaceLinkRow[] | null | undefined,
): Record<
  string,
  { ttc: number; vatRate: number | null; discountType: string | null; discountValue: number | null }
> | null {
  const out: Record<
    string,
    { ttc: number; vatRate: number | null; discountType: string | null; discountValue: number | null }
  > = {};
  for (const l of links ?? []) {
    if (l.priceTtc == null) continue;
    const ttc = Number(l.priceTtc);
    if (!Number.isFinite(ttc)) continue;
    const dt = l.discountType;
    out[l.spaceId] = {
      ttc,
      vatRate: l.vatRate != null && Number.isFinite(Number(l.vatRate)) ? Number(l.vatRate) : null,
      // Promo par espace (combo) : remontée dans le contrat spacePrices pour l'affichage front.
      discountType: dt === 'percent' || dt === 'amount' ? dt : null,
      discountValue:
        l.discountValue != null && Number.isFinite(Number(l.discountValue)) ? Number(l.discountValue) : null,
    };
  }
  return Object.keys(out).length ? out : null;
}

/** Select Prisma standard des liens pour la sérialisation. */
export const spaceLinksSelect = {
  select: { spaceId: true, priceTtc: true, vatRate: true, discountType: true, discountValue: true },
} as const;
