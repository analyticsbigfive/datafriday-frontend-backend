import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import {
  ComponentNode,
  PartnerInfo,
  comboWeights,
  industrialSharesOf,
  recipeCostParts,
  supplierCostsPerUnit,
} from './recipe-breakdown';

type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

export interface ArticleDimension {
  menuItemId: string;
  brandName: string | null;
  industrialShares: Array<{ industrialId: string; name: string; share: number }>;
  supplierCosts: Array<{ supplierId: string | null; name: string | null; unitCost: number }>;
  promotion: {
    typeId: string | null;
    typeName: string | null;
    referenceMenuItemId: string | null;
    referencePrice: number | null;
    price: number;
  } | null;
  /** Rempli uniquement pour un combo ; la somme des poids vaut 1. */
  // weight = part de prix (ventile CA et quantités) ; quantity = unités de l'enfant par combo
  // vendu (ventile le coût : un menu vendu consomme chaque enfant en entier).
  comboChildren: Array<{ menuItemId: string; weight: number; quantity: number }>;
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : fallback;
};

const MP_SELECT = {
  id: true,
  supplier: true,
  supplierId: true,
  industrialId: true,
  supplierRel: { select: { name: true } },
  industrial: { select: { name: true } },
} as const;

/** Sélection d'un article avec sa recette, ses combos et sa promotion (une seule requête groupée). */
const buildItemSelect = (spaceId?: string) =>
  ({
    id: true,
    basePrice: true,
    numberOfPiecesRecipe: true,
    isCombo: true,
    brand: { select: { name: true } },
    spaceLinks: spaceId ? { where: { spaceId }, select: { priceTtc: true } } : false,
    ingredients: { select: { numberOfUnits: true, ingredient: { select: { costPerRecipeUnit: true, marketPrice: { select: MP_SELECT } } } } },
    packagings: { select: { numberOfUnits: true, packaging: { select: { costPerRecipeUnit: true, marketPrice: { select: MP_SELECT } } } } },
    components: { select: { numberOfUnits: true, componentId: true } },
    comboChildren: { select: { childId: true, quantity: true } },
    promotion: {
      select: {
        isActive: true,
        discountedProductId: true,
        promotionTypeId: true,
        promotionType: { select: { name: true } },
      },
    },
  }) as const;

/**
 * Dimensions des articles pour les camemberts Analyse (règles 5 à 9) : marque, industriel,
 * coût par fournisseur, promotion et poids de ventilation des combos. Le front joint ces
 * informations aux records article par menuItemId.
 */
@Injectable()
export class ArticleDimensionsService {
  constructor(private readonly prisma: PrismaService, private readonly spaceAccess: SpaceAccessService) {}

