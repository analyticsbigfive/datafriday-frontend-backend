/** Types et constantes partagés par les services logistiques. */
import { StockItemKind } from './dto/logistics.dto';

export interface SimulationTickJobData {
  runId: string;
}

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
export type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

export type ElementRef = { id: string; name: string; spaceId: string };

export type SalesRawRow = {
  elementId: string;
  menuItemId: string;
  eventId: string | null;
  eventName: string | null;
  qty: number;
  lastAt: Date;
};

/** Types de SpaceElement considérés comme un PDV (miroir SpaceEventTimelineService.getSpaceShops). */
export const SHOP_TYPES = ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'];

/** Nature de la ligne — sert le filtre front « Type de denrée ». */
type ItemKind = 'ingredient' | 'component' | 'packaging' | 'product';

export type ItemRef = {
  key: string;
  id: string;
  kind: ItemKind;
  // ADR-0006 (chantier 377) : table d'origine de `id` — distinct de `kind` (rôle recette), qui ne
  // dit pas si un 'ingredient' est en réalité un MarketPrice (mp résolu) ou un Ingredient brut
  // (mp absent). null seulement si `id` n'a pas pu être résolu à une table connue.
  refKind: StockItemKind | null;
  unit: string | null;
  marketPriceId: string | null;
  unitsPerPack: number | null;
  packagingType: string | null;
  picture: string | null;
};

export type ElementItem = {
  name: string;
  id: string;
  kind: ItemKind;
  refKind: StockItemKind | null;
  unit: string | null;
  marketPriceId: string | null;
  unitsPerPack: number | null;
  packagingType: string | null;
  picture: string | null;
  usedIn: Array<{ id: string; name: string }>;
};

export type RecipeCtx = {
  comboByName: Map<string, any>;
  mpByName: Map<string, { id: string; itemName: string; packedUnits: number | null; inventoryPackaging: string | null }>;
  /** Component (MenuComponent) par id, recette complète — pour le dépliage récursif readyForSale=No. */
  componentById: Map<string, any>;
  /** Cache de dépliage recette, clé `${id}:${depth}` — même schéma que perUnitCache/
   * componentPerUnitCache dans explodeSalesToConsumption. Sans lui, un menu item/component
   * partagé par plusieurs plats ou plusieurs shops est ré-expansé depuis zéro à chaque
   * référence (coût combinatoire sur un catalogue à combos/composants imbriqués). */
  itemRefsCache: Map<string, ItemRef[]>;
  componentRefsCache: Map<string, ItemRef[]>;
};
