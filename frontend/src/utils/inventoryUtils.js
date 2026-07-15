// Utility functions for calculating inventory from menu items

// NOTE: les types TS sont supprimés, les imports de type ne sont plus nécessaires
// import { MenuItem } from '../App';
// import { MenuItemData, MenuItemComponent } from '../components/types/menu-types';

const normName = (v) => String(v ?? '').trim().toLowerCase();

// ── Décomposition ComponentDefinition → ingrédients feuilles (F6) ────────────
// « On ne commande pas un composant » : un ComponentDefinition (ex. Pickles Auxerre)
// n'est ni compté ni réarmé tel quel — il est éclaté en ses sous-éléments feuilles.
// Ces 3 helpers sont partagés inventaire (inventoryUtils) ⇄ restock (stockPlanning)
// pour garantir une IDENTITÉ ingrédient identique des deux côtés (sinon le netting
// comptage↔réarmement ne joint pas).

/**
 * Identité de jointure d'un sous-élément — DOIT être identique inventaire ⇄ restock.
 * marketPriceId (matière achetée = vraie identité) → sourceId → id → null.
 */
export function componentIngredientId(sub) {
  return sub?.marketPriceId || sub?.sourceId || sub?.id || null;
}

/**
 * Résout le ComponentDefinition catalogue référencé par `component`.
 * Un sous-`Component` ne porte PAS d'id de réf vers le parent (cf. modèle de données)
 * → match par sourceId/id puis par NOM normalisé (chemin fiable pour les sous-composants).
 */
export function resolveComponentDef(component, components) {
  if (!component || !Array.isArray(components) || !components.length) return null;
  const cid = component.sourceId ?? component.id ?? null;
  const cname = normName(component.name);
  return (
    (cid != null && components.find((c) => c.id === cid || c.sourceId === cid)) ||
    (cname ? components.find((c) => normName(c.name) === cname) : null) ||
    null
  );
}

/**
 * Aplatit un ComponentDefinition en ses ingrédients feuilles (récursif, anti-cycle).
 * Retourne [{ id, sourceId, name, unit, qtyFactor }] où `qtyFactor` = produit des
 * (numberOfUnits / numberOfUnitsRecipe) le long de l'arbre — facteur BOM à multiplier
 * par la quantité de composant côté restock ; ignoré côté inventaire (présence seule).
 */
export function flattenComponentDef(def, components, depth = 0, visited = null, factor = 1) {
  const MAX_DEPTH = 10;
  if (!def || depth > MAX_DEPTH) return [];
  const seen = visited || new Set();
  const key = def.id || normName(def.name);
  if (key && seen.has(key)) return []; // anti-cycle (A→B→A par nom)
  if (key) seen.add(key);
  const recipe = Number(def.numberOfUnitsRecipe) > 0 ? Number(def.numberOfUnitsRecipe) : 1;
  const out = [];
  for (const sub of def.subComponents || []) {
    const units = Number(sub?.numberOfUnits) > 0 ? Number(sub.numberOfUnits) : 1;
    const subFactor = (factor * units) / recipe;
    if (sub?.itemType === 'Component') {
      const childDef = resolveComponentDef(sub, components);
      if (childDef && Array.isArray(childDef.subComponents) && childDef.subComponents.length) {
        out.push(...flattenComponentDef(childDef, components, depth + 1, seen, subFactor));
        continue;
      }
      // Sous-composant sans def catalogue → traité en feuille ci-dessous (fallback).
    }
    const name = String(sub?.name ?? '').trim();
    if (!name) continue;
    out.push({
      id: componentIngredientId(sub),
      sourceId: sub?.sourceId ?? null,
      name,
      unit: sub?.unit || 'unit',
      qtyFactor: subFactor,
    });
  }
  return out;
}

/**
 * Recursively expands menu items into their component ingredients
 * For Combo items with "Ready for Sale" = "No", it will expand to show their components/ingredients
 * instead of showing the combo item itself
 */