  async getDimensions(tenantId: string, spaceId?: string, user?: SpaceScopedUser): Promise<{ items: ArticleDimension[] }> {
    if (spaceId) await this.spaceAccess.assertSpaceAccessible(spaceId, tenantId, user);
    const select = buildItemSelect(spaceId);
    const baseWhere = { tenantId, deletedAt: null };

    let items: any[] = await this.prisma.menuItem.findMany({
      where: { ...baseWhere, ...(spaceId ? { spaceLinks: { some: { spaceId } } } : {}) },
      select,
    });
    if (spaceId) {
      // Les enfants de combo servent à la ventilation même s'ils ne sont pas vendus seuls ici.
      for (let depth = 0; depth < 3; depth++) {
        const known = new Set(items.map((i) => i.id));
        const missing = [...new Set(items.flatMap((i) => i.comboChildren.map((c: any) => c.childId)))].filter((id) => !known.has(id));
        if (!missing.length) break;
        items = items.concat(await this.prisma.menuItem.findMany({ where: { ...baseWhere, id: { in: missing } }, select }));
      }
    }

    const industrialNames = new Map<string, string>();
    const components = await this.loadComponentGraph(items, industrialNames);
    const priceOf = (i: { basePrice: unknown; spaceLinks?: Array<{ priceTtc: unknown }> }) =>
      i.spaceLinks?.[0]?.priceTtc != null ? num(i.spaceLinks[0].priceTtc) : num(i.basePrice);
    const itemById = new Map(items.map((i) => [i.id, i]));

    // Produits de référence des promotions actives (prix) : une requête pour tous.
    const referenceIds = [
      ...new Set(items.map((i) => (i.promotion?.isActive ? i.promotion.discountedProductId : null)).filter((id): id is string => !!id)),
    ].filter((id) => !itemById.has(id));
    const referenceRows = referenceIds.length
      ? await this.prisma.menuItem.findMany({
          where: { tenantId, id: { in: referenceIds } },
          select: { id: true, basePrice: true, spaceLinks: spaceId ? { where: { spaceId }, select: { priceTtc: true } } : false },
        })
      : [];
    const referencePrice = new Map<string, number>();
    for (const r of referenceRows) referencePrice.set(r.id, priceOf(r as any));
    for (const i of items) referencePrice.set(i.id, priceOf(i));

    const result: ArticleDimension[] = items.map((item) => {
      const partnerOf = (mp: any): PartnerInfo | null => {
        if (!mp) return null;
        if (mp.industrial) industrialNames.set(mp.industrialId, mp.industrial.name);
        return {
          supplierId: mp.supplierId ?? null,
          supplierName: mp.supplierRel?.name ?? mp.supplier ?? null,
          industrialId: mp.industrialId ?? null,
        };
      };
      const parts = recipeCostParts(
        {
          ingredients: item.ingredients.map((l: any) => ({
            numberOfUnits: num(l.numberOfUnits),
            ingredient: { costPerRecipeUnit: num(l.ingredient?.costPerRecipeUnit), partner: partnerOf(l.ingredient?.marketPrice) },
          })),
          packagings: item.packagings.map((l: any) => ({
            numberOfUnits: num(l.numberOfUnits),
            packaging: { costPerRecipeUnit: num(l.packaging?.costPerRecipeUnit), partner: partnerOf(l.packaging?.marketPrice) },
          })),
          components: item.components.map((l: any) => ({ numberOfUnits: num(l.numberOfUnits), componentId: l.componentId })),
        },
        components.nodes,
      );

      const promo = item.promotion;
      const promotion =
        promo && promo.isActive
          ? {
              typeId: promo.promotionTypeId ?? null,
              typeName: promo.promotionType?.name ?? null,
              referenceMenuItemId: promo.discountedProductId ?? null,
              referencePrice: promo.discountedProductId ? referencePrice.get(promo.discountedProductId) ?? null : null,
              price: priceOf(item),
            }
          : null;

      const children = item.comboChildren.map((c: any) => ({
        menuItemId: c.childId as string,
        quantity: num(c.quantity, 1),
        price: referencePrice.get(c.childId) ?? 0,
      }));

      return {
        menuItemId: item.id,
        brandName: item.brand?.name ?? null,
        // Les noms d'industriels sont complétés après la boucle (la Map se remplit en chemin).
        industrialShares: industrialSharesOf(parts).map((s) => ({ ...s, name: '' })),
        supplierCosts: supplierCostsPerUnit(parts, num(item.numberOfPiecesRecipe, 1)),
        promotion,
        comboChildren: comboWeights(children).map((w, i) => ({ ...w, quantity: children[i].quantity })),
      };
    });
    for (const dim of result) for (const s of dim.industrialShares) s.name = industrialNames.get(s.industrialId) ?? '';
    return { items: result };
  }

  /** Charge les composants utilisés par les recettes, avec leurs sous-composants (niveau par niveau). */
  private async loadComponentGraph(items: any[], industrialNames: Map<string, string>): Promise<{ nodes: Map<string, ComponentNode> }> {
    const nodes = new Map<string, ComponentNode>();
    let frontier = [...new Set(items.flatMap((i) => i.components.map((c: any) => c.componentId as string)))];
    for (let depth = 0; depth < 6 && frontier.length; depth++) {
      const rows = await this.prisma.menuComponent.findMany({
        where: { id: { in: frontier } },
        select: {
          id: true,
          unitCost: true,
          ingredients: {
            select: { quantity: true, ingredient: { select: { costPerRecipeUnit: true, marketPrice: { select: MP_SELECT } } } },
          },
          children: { select: { childId: true, quantity: true } },
        },
      });
      const next = new Set<string>();
      for (const r of rows) {
        nodes.set(r.id, {
          unitCost: num(r.unitCost),
          ingredients: r.ingredients.map((l) => ({
            quantity: num(l.quantity),
            ingredient: {
              costPerRecipeUnit: num(l.ingredient?.costPerRecipeUnit),
              partner: l.ingredient?.marketPrice
                ? {
                    supplierId: l.ingredient.marketPrice.supplierId ?? null,
                    supplierName: l.ingredient.marketPrice.supplierRel?.name ?? l.ingredient.marketPrice.supplier ?? null,
                    industrialId: l.ingredient.marketPrice.industrialId ?? null,
                  }
                : null,
            },
          })),
          children: r.children.map((c) => ({ quantity: num(c.quantity), childId: c.childId })),
        });
        // Les noms d'industriels des composants sont aussi nécessaires aux parts.
        for (const l of r.ingredients) {
          const mp = l.ingredient?.marketPrice;
          if (mp?.industrialId && mp.industrial) industrialNames.set(mp.industrialId, mp.industrial.name);
        }
        for (const c of r.children) if (!nodes.has(c.childId)) next.add(c.childId);
      }
      frontier = [...next];
    }
    return { nodes };
  }
}
