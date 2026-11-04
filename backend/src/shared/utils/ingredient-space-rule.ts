import { BadRequestException } from '@nestjs/common';

/**
 * Règle métier : un Menu Item ou un Composant lié à un ou plusieurs espaces ne peut recevoir
 * en recette que des ingrédients dont le fournisseur fournit ce ou ces espaces.
 *  - fiche sans espace : aucun contrôle ;
 *  - fournisseur sans site (Supplier.sites vide) : commun à tous les espaces, autorisé ;
 *  - fournisseur dont les sites croisent un espace de la fiche : autorisé ;
 *  - ingrédient sans fournisseur : refusé dès que la fiche a un espace ;
 *  - sinon refusé.
 * Seules les lignes NOUVELLES sont contrôlées : une recette existante hors espace reste modifiable.
 */

export type IngredientSupplierInfo = {
  id: string;
  name: string;
  marketPriceId: string | null;
  supplierId: string | null;
  supplierSites: string[];
};

export function cleanIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out = new Set<string>();
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) out.add(v.trim());
  }
  return [...out];
}

/** Vrai si l'ingrédient est utilisable sur au moins un des espaces demandés. */
export function isIngredientAllowedForSpaces(info: IngredientSupplierInfo, spaceIds: string[]): boolean {
  if (!spaceIds.length) return true;
  if (!info.supplierId) return false;
  if (!info.supplierSites.length) return true;
  return info.supplierSites.some((s) => spaceIds.includes(s));
}

/**
 * Noms des ingrédients refusés parmi les lignes nouvelles. Une ligne est existante si son
 * ingrédient, ou son marketPrice, figure déjà dans la recette actuelle.
 */
export function findRejectedIngredientNames(
  candidates: IngredientSupplierInfo[],
  existing: IngredientSupplierInfo[],
  spaceIds: string[],
): string[] {
  if (!spaceIds.length) return [];
  const existingIds = new Set(existing.map((e) => e.id));
  const existingPrices = new Set(existing.map((e) => e.marketPriceId).filter((v): v is string => !!v));
  const names = new Set<string>();
  for (const c of candidates) {
    if (existingIds.has(c.id)) continue;
    if (c.marketPriceId && existingPrices.has(c.marketPriceId)) continue;
    if (!isIngredientAllowedForSpaces(c, spaceIds)) names.add(c.name);
  }
  return [...names];
}

export function ingredientSpaceErrorMessage(names: string[]): string {
  return `Ingrédients non disponibles pour les espaces de la fiche (fournisseur hors espace ou absent) : ${names.join(', ')}`;
}

type PrismaLike = { ingredient: { findMany: (args: any) => Promise<any[]> } };

/**
 * Charge en une requête les ingrédients des lignes (nouvelles et actuelles) avec leur fournisseur,
 * puis lève une BadRequestException listant les ingrédients refusés.
 * Les ids inconnus sont ignorés ici (leur existence est contrôlée ailleurs).
 */
export async function assertIngredientsAllowedForSpaces(
  prisma: PrismaLike,
  args: { tenantId: string; spaceIds: unknown; ingredientIds: unknown; existingIngredientIds?: unknown },
): Promise<void> {
  const spaceIds = cleanIds(args.spaceIds);
  const lineIds = cleanIds(args.ingredientIds);
  if (!spaceIds.length || !lineIds.length) return;
  const existingIds = cleanIds(args.existingIngredientIds);
  const rows = await prisma.ingredient.findMany({
    where: { id: { in: [...new Set([...lineIds, ...existingIds])] }, tenantId: args.tenantId },
    select: {
      id: true,
      name: true,
      marketPriceId: true,
      marketPrice: { select: { supplierId: true, supplierRel: { select: { sites: true } } } },
    },
  });
  const infos = new Map<string, IngredientSupplierInfo>(
    rows.map((r: any) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        marketPriceId: r.marketPriceId ?? null,
        supplierId: r.marketPrice?.supplierId ?? null,
        supplierSites: r.marketPrice?.supplierRel?.sites ?? [],
      },
    ]),
  );
  const pick = (ids: string[]) => ids.map((id) => infos.get(id)).filter((i): i is IngredientSupplierInfo => !!i);
  const rejected = findRejectedIngredientNames(pick(lineIds), pick(existingIds), spaceIds);
  if (rejected.length) throw new BadRequestException(ingredientSpaceErrorMessage(rejected));
}
