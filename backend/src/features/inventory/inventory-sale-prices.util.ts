// Prix de vente HT unitaire des articles d'inventaire comptes (valorisation Total HT et marge).
//
// Fonctions PURES : toutes les lignes sont deja chargees par le service, aucune lecture ici.
// Regle maison : jamais un 0 fabrique, pas de prix connu = null.
//
// Regles (decidees avec Bertrand/Ulrich, aucune autre n'est inventee) :
//  a) MenuItem (plat pret a vendre) : CA HT / quantite vendue sur la fenetre (source 'sales'),
//     sinon prix catalogue HT de l'espace (source 'catalog'), sinon null.
//  b) MarketPrice (ingredient) : seuls comptent les plats dont la recette n'a QU'UNE ligne
//     MenuItemIngredient, et qui utilisent cet ingredient. Prix = somme(CA HT de ces plats) /
//     somme(quantite vendue x numberOfUnits x conversion), moyenne ponderee reelle. Sans vente :
//     si UN SEUL plat utilise l'ingredient (recette mono-ligne) et a un prix catalogue,
//     prix catalogue HT / (numberOfUnits x conversion). Sinon null. Le CA d'un plat a plusieurs
//     ingredients (un burger) ne se repartit pas entre eux : volontairement non invente.
//  c) MenuComponent : null (source null). Un composant n'a pas de prix de vente propre : il n'est
//     vendu qu'a l'interieur de plats, et aucune regle de repartition du CA n'est fixee.
//
// UNITES. Le frontend valorise le cout par lineCost(quantiteComptee, MarketPrice.pricePerUnit).
// pricePerUnit est un prix par UNITE D'ACHAT (MarketPrice.unit : kg, L, Pc...), cf.
// MarketPriceRecipeSyncService.computeRecipeCosts : costPerRecipeUnit = pricePerUnit x
// purchaseUnitConversion, ou purchaseUnitConversion = nombre d'unites d'achat par unite de recette.
// MenuItemIngredient.numberOfUnits est exprime en UNITES DE RECETTE. Une vente d'un plat consomme
// donc `numberOfUnits x purchaseUnitConversion` unites d'achat, et le prix de vente par unite
// d'achat (meme base que pricePerUnit) vaut CA HT / (quantite vendue x numberOfUnits x conversion).
// Conversion absente ou <= 0 : on la prend a 1 seulement si l'unite de recette est celle d'achat
// (ou non renseignee), comme computeRecipeCosts ; sinon cas ambigu, prix null.

import { priceHt } from '../cost-tracking/cost-tracking-series.util';

export type SalePriceSource = 'sales' | 'catalog' | null;

export interface ItemSalePrice {
  itemId: string;
  unitPriceHt: number | null;
  source: SalePriceSource;
  /** Quantite vendue sur la fenetre, dans la base du prix : plats vendus pour un MenuItem,
   *  unites d'achat consommees (meme base que pricePerUnit) pour un ingredient. Absent hors 'sales'. */
  soldQuantity?: number;
}

export interface SalePriceMarketPrice {
  id: string;
  unit: string | null;
  recipeUnit: string | null;
  purchaseUnitConversion: number | null;
}

/** Une ligne MenuItemIngredient, avec le MarketPrice de son ingredient (null si non lie). */
export interface SalePriceRecipeLine {
  menuItemId: string;
  marketPriceId: string | null;
  numberOfUnits: number;
}

export interface SaleTotals {
  revenueHt: number;
  quantity: number;
}

export interface SalePriceInput {
  itemIds: string[];
  /** Ids du lot qui sont des MenuItem (gagnent sur MarketPrice en cas de collision d'id). */
  menuItemIds: ReadonlySet<string>;
  marketPrices: ReadonlyMap<string, SalePriceMarketPrice>;
  /** Ids du lot qui sont des MenuComponent. */
  componentIds: ReadonlySet<string>;
  /** CA HT et quantites vendues sur la fenetre, par MenuItem (via le mapping produit Weezevent). */
  salesByMenuItem: ReadonlyMap<string, SaleTotals>;
  /** Prix catalogue HT de l'espace par MenuItem (null si prix ou TVA inconnus). */
  catalogPriceHtByMenuItem: ReadonlyMap<string, number | null>;
  /** Toutes les lignes de recette des plats qui utilisent un ingredient du lot. */
  recipeLines: ReadonlyArray<SalePriceRecipeLine>;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const positive = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? n : null;
};
const norm = (v: string | null | undefined) => String(v ?? '').trim().toLowerCase();

/** Prix catalogue HT depuis le TTC et la TVA (meme logique que le frontend menuItemPriceHt). */
export function catalogPriceHt(priceTtc: number | null, vatRate: number | null): number | null {
  return positive(priceHt(priceTtc, vatRate));
}

/**
 * Unites d'achat par unite de recette (base de pricePerUnit). Null = ambigu.
 * Absente ou <= 0 : 1 si l'unite de recette est l'unite d'achat (ou non renseignee).
 */