export function expandInventoryItems(menuItems, allMenuItemsData, depth = 0) {
  const MAX_DEPTH = 10; // Prevent infinite recursion
  if (depth > MAX_DEPTH) {
    console.warn('Maximum recursion depth reached in expandInventoryItems');
    return [];
  }

  const inventoryMap = new Map();

  menuItems.forEach(menuItem => {
    // Find the full menu item data
    const menuItemData = allMenuItemsData.find(
      mi => mi.name === menuItem.name || mi.id === menuItem.id,
    );

    if (!menuItemData) {
      // If no data found, just add the item as-is
      if (!inventoryMap.has(menuItem.name)) {
        inventoryMap.set(menuItem.name, {
          name: menuItem.name,
          id: menuItem.id,
          isExpanded: false,
        });
      }
      return;
    }

    // Check if this is a combo item with "Ready for Sale" = "No"
    const shouldExpand =
      menuItemData.comboItem === 'Yes' && menuItemData.readyForSale === 'No';

    if (shouldExpand && menuItemData.components && menuItemData.components.length > 0) {
      // Expand this item - recursively process its components
      console.log(
        `Expanding menu item "${menuItemData.name}" (Ready for Sale: No)`,
      );

      menuItemData.components.forEach(component => {
        // Check if this component is itself a menu item that should be expanded
        const componentMenuItem = allMenuItemsData.find(
          mi => mi.name === component.name || mi.id === component.sourceId,
        );

        if (
          componentMenuItem &&
          componentMenuItem.comboItem === 'Yes' &&
          componentMenuItem.readyForSale === 'No'
        ) {
          // Recursively expand this component
          const expandedComponents = expandInventoryItems(
            [{ name: component.name, id: component.id }],
            allMenuItemsData,
            depth + 1,
          );
          expandedComponents.forEach(item => {
            if (!inventoryMap.has(item.name)) {
              inventoryMap.set(item.name, item);
            }
          });
        } else {
          // Add the component as-is (it's either an ingredient or a ready-for-sale item)
          if (!inventoryMap.has(component.name)) {
            inventoryMap.set(component.name, {
              name: component.name,
              id: component.id,
              isExpanded: true,
            });
          }
        }
      });
    } else {
      // Don't expand - add the item as-is
      if (!inventoryMap.has(menuItemData.name)) {
        inventoryMap.set(menuItemData.name, {
          name: menuItemData.name,
          id: menuItemData.id,
          isExpanded: false,
        });
      }
    }
  });

  return Array.from(inventoryMap.values());
}

/**
 * Checks if a menu item should be expanded in inventory
 */
export function shouldExpandMenuItem(menuItemData) {
  if (!menuItemData) return false;
  return menuItemData.comboItem === 'Yes' && menuItemData.readyForSale === 'No';
}

/**
 * Gets inventory items for display, with expansion logic
 * This replaces the simple menuItems list with an expanded version
 */
export function getExpandedInventoryForElement(element, allMenuItemsData) {
  const menuItems = element.menuItems || [];

  // Get expanded inventory
  const expandedItems = expandInventoryItems(menuItems, allMenuItemsData);

  // Preserve quantity information if available
  return expandedItems.map(item => {
    const originalItem = menuItems.find(mi => mi.name === item.name);
    return {
      ...item,
      quantity: originalItem?.quantity,
      initialQuantity: originalItem?.initialQuantity,
    };
  });
}

/**
 * Builds a consolidated inventory view showing base components/ingredients
 * and which menu items (sold at this F&B element) use each item.
 *
 * @param {Array} availableMenuItems   Menu items sold at this F&B element
 * @param {Array} allMenuItemsData     Full menu items catalog
 * @param {Array} [marketPrices]       Market price catalog (for image lookup)
 * @param {boolean} [skipImages=false] Skip eager image enrichment
 * @param {Array} [components]         Component definitions (for packaging/unit lookup)
 */
