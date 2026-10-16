import { Prisma } from '@prisma/client';

/**
 * Coeur partagé de résolution d'une ligne de vente (prix TTC, prix d'origine, promotion, TVA),
 * extrait de `SalesSimulationService.simulateSale` pour que la simulation QA et la caisse POS
 * facturent exactement le même prix. Fonctions PURES : aucune requête, aucun état.
 *
 * Cascade du prix : `SpaceMenuItem.priceTtc` (prix de l'espace) puis `MenuItem.basePrice`.
 * Cascade de la TVA : `SpaceMenuItem.vatRate`, puis `MenuItem.vatRate`, puis défaut du tenant.
 */

export type DecimalLike = Prisma.Decimal | number | string | null | undefined;

/** Ligne `SpaceMenuItem` de l'espace de la vente (prix, TVA et promo propres à l'espace). */
export interface SpaceOverrideInput {
  priceTtc?: DecimalLike;
  vatRate?: DecimalLike;
  discountType?: string | null;
  discountValue?: DecimalLike;
}

/** Champs de `MenuItem` utiles au prix. */
export interface MenuItemPricingInput {
  basePrice?: DecimalLike;
  vatRate?: DecimalLike;
  discountType?: string | null;
  discountValue?: DecimalLike;
}

/** `Promotion` du menu item (0 ou 1), avec le libellé de son `PromotionType`. */
export interface PromotionInput {
  isActive: boolean;
  typeName: string | null;
}

export interface SaleLinePrice {
  /** Prix unitaire TTC facturé (après promotion si les promos sont activées). */
  unitPrice: number;
  /** Prix avant promotion si une remise de prix s'applique, sinon null. */
  originalUnitPrice: number | null;
  /** Libellé de la promotion (nom du type, sinon « Promo »), null si aucune. */
  promotionLabel: string | null;
}

/** Libellé par défaut d'une promotion sans type renseigné. */
export const DEFAULT_PROMOTION_LABEL = 'Promo';

const toNumber = (value: DecimalLike, fallback = 0): number => {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Prix catalogue de la ligne, SANS promotion : `SpaceMenuItem.priceTtc ?? MenuItem.basePrice ?? 0`.
 * Conserve le type d'origine (Decimal) : c'est l'expression exacte que simulateSale utilisait.
 */
export function resolveListUnitPrice(
  override: Pick<SpaceOverrideInput, 'priceTtc'> | null | undefined,
  menuItem: Pick<MenuItemPricingInput, 'basePrice'> | null | undefined,
): NonNullable<DecimalLike> {
  return override?.priceTtc ?? menuItem?.basePrice ?? new Prisma.Decimal(0);
}

/** TVA de la ligne : espace, puis article, puis défaut du tenant, puis 0 (même cascade que simulateSale). */
export function resolveVatRate(
  override: Pick<SpaceOverrideInput, 'vatRate'> | null | undefined,
  menuItem: Pick<MenuItemPricingInput, 'vatRate'> | null | undefined,
  tenantDefaultVatRate: number | null | undefined,
): NonNullable<DecimalLike> {
  return override?.vatRate ?? menuItem?.vatRate ?? tenantDefaultVatRate ?? 0;
}

interface Discount {
  type: 'percent' | 'amount';
  value: number;
}

function parseDiscount(type: string | null | undefined, value: DecimalLike): Discount | null {
  if (type !== 'percent' && type !== 'amount') return null;
  const v = toNumber(value);
  return v > 0 ? { type, value: v } : null;
}

/** Montant TTC de la remise sur `gross`, borné entre 0 et max(gross, 0) (prix négatifs : jamais de remise). */
function discountAmount(gross: number, discount: Discount): number {
  const raw = discount.type === 'percent' ? round2((gross * discount.value) / 100) : round2(discount.value);
  return Math.min(Math.max(raw, 0), Math.max(gross, 0));
}

/** Prix avant promotion déduit d'un prix de combo déjà remisé (`SpaceMenuItem.priceTtc` = prix APRÈS promo). */
function priceBeforeDiscount(finalPrice: number, discount: Discount): number {
  if (finalPrice <= 0) return finalPrice;
  if (discount.type === 'percent') return discount.value < 100 ? round2(finalPrice / (1 - discount.value / 100)) : finalPrice;
  return round2(finalPrice + discount.value);
}

/**
 * Prix de la ligne pour la caisse. Les remises viennent UNIQUEMENT du catalogue :
 *  1. promo de l'espace (`SpaceMenuItem.discountType/Value`, cas du combo) : `priceTtc` est
 *     déjà le prix APRÈS promo, le prix d'origine est déduit (même ratio que la fiche combo) ;
 *     sans `priceTtc`, la remise s'applique au prix de base ;
 *  2. sinon remise catalogue de l'article (`MenuItem.discountType/Value`) sur le prix de la liste
 *     (même calcul que `MenuItemPricingService.computePricing`).
 * `promosEnabled=false` (réglage de l'évènement) : prix d'origine, aucun libellé.
 * Le libellé vient du `Promotion` actif de l'article (nom de son type), sinon « Promo » si une
 * remise de prix s'applique ; une `Promotion` sans remise de prix garde son libellé sans prix barré.
 */
export function resolveSaleLinePrice(
  override: SpaceOverrideInput | null | undefined,
  menuItem: MenuItemPricingInput | null | undefined,
  promotion: PromotionInput | null | undefined,
  promosEnabled: boolean,
): SaleLinePrice {
  const spacePrice = override?.priceTtc != null ? toNumber(override.priceTtc) : null;
  const list = round2(spacePrice ?? toNumber(menuItem?.basePrice));

  const spaceDiscount = parseDiscount(override?.discountType, override?.discountValue);
  const itemDiscount = spaceDiscount ? null : parseDiscount(menuItem?.discountType, menuItem?.discountValue);

  let finalPrice = list;
  let beforePromo = list;
  if (spaceDiscount && spacePrice != null) {
    beforePromo = priceBeforeDiscount(list, spaceDiscount);
  } else if (spaceDiscount || itemDiscount) {
    finalPrice = round2(list - discountAmount(list, (spaceDiscount ?? itemDiscount) as Discount));
  }

  if (!promosEnabled) return { unitPrice: beforePromo, originalUnitPrice: null, promotionLabel: null };

  const hasPriceCut = Math.abs(beforePromo - finalPrice) > 0.004;
  const promotionActive = !!promotion?.isActive;
  return {
    unitPrice: finalPrice,
    originalUnitPrice: hasPriceCut ? beforePromo : null,
    promotionLabel:
      promotionActive || hasPriceCut
        ? (promotionActive ? promotion?.typeName?.trim() : '') || DEFAULT_PROMOTION_LABEL
        : null,
  };
}