export function purchaseUnitsPerRecipeUnit(mp: SalePriceMarketPrice): number | null {
  const explicit = positive(mp.purchaseUnitConversion);
  if (explicit != null) return explicit;
  if (!norm(mp.recipeUnit) || norm(mp.recipeUnit) === norm(mp.unit)) return 1;
  return null;
}

function menuItemPrice(
  itemId: string,
  sales: ReadonlyMap<string, SaleTotals>,
  catalog: ReadonlyMap<string, number | null>,
): ItemSalePrice {
  const s = sales.get(itemId);
  const rev = positive(s?.revenueHt);
  const qty = positive(s?.quantity);
  if (rev != null && qty != null) {
    return { itemId, unitPriceHt: round4(rev / qty), source: 'sales', soldQuantity: qty };
  }
  const cat = positive(catalog.get(itemId));
  if (cat != null) return { itemId, unitPriceHt: round4(cat), source: 'catalog' };
  return { itemId, unitPriceHt: null, source: null };
}

function ingredientPrice(
  itemId: string,
  mp: SalePriceMarketPrice,
  linesByMenu: ReadonlyMap<string, SalePriceRecipeLine[]>,
  input: SalePriceInput,
): ItemSalePrice {
  const none: ItemSalePrice = { itemId, unitPriceHt: null, source: null };
  const factor = purchaseUnitsPerRecipeUnit(mp);
  if (factor == null) return none;

  // Plats utilisant l'ingredient ; parmi eux, ceux dont la recette n'a qu'une ligne.
  const using: Array<{ menuItemId: string; singleUnits: number | null }> = [];
  for (const [menuItemId, lines] of linesByMenu) {
    const mine = lines.filter((l) => l.marketPriceId === itemId);
    if (!mine.length) continue;
    const single = lines.length === 1 ? positive(lines[0].numberOfUnits) : null;
    using.push({ menuItemId, singleUnits: single });
  }

  let revenue = 0;
  let consumed = 0;
  for (const u of using) {
    if (u.singleUnits == null) continue;
    const s = input.salesByMenuItem.get(u.menuItemId);
    const rev = positive(s?.revenueHt);
    const qty = positive(s?.quantity);
    if (rev == null || qty == null) continue;
    revenue += rev;
    consumed += qty * u.singleUnits * factor;
  }
  if (revenue > 0 && consumed > 0) {
    return { itemId, unitPriceHt: round4(revenue / consumed), source: 'sales', soldQuantity: round4(consumed) };
  }

  // Repli catalogue : un seul plat utilise l'ingredient, recette mono-ligne.
  if (using.length === 1 && using[0].singleUnits != null) {
    const cat = positive(input.catalogPriceHtByMenuItem.get(using[0].menuItemId));
    if (cat != null) {
      return { itemId, unitPriceHt: round4(cat / (using[0].singleUnits * factor)), source: 'catalog' };
    }
  }
  return none;
}

/** Prix de vente HT unitaire de chaque article du lot, dans l'ordre de `itemIds` (sans doublon). */
export function computeSalePrices(input: SalePriceInput): ItemSalePrice[] {
  const linesByMenu = new Map<string, SalePriceRecipeLine[]>();
  for (const l of input.recipeLines) {
    const arr = linesByMenu.get(l.menuItemId) ?? [];
    arr.push(l);
    linesByMenu.set(l.menuItemId, arr);
  }
  const out: ItemSalePrice[] = [];
  for (const itemId of [...new Set(input.itemIds)]) {
    const mp = input.marketPrices.get(itemId);
    if (input.menuItemIds.has(itemId)) {
      out.push(menuItemPrice(itemId, input.salesByMenuItem, input.catalogPriceHtByMenuItem));
    } else if (mp) {
      out.push(ingredientPrice(itemId, mp, linesByMenu, input));
    } else {
      // MenuComponent (input.componentIds) ou id inconnu : pas de prix de vente propre.
      out.push({ itemId, unitPriceHt: null, source: null });
    }
  }
  return out;
}

/** Fenetre en jours calendaires de l'agregat journalier : [from, to] inclus, ou null pour un
 *  event-conteneur (plus de 2 jours, meme seuil que resolveEventSalesScope). */
export function eventSalesDayWindow(event: {
  eventDate: Date | string;
  eventStartDate?: Date | string | null;
  eventEndDate?: Date | string | null;
}): { from: Date; to: Date; tooWide: boolean } {
  const day = (v: Date | string) => {
    const d = new Date(v);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  };
  const from = day(event.eventStartDate ?? event.eventDate);
  let to = day(event.eventEndDate ?? event.eventStartDate ?? event.eventDate);
  if (to < from) to = from;
  const spanDays = (to.getTime() - from.getTime()) / 86_400_000 + 1;
  return { from, to, tooWide: spanDays > 2 };
}