export function buildConsolidatedInventory(
  availableMenuItems,
  allMenuItemsData,
  marketPrices,
  skipImages = false,
  components,
) {
  // Map to track: component/ingredient name -> Set of menu item names that use it
  const inventoryMap = new Map();

  // Helper function to recursively get all components/ingredients from a menu item
  const getAllComponentsAndIngredients = (menuItem, depth = 0) => {
    const MAX_DEPTH = 10;
    if (depth > MAX_DEPTH) return [];

    const result = [];

    if (!menuItem.components || menuItem.components.length === 0) {
      return result;
    }

    menuItem.components.forEach(component => {
      // Check if this is a packaging item - packaging should NOT be inherited from combo items
      // Packaging must be explicitly added to each menu item
      const categoryLower = String(component.category ?? '').toLowerCase();
      const storageTypeLower = String(component.storageType ?? '').toLowerCase();
      const sourceId = String(component.sourceId ?? component.id ?? '').toLowerCase();

      const isPackaging =
        categoryLower.includes('packaging') ||
        categoryLower.includes('emballage') ||
        storageTypeLower === 'material' ||
        sourceId.startsWith('pkg-');

      // Skip packaging items during recursive expansion
      if (isPackaging) {
        console.log(
          `[Inventory] Skipping packaging "${component.name}" during recursive expansion of "${menuItem.name}"`,
        );
        return;
      }

      // Find if this component is itself a menu item that should be expanded
      const componentMenuItem = allMenuItemsData.find(
        mi => mi.name === component.name || mi.id === component.sourceId,
      );

      if (
        componentMenuItem &&
        componentMenuItem.comboItem === 'Yes' &&
        componentMenuItem.readyForSale === 'No'
      ) {
        // This is a combo item that should be expanded - recursively get its components
        const subComponents = getAllComponentsAndIngredients(
          componentMenuItem,
          depth + 1,
        );
        result.push(...subComponents);
      } else {
        // Composant composite (ComponentDefinition, ex. Pickles Auxerre) : « on ne
        // commande pas un composant » → l'éclater en ses sous-éléments feuilles au
        // lieu de compter le composant. Un Ingredient ne s'éclate jamais (feuille).
        const def =
          component.itemType === 'Ingredient'
            ? null
            : resolveComponentDef(component, components);
        if (def && Array.isArray(def.subComponents) && def.subComponents.length) {
          for (const leaf of flattenComponentDef(def, components, depth + 1)) {
            result.push({ name: leaf.name, id: leaf.id ?? leaf.sourceId ?? leaf.name });
          }
        } else if (String(component.name ?? '').trim()) {
          // Feuille classique (ingrédient / composant sans def) — nom requis :
          // une entrée sans nom deviendrait une clé Map undefined → crash au sort.
          result.push({
            name: component.name,
            id: component.id,
          });
        }
      }
    });

    return result;
  };

  // Process each menu item that's available for this F&B element
  availableMenuItems.forEach(menuItem => {
    // Special case: Menu items with "Ready for Sale" = "Yes" and exactly ONE Ingredient.
    // For these, use the Market Price item directly instead of the menu item (dedupes
    // the same ingredient across multiple menu items, e.g. a soft drink).
    if (
      menuItem.readyForSale === 'Yes' &&
      menuItem.components &&
      menuItem.components.length > 0
    ) {
      // Filter to get only Ingredients (not packaging, not components)
      const ingredients = menuItem.components.filter(comp => {
        const categoryLower = String(comp.category ?? '').toLowerCase();
        const storageTypeLower = String(comp.storageType ?? '').toLowerCase();
        const sourceId = String(comp.sourceId ?? comp.id ?? '').toLowerCase();

        const isPackaging =
          categoryLower.includes('packaging') ||
          categoryLower.includes('emballage') ||
          storageTypeLower === 'material' ||
          sourceId.startsWith('pkg-');

        return !isPackaging && comp.itemType === 'Ingredient';
      });

      // If there's exactly ONE Ingredient, use the Market Price item instead of the menu item
      if (ingredients.length === 1) {
        const singleIngredient = ingredients[0];

        // Find the Market Price item for this ingredient
        let marketPriceItem;
        if (marketPrices && marketPrices.length > 0) {
          // Try by marketPriceId first
          if (singleIngredient.marketPriceId) {
            marketPriceItem = marketPrices.find(mp => mp.id === singleIngredient.marketPriceId);
          }
          // Then by marketPriceItemName
          if (!marketPriceItem && singleIngredient.marketPriceItemName) {
            marketPriceItem = marketPrices.find(
              mp => mp.itemName === singleIngredient.marketPriceItemName,
            );
          }
          // Finally by ingredient name
          if (!marketPriceItem) {
            marketPriceItem = marketPrices.find(mp => mp.itemName === singleIngredient.name);
          }
        }

        if (marketPriceItem) {
          // Use the Market Price item name as the inventory key (dedupe across menu items)
          const inventoryKey = marketPriceItem.itemName;

          if (!inventoryMap.has(inventoryKey)) {
            inventoryMap.set(inventoryKey, {
              id: marketPriceItem.id, // Use Market Price ID
              usedIn: new Set(),
              usedInDetails: [],
            });
          }

          const entry = inventoryMap.get(inventoryKey);
          if (!entry.usedIn.has(menuItem.name)) {
            entry.usedIn.add(menuItem.name);
            entry.usedInDetails.push({
              name: menuItem.name,
              id: menuItem.id,
              picture: menuItem.picture,
            });
          }

          // Still process packaging items for this menu item
          menuItem.components.forEach(component => {
            const categoryLower = String(component.category ?? '').toLowerCase();
            const storageTypeLower = String(component.storageType ?? '').toLowerCase();
            const sourceId = String(component.sourceId ?? component.id ?? '').toLowerCase();

            const isPackaging =
              categoryLower.includes('packaging') ||
              categoryLower.includes('emballage') ||
              storageTypeLower === 'material' ||
              sourceId.startsWith('pkg-');

            if (isPackaging) {
              if (!inventoryMap.has(component.name)) {
                inventoryMap.set(component.name, {
                  id: component.id,
                  usedIn: new Set(),
                  usedInDetails: [],
                });
              }

              const packagingEntry = inventoryMap.get(component.name);
              if (!packagingEntry.usedIn.has(menuItem.name)) {
                packagingEntry.usedIn.add(menuItem.name);
                packagingEntry.usedInDetails.push({
                  name: menuItem.name,
                  id: menuItem.id,
                  picture: menuItem.picture,
                });
              }
            }
          });

          // Skip the normal "ready for sale" processing below
          return;
        }
        // else: no market price found -> fall through to normal logic
      }
    }

    // For menu items that are ready for sale, they appear as inventory items themselves
    if (menuItem.readyForSale === 'Yes') {
      // This item is sold directly - add the item itself to inventory
      if (!inventoryMap.has(menuItem.name)) {
        inventoryMap.set(menuItem.name, {
          id: menuItem.id,
          usedIn: new Set(),
          usedInDetails: [],
        });
      }

      // Add the menu item to its own "used in" list since it's sold as itself
      const entry = inventoryMap.get(menuItem.name);
      if (!entry.usedIn.has(menuItem.name)) {
        entry.usedIn.add(menuItem.name);
        entry.usedInDetails.push({
          name: menuItem.name,
          id: menuItem.id,
          picture: menuItem.picture,
        });
      }

      // For ready-for-sale items, ONLY add packaging components to inventory, not ingredients
      if (menuItem.components && menuItem.components.length > 0) {
        menuItem.components.forEach(component => {
          const categoryLower = String(component.category ?? '').toLowerCase();
          const storageTypeLower = String(component.storageType ?? '').toLowerCase();
          const sourceId = String(component.sourceId ?? component.id ?? '').toLowerCase();

          const isPackaging =
            categoryLower.includes('packaging') ||
            categoryLower.includes('emballage') ||
            storageTypeLower === 'material' ||
            sourceId.startsWith('pkg-');

          console.log(
            `[Inventory] Checking component "${component.name}" for ready-for-sale item "${menuItem.name}":`,
            {
              category: component.category,
              storageType: component.storageType,
              sourceId: component.sourceId || component.id,
              isPackaging,
            },
          );

          if (isPackaging) {
            if (!inventoryMap.has(component.name)) {
              inventoryMap.set(component.name, {
                id: component.id,
                usedIn: new Set(),
                usedInDetails: [],
              });
            }

            const entry2 = inventoryMap.get(component.name);
            if (!entry2.usedIn.has(menuItem.name)) {
              entry2.usedIn.add(menuItem.name);
              entry2.usedInDetails.push({
                name: menuItem.name,
                id: menuItem.id,
                picture: menuItem.picture,
              });
            }
          }
        });
      }

      // Skip processing ingredients/components for ready-for-sale items
      return;
    }

    // For items not ready for sale, add them to inventory if they have no components
    if (!menuItem.components || menuItem.components.length === 0) {
      if (!inventoryMap.has(menuItem.name)) {
        inventoryMap.set(menuItem.name, {
          id: menuItem.id,
          usedIn: new Set(),
          usedInDetails: [],
        });
      }
      // L'article est sa propre ligne de stock : il se couvre lui-même (sinon le
      // rapport « stocks ↔ menus » le compte à tort comme menu non couvert).
      const selfEntry = inventoryMap.get(menuItem.name);
      if (!selfEntry.usedIn.has(menuItem.name)) {
        selfEntry.usedIn.add(menuItem.name);
        selfEntry.usedInDetails.push({
          name: menuItem.name,
          id: menuItem.id,
          picture: menuItem.picture,
        });
      }
      return;
    }

    // Get all components/ingredients from this menu item (recursively)
    // This will exclude packaging items as they should not be inherited
    const allComponents = getAllComponentsAndIngredients(menuItem);

    // Track each component and which menu item uses it
    allComponents.forEach(component => {
      if (!inventoryMap.has(component.name)) {
        inventoryMap.set(component.name, {
          id: component.id,
          usedIn: new Set(),
          usedInDetails: [],
        });
      }

      const entry = inventoryMap.get(component.name);

      // Only add this menu item if it hasn't been added already
      if (!entry.usedIn.has(menuItem.name)) {
        entry.usedIn.add(menuItem.name);
        entry.usedInDetails.push({
          name: menuItem.name,
          id: menuItem.id,
          picture: menuItem.picture,
        });
      }
    });

    // Now process packaging items that are directly added to this menu item
    // Packaging is NOT inherited from combo items - must be explicitly added
    let addedDirectPackaging = false;
    if (menuItem.components && menuItem.components.length > 0) {
      menuItem.components.forEach(component => {
        const categoryLower = String(component.category ?? '').toLowerCase();
        const storageTypeLower = String(component.storageType ?? '').toLowerCase();
        const sourceId = String(component.sourceId ?? component.id ?? '').toLowerCase();

        const isPackaging =
          categoryLower.includes('packaging') ||
          categoryLower.includes('emballage') ||
          storageTypeLower === 'material' ||
          sourceId.startsWith('pkg-');

        if (isPackaging) {
          console.log(
            `[Inventory] Adding packaging "${component.name}" directly from "${menuItem.name}"`,
          );

          if (!inventoryMap.has(component.name)) {
            inventoryMap.set(component.name, {
              id: component.id,
              usedIn: new Set(),
              usedInDetails: [],
            });
          }

          const entry = inventoryMap.get(component.name);
          if (!entry.usedIn.has(menuItem.name)) {
            entry.usedIn.add(menuItem.name);
            entry.usedInDetails.push({
              name: menuItem.name,
              id: menuItem.id,
              picture: menuItem.picture,
            });
          }
          addedDirectPackaging = true;
        }
      });
    }

    // Filet de sécurité : un article vendu ne peut jamais produire 0 ligne à
    // compter. Si l'expansion recette n'a donné aucune feuille exploitable
    // (components sans nom, tous packaging hérités, sous-combos vides…), on
    // retombe sur « l'article est sa propre ligne de stock ».
    if (allComponents.length === 0 && !addedDirectPackaging) {
      console.log(
        `[Inventory] Expansion vide pour "${menuItem.name}" (components présents mais aucune feuille nommée) — fallback sur l'article lui-même`,
      );
      if (!inventoryMap.has(menuItem.name)) {
        inventoryMap.set(menuItem.name, {
          id: menuItem.id,
          usedIn: new Set(),
          usedInDetails: [],
        });
      }
      const fallbackEntry = inventoryMap.get(menuItem.name);
      if (!fallbackEntry.usedIn.has(menuItem.name)) {
        fallbackEntry.usedIn.add(menuItem.name);
        fallbackEntry.usedInDetails.push({
          name: menuItem.name,
          id: menuItem.id,
          picture: menuItem.picture,
        });
      }
    }
  });

  // Convert map to array, resolving market-price / component packaging metadata.
  // 5-step enrichment (port of versionReact inventoryUtils.ts) — these fields
  // (marketPriceId / inventoryPackagingId / inventoryQuantityPackaged / unit) drive
  // the inventory-counting UI and the restock packed-quantity math.
  // Le drawer Market Price « Inventory Information » persiste la qté/paquet dans
  // `packedUnits` (jamais dans `inventoryQuantityPackaged`, réservé au backend) :
  // on replie donc sur `packedUnits` quand `inventoryQuantityPackaged` est vide/0.
  const resolveQtyPackaged = (src) =>
    Number(src?.inventoryQuantityPackaged) > 0
      ? src.inventoryQuantityPackaged
      : Number(src?.packedUnits) > 0
        ? src.packedUnits
        : src?.inventoryQuantityPackaged;
  // Index marketPrices UNE fois (id + itemName) : les Step 0/2a résolvaient par
  // `marketPrices.find(...)` PAR article → O(articles × catalogue). Première
  // occurrence conservée (parité avec le premier match de `.find`).
  const mpById = new Map();
  const mpByName = new Map();
  if (Array.isArray(marketPrices)) {
    for (const mp of marketPrices) {
      if (mp?.id != null && !mpById.has(mp.id)) mpById.set(mp.id, mp);
      if (mp?.itemName != null && !mpByName.has(mp.itemName)) mpByName.set(mp.itemName, mp);
    }
  }
  const result = Array.from(inventoryMap.entries())
    // Écarte toute clé falsy/vide (un component/menuItem sans nom produirait une
    // clé `undefined` → plus bas `undefined.localeCompare` au sort).
    .filter(([name]) => String(name ?? '').trim())
    .map(([name, data]) => {
    let picture;
    let marketPriceId;
    let inventoryPackagingId;
    let inventoryQuantityPackaged;
    let inventoryPackaging;
    let unit;
    let isComponent;

    // Menu Item « Inventory Information » (inventoryNumberOfUnits / inventoryPackagingType,
    // saisie sur le form menu item). Décision dir 2026-07-13 : PRIORITAIRE sur
    // MarketPrice / ComponentDefinition. Fournit le facteur paquet (qté) + le libellé
    // packaging ; le form n'a PAS de champ unité → `unit` reste résolu via MP/Component.
    // Résolu ici une seule fois : appliqué en override sur les deux chemins (Step 0 et
    // chemin ingredient/component/marketPrice).
    //
    // ⚠️ GATE anti-défaut : le form persiste `inventoryNumberOfUnits` en `Number(x) || 1`
    // → quasi TOUS les menu items portent 1 (défaut, pas une valeur voulue). Overrider
    // sur 1 écraserait un facteur MarketPrice réel (ex. caisse de 24 → 1). On n'override
    // donc la qté QUE sur une valeur d'intention (`!== 1 && > 0`) — 1 ≡ « pas de facteur
    // paquet », no-op indistinguable du défaut. Le libellé packaging reste null-safe
    // (défaut `null` du form → seul un choix explicite override).
    const itemData = allMenuItemsData.find(mi => mi.id === data.id || mi.name === name);
    const miUnits = Number(itemData?.inventoryNumberOfUnits);
    const miQtyPackaged = miUnits > 0 && miUnits !== 1 ? miUnits : null;
    const miPackaging = itemData?.inventoryPackagingType || null;

    // Step 0: Item IS itself a Market Price item (added via single-ingredient menu
    // items). In this case data.id is the Market Price ID.
    if (marketPrices && marketPrices.length > 0) {
      const directMarketPriceItem = mpById.get(data.id) || mpByName.get(name);
      if (directMarketPriceItem) {
        if (directMarketPriceItem.image) picture = directMarketPriceItem.image;
        marketPriceId = directMarketPriceItem.id;
        inventoryPackagingId = directMarketPriceItem.inventoryPackagingId;
        // Override Menu Item Info : la qté/paquet et le libellé packaging saisis sur
        // le menu item priment sur le MarketPrice (marketPriceId/packagingId/unit gardés).
        inventoryQuantityPackaged =
          miQtyPackaged != null ? miQtyPackaged : resolveQtyPackaged(directMarketPriceItem);
        inventoryPackaging = miPackaging || directMarketPriceItem.inventoryPackaging;
        unit = directMarketPriceItem.unit;

        return {
          name,
          id: data.id,
          picture,
          usedIn: data.usedInDetails,
          marketPriceId,
          inventoryPackagingId,
          inventoryQuantityPackaged,
          inventoryPackaging,
          unit,
          isComponent,
        };
      }
    }

    // Step 1: Is this an ingredient? Look in any menu item's components.
    let ingredientComponent;
    for (const menuItem of allMenuItemsData) {
      if (menuItem.components) {
        const component = menuItem.components.find(
          c => c.id === data.id || c.name === name,
        );
        if (component && component.itemType === 'Ingredient') {
          ingredientComponent = component;
          break;
        }
      }
    }

    // Step 2a: Ingredient -> resolve Market Price data (id/packaging/qty/unit + image).
    if (ingredientComponent && marketPrices && marketPrices.length > 0) {
      const applyMp = mp => {
        if (mp.image) picture = mp.image;
        marketPriceId = mp.id;
        inventoryPackagingId = mp.inventoryPackagingId;
        inventoryQuantityPackaged = resolveQtyPackaged(mp);
        inventoryPackaging = mp.inventoryPackaging;
        unit = mp.unit;
      };
      // by marketPriceId
      if (ingredientComponent.marketPriceId) {
        const mp = mpById.get(ingredientComponent.marketPriceId);
        if (mp) applyMp(mp);
      }
      // by item name
      if (!marketPriceId && ingredientComponent.marketPriceItemName) {
        const mp = mpByName.get(ingredientComponent.marketPriceItemName);
        if (mp) applyMp(mp);
      }
      // by component name
      if (!marketPriceId) {
        const mp = mpByName.get(name);
        if (mp) applyMp(mp);
      }
    }

    // Step 2b: Component (not ingredient) -> resolve ComponentDefinition packaging fields.
    if (!ingredientComponent && components && components.length > 0) {
      let componentDef = components.find(c => c.id === data.id || c.name === name);

      // Fallback: search menu items to find this component, then resolve by sourceId or name.
      if (!componentDef) {
        for (const menuItem of allMenuItemsData) {
          if (!menuItem.components) continue;
          const comp = menuItem.components.find(c => c.id === data.id || c.name === name);
          if (comp && comp.itemType === 'Component') {
            if (comp.sourceId) {
              componentDef = components.find(c => c.id === comp.sourceId);
              if (componentDef) break;
            }
            if (!componentDef) {
              componentDef = components.find(c => c.name === comp.name);
              if (componentDef) break;
            }
          }
        }
      }

      if (componentDef) {
        inventoryPackagingId = componentDef.inventoryPackagingId;
        inventoryQuantityPackaged = resolveQtyPackaged(componentDef);
        inventoryPackaging = componentDef.inventoryPackaging;
        unit = componentDef.unit;
        isComponent = true;
      }
    }

    // Step 2c: override Menu Item « Inventory Information » (résolu en tête de map).
    // PRIORITAIRE sur ce qu'ont fourni ingredient / component / market price
    // (décision dir 2026-07-13). N'affecte NI unit NI marketPriceId/packagingId —
    // seulement le facteur paquet (qté) et le libellé packaging. Couvre aussi le repli
    // historique : un article ready-for-sale sans Market Price prend sa qté du menu item.
    if (miQtyPackaged != null) inventoryQuantityPackaged = miQtyPackaged;
    if (miPackaging) inventoryPackaging = miPackaging;

    // Step 3: Image from menu item / component catalog.
    if (!skipImages && !picture) {
      if (itemData?.picture) picture = itemData.picture;
    }

    // Step 4: Component (not ingredient) image via matching combo menu item.
    if (!skipImages && !picture && !ingredientComponent) {
      for (const menuItem of allMenuItemsData) {
        if (!menuItem.components) continue;
        const component = menuItem.components.find(c => c.id === data.id || c.name === name);
        if (component && component.itemType === 'Component') {
          const componentMenuItem = allMenuItemsData.find(
            mi => mi.name === component.name && mi.comboItem === 'Yes',
          );
          if (componentMenuItem?.picture) {
            picture = componentMenuItem.picture;
            break;
          }
        }
      }
    }

    // Step 5: Fall back to the first "usedIn" item's picture.
    if (!picture && data.usedInDetails.length > 0) {
      picture = data.usedInDetails[0]?.picture;
    }

    return {
      name,
      id: data.id,
      picture,
      usedIn: data.usedInDetails,
      marketPriceId,
      inventoryPackagingId,
      inventoryQuantityPackaged,
      inventoryPackaging,
      unit,
      isComponent,
    };
  });

  // Sort by name (garde défensive : jamais de localeCompare sur undefined).
  result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  return result;
}

