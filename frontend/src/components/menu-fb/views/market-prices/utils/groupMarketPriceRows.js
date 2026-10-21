/**
 * Regroupe les lignes MarketPrice (une par fournisseur) en articles : une entrée par `itemName`,
 * avec ses lignes fournisseur dans `supplierRows`. Source unique pour la Market Price List et le
 * panneau « Prix du marché » des fiches Menu Item / Composant.
 */
export function groupMarketPriceRows(rows, { suppliers = [], industrials = [] } = {}) {
  const supplierNameById = new Map((suppliers || []).map((s) => [s.id, s.name]));
  const industrialNameById = new Map((industrials || []).map((ind) => [ind.id, ind.name]));
  const map = new Map();

  for (const r of rows) {
    const itemName = String(r?.itemName || r?.name || '').trim();
    if (!itemName) continue;

    const id = r?.id || r?._id || itemName;
    const goodType = r?.goodType || '';
    const category = r?.category || '';
    const marketPriceTypeId = r?.marketPriceTypeId || '';
    const marketPriceCategoryId = r?.marketPriceCategoryId || '';
    const recipeUnit = r?.recipeUnit || '';
    const purchaseUnitConversion = r?.purchaseUnitConversion ?? '';
    const image = r?.image || '';
    const unit = r?.unit || '';
    const inventoryPackaging = r?.inventoryPackaging || '';
    const packedUnits = r?.packedUnits ?? 0;
    const numberOfUnits = r?.numberOfUnits ?? 0;
    const packingLength = r?.packingLength ?? 0;
    const packingWidth = r?.packingWidth ?? 0;
    const packingHeight = r?.packingHeight ?? 0;

    const supplierId = r?.supplierId || '';
    // supplierRel.name = relation API ; supplierNameById = lookup par FK ;
    // r.supplier = nom brut (lignes importées par CSV sans FK fournisseur).
    const supplierName =
      r?.supplierName ||
      r?.supplierRel?.name ||
      (supplierId ? supplierNameById.get(supplierId) : '') ||
      r?.supplier || '';

    const computedRecipeUnitCost = (() => {
      const ppu = Number(r?.pricePerUnit);
      const rawConv = Number(r?.purchaseUnitConversion);
      const conv = Number.isFinite(rawConv) && rawConv > 0 ? rawConv : 1;
      if (!Number.isFinite(ppu)) return null;
      const val = ppu * conv;
      return Number.isFinite(val) && val > 0 ? val : null;
    })();

    const supplierRow = {
      id,
      supplierId,
      supplierName,
      supplierItemName: r?.supplierItem || '',
      storageType: r?.storageType || '',
      unit: r?.unit || '',
      unitsPerPurchase: r?.unitsPerPurchase ?? null,
      price: r?.price ?? null,
      pricePerUnit: r?.pricePerUnit ?? null,
      purchaseUnitConversion: r?.purchaseUnitConversion ?? null,
      recipeUnitCost:
        r?.recipeUnitCost ??
        r?.costPerRecipeUnit ??
        r?.cost_per_recipe_unit ??
        computedRecipeUnitCost,
      purchasePackaging: r?.purchasePackaging || '',
      addedAt: r?.createdAt || r?.updatedAt || '-',
      inventoryPackaging: r?.inventoryPackaging || '',
      packedUnits: r?.packedUnits ?? 0,
      numberOfUnits: r?.numberOfUnits ?? 0,
      packingLength: r?.packingLength ?? 0,
      packingWidth: r?.packingWidth ?? 0,
      packingHeight: r?.packingHeight ?? 0,
      industrialId: r?.industrialId || r?.industrial?.id || '',
      industrialName:
        r?.industrial?.name ||
        (r?.industrialId ? industrialNameById.get(r.industrialId) : '') || '',
    };

    if (!map.has(itemName)) {
      map.set(itemName, {
        id: itemName,
        name: itemName,
        suppliersCount: 0,
        recipeUnit,
        purchaseUnitConversion,
        goodType,
        category,
        marketPriceTypeId,
        marketPriceCategoryId,
        type: goodType,
        image,
        unit,
        inventoryPackaging,
        packedUnits,
        numberOfUnits,
        packingLength,
        packingWidth,
        packingHeight,
        supplierRows: [],
        supplierNames: [],
      });
    }

    const agg = map.get(itemName);
    agg.supplierRows.push(supplierRow);
    if (image && !agg.image) agg.image = image;
    if (goodType && !agg.goodType) agg.goodType = goodType;
    if (category && !agg.category) agg.category = category;
    if (marketPriceTypeId && !agg.marketPriceTypeId) agg.marketPriceTypeId = marketPriceTypeId;
    if (marketPriceCategoryId && !agg.marketPriceCategoryId) agg.marketPriceCategoryId = marketPriceCategoryId;
    if (recipeUnit && !agg.recipeUnit) agg.recipeUnit = recipeUnit;
    if (purchaseUnitConversion !== '' && agg.purchaseUnitConversion === '') {
      agg.purchaseUnitConversion = purchaseUnitConversion;
    }
    if (unit && !agg.unit) agg.unit = unit;
    if (inventoryPackaging && !agg.inventoryPackaging) agg.inventoryPackaging = inventoryPackaging;
    if (packedUnits && !agg.packedUnits) agg.packedUnits = packedUnits;
    if (numberOfUnits && !agg.numberOfUnits) agg.numberOfUnits = numberOfUnits;
    if (packingLength && !agg.packingLength) agg.packingLength = packingLength;
    if (packingWidth && !agg.packingWidth) agg.packingWidth = packingWidth;
    if (packingHeight && !agg.packingHeight) agg.packingHeight = packingHeight;
    if (supplierName) agg.supplierNames.push(supplierName);
  }

  return Array.from(map.values()).map((i) => {
    const uniqueSupplierNames = Array.from(new Set(i.supplierNames.filter(Boolean)));
    return {
      ...i,
      supplierNames: uniqueSupplierNames,
      suppliersCount: uniqueSupplierNames.length || (i.supplierRows || []).length,
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Colonnes du tableau article (ligne repliée). */
export const MARKET_PRICE_TABLE_HEADERS = [
  { title: "", key: "expand", sortable: false, width: 44 },
  { title: "Image", key: "image", sortable: false, width: 80 },
  { title: "Item Name", key: "name" },
  { title: "Recipe Unit", key: "recipeUnit" },
  { title: "Purchase Unit Conversion", key: "purchaseUnitConversion" },
  { title: "Good Type", key: "goodType" },
  { title: "Category", key: "category" },
  { title: "Actions", key: "actions", sortable: false, align: "end", width: 140 },
];

/** Colonnes du détail par fournisseur (ligne dépliée). */
export const MARKET_PRICE_SUPPLIER_HEADERS = [
  { title: "Supplier", key: "supplierName" },
  { title: "Supplier Item", key: "supplierItemName" },
  { title: "Storage", key: "storageType" },
  { title: "Unit", key: "unit" },
  { title: "Units/Purchase", key: "unitsPerPurchase" },
  { title: "Price", key: "price" },
  { title: "Price/Unit", key: "pricePerUnit" },
  { title: "Recipe Unit Cost", key: "recipeUnitCost" },
  { title: "Packaging", key: "purchasePackaging" },
  { title: "Added", key: "addedAt" },
  { title: "Actions", key: "actions" },
];