/**
 * Enriches inventory items with images on-demand (lazy loading).
 * Ingredients → image from market prices.
 * Menu items / components → image from menu items catalog.
 */
export function enrichInventoryItemsWithImages(
  inventoryItems,
  allMenuItemsData,
  marketPrices,
) {
  if (!Array.isArray(inventoryItems)) return [];
  return inventoryItems.map((item) => {
    if (item.picture) return item;

    let picture;
    // Find if it's an ingredient via menu item components
    let ingredientComponent;
    for (const mi of allMenuItemsData || []) {
      if (mi.components) {
        const comp = mi.components.find(
          (c) => c.id === item.id || c.name === item.name,
        );
        if (comp && comp.itemType === 'Ingredient') {
          ingredientComponent = comp;
          break;
        }
      }
    }

    if (ingredientComponent && Array.isArray(marketPrices) && marketPrices.length) {
      if (ingredientComponent.marketPriceId) {
        const mp = marketPrices.find((m) => m.id === ingredientComponent.marketPriceId);
        if (mp?.image) picture = mp.image;
      }
      if (!picture && ingredientComponent.marketPriceItemName) {
        const mp = marketPrices.find((m) => m.itemName === ingredientComponent.marketPriceItemName);
        if (mp?.image) picture = mp.image;
      }
      if (!picture) {
        const mp = marketPrices.find((m) => m.itemName === item.name);
        if (mp?.image) picture = mp.image;
      }
    }

    if (!picture) {
      const mi = (allMenuItemsData || []).find(
        (m) => m.id === item.id || m.name === item.name,
      );
      if (mi?.picture) picture = mi.picture;
    }

    // Step 4: component (not ingredient) image via matching combo menu item
    if (!picture && !ingredientComponent) {
      for (const mi of allMenuItemsData || []) {
        if (!mi.components) continue;
        const component = mi.components.find(
          (c) => c.id === item.id || c.name === item.name,
        );
        if (component && component.itemType === 'Component') {
          const componentMenuItem = (allMenuItemsData || []).find(
            (m) => m.name === component.name && m.comboItem === 'Yes',
          );
          if (componentMenuItem?.picture) {
            picture = componentMenuItem.picture;
            break;
          }
        }
      }
    }

    if (!picture && Array.isArray(item.usedIn) && item.usedIn.length) {
      picture = item.usedIn[0]?.picture;
    }

    return { ...item, picture };
  });
}

/**
 * Builds inventory for Storage elements by aggregating all inventory items from F&B elements
 * that match the Storage element's storage type(s).
 */
export function buildStorageInventory(
  storageElementTypes,
  allFBElements,
  allMenuItemsData,
  selectedShopIds,
  components,
  marketPrices,
) {
  // Map storage types from menu items to element storage types
  const mapStorageType = menuStorageType => {
    switch (menuStorageType) {
      case 'Dry':
        return 'dry';
      case 'Cold':
        return 'cold';
      case 'Freezer':
        return 'belowzero';
    }
  };

  // Helper function to get storage types for an inventory item
  const getItemStorageTypes = itemName => {
    // Find the menu item that matches this inventory item
    const menuItem = allMenuItemsData.find(mi => mi.name === itemName);

    if (menuItem && menuItem.storageType && menuItem.storageType.length > 0) {
      return menuItem.storageType.map(st => mapStorageType(st));
    }

    // If it's a component/ingredient, look for it in any menu item's components
    for (const menuItem2 of allMenuItemsData) {
      if (menuItem2.components) {
        const component = menuItem2.components.find(c => c.name === itemName);
        if (component && component.storageType) {
          const st = String(component.storageType ?? '').toLowerCase();
          if (
            st === 'dry' ||
            st === 'cold' ||
            st === 'freezer' ||
            st === 'belowzero'
          ) {
            return [st === 'freezer' ? 'belowzero' : st];
          }
        }
      }
    }

    // Default to 'dry' if no storage type found
    return ['dry'];
  };

  // Helper to check if item matches storage types
  const matchesStorageTypes = itemStorageTypes => {
    // If storage element accepts all types, return true
    if (storageElementTypes.length === 0) return true;

    // Check if any of the item's storage types match the storage element's types
    return itemStorageTypes.some(itemType =>
      storageElementTypes.includes(itemType),
    );
  };

  // Map to track: inventory item name -> item details with usage info
  const storageInventoryMap = new Map();

  // Filter F&B elements by selectedShopIds if provided
  const fbElementsToProcess =
    selectedShopIds && selectedShopIds.length > 0
      ? allFBElements.filter(fb => selectedShopIds.includes(fb.id))
      : allFBElements;

  // Process each F&B element
  fbElementsToProcess.forEach(fbElement => {
    if (fbElement.availableMenuItems.length === 0) return;

    // Build consolidated inventory for this F&B element (forward components so
    // packaging / unit metadata is resolved for storage items too).
    // marketPrices DOIT être le même que côté shops : sans lui, un item RFS à
    // ingrédient unique garde son nom de menu item ici mais est renommé itemName
    // market price côté shop → deux clés pour la même denrée (le ledger Logistic
    // keyé par nom perdrait les transferts shop↔storage).
    const consolidatedInventory = buildConsolidatedInventory(
      fbElement.availableMenuItems,
      allMenuItemsData,
      marketPrices,
      false,
      components,
    );

    // Add each inventory item if it matches storage types
    consolidatedInventory.forEach(inventoryItem => {
      const itemStorageTypes = getItemStorageTypes(inventoryItem.name);

      // Check if this item should be stored in this storage element
      if (matchesStorageTypes(itemStorageTypes)) {
        // Get or create entry in storage inventory
        let entry = storageInventoryMap.get(inventoryItem.name);
        if (!entry) {
          entry = {
            id: inventoryItem.id,
            name: inventoryItem.name,
            storageType: itemStorageTypes.join(', '),
            // Métadonnées market-price du consolidated (image, conditionnement…) —
            // nécessaires au popup Logistic (présélection market price, unités/pack).
            picture: inventoryItem.picture ?? null,
            marketPriceId: inventoryItem.marketPriceId ?? null,
            unit: inventoryItem.unit ?? null,
            inventoryPackagingId: inventoryItem.inventoryPackagingId ?? null,
            inventoryQuantityPackaged: inventoryItem.inventoryQuantityPackaged ?? null,
            inventoryPackaging: inventoryItem.inventoryPackaging ?? null,
            usedIn: [],
          };
          storageInventoryMap.set(inventoryItem.name, entry);
        }

        // Add usage information for each menu item that uses this ingredient
        inventoryItem.usedIn.forEach(menuItem => {
          const alreadyExists = entry.usedIn.some(
            u =>
              u.fbElementId === fbElement.id && u.menuItemId === menuItem.id,
          );

          if (!alreadyExists) {
            entry.usedIn.push({
              fbElementName: fbElement.name,
              fbElementId: fbElement.id,
              menuItemName: menuItem.name,
              menuItemId: menuItem.id,
              menuItemPicture: menuItem.picture,
            });
          }
        });
      }
    });
  });

  // Convert map to array and sort
  const result = Array.from(storageInventoryMap.values());
  result.sort((a, b) => a.name.localeCompare(b.name));

  return result;
}

/**
 * Builds inventory for Storage elements with 'merch' type by aggregating all merchandise items
 * from Merch Shop elements.
 */
export function buildMerchStorageInventory(allMerchElements) {
  // Map to track: merch item name -> item details with usage info
  const merchInventoryMap = new Map();

  // Process each Merch Shop element
  allMerchElements.forEach(merchElement => {
    if (merchElement.merchItems.length === 0) return;

    // Add each merch item
    merchElement.merchItems.forEach(item => {
      // Get or create entry in merch inventory
      let entry = merchInventoryMap.get(item.name);
      if (!entry) {
        entry = {
          id: item.id,
          name: item.name,
          usedIn: [],
        };
        merchInventoryMap.set(item.name, entry);
      }

      // Add usage information for this merch shop
      const alreadyExists = entry.usedIn.some(
        u => u.merchShopId === merchElement.id,
      );

      if (!alreadyExists) {
        entry.usedIn.push({
          merchShopName: merchElement.name,
          merchShopId: merchElement.id,
        });
      }
    });
  });

  // Convert map to array and sort
  const result = Array.from(merchInventoryMap.values());
  result.sort((a, b) => a.name.localeCompare(b.name));

  return result;
}