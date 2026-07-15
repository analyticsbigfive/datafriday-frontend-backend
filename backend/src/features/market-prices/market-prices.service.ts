import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateMarketPriceDto } from './dto/create-market-price.dto';
import { UpdateMarketPriceDto } from './dto/update-market-price.dto';
import { SupabaseStorageService } from '../../core/supabase/supabase-storage.service';

@Injectable()
export class MarketPricesService {
  private readonly logger = new Logger(MarketPricesService.name);

  constructor(private prisma: PrismaService, private storage: SupabaseStorageService) {}

  /**
   * Convertit les champs Decimal (sérialisés en string par Prisma) en number,
   * pour que le frontend reçoive `price: 3.5` au lieu de `"3.5"`. Normalise aussi
   * les coûts des ingredients/packagings liés quand ils sont inclus.
   */
  private serialize(mp: any): any {
    if (!mp) return mp;
    const toNum = (v: any) => (v === null || v === undefined ? v : Number(v));
    const out: any = {
      ...mp,
      price: toNum(mp.price),
      pricePerUnit: toNum(mp.pricePerUnit),
    };
    if (Array.isArray(mp.ingredients)) {
      out.ingredients = mp.ingredients.map((i: any) => ({
        ...i,
        costPerRecipeUnit: toNum(i.costPerRecipeUnit),
        costPerPurchaseUnit: toNum(i.costPerPurchaseUnit),
      }));
    }
    if (Array.isArray(mp.packagings)) {
      out.packagings = mp.packagings.map((p: any) => ({
        ...p,
        costPerRecipeUnit: toNum(p.costPerRecipeUnit),
        costPerPurchaseUnit: toNum(p.costPerPurchaseUnit),
      }));
    }
    return out;
  }

  async create(dto: CreateMarketPriceDto, tenantId: string) {
    this.logger.log(`Creating market price "${dto.itemName}" for tenant ${tenantId}`);
    try {
      const image = await this.storage.resolveImage(dto.image, 'market-prices');
      const price = await this.prisma.marketPrice.create({
        data: {
          tenantId,
          itemName: dto.itemName,
          unit: dto.unit,
          price: dto.price,
          goodType: dto.goodType,
          category: dto.category,
          marketPriceTypeId: dto.marketPriceTypeId,
          marketPriceCategoryId: dto.marketPriceCategoryId,
          industrialId: dto.industrialId,
          image,
          supplier: dto.supplier,
          supplierId: dto.supplierId,
          supplierItem: dto.supplierItem,
          recipeUnit: dto.recipeUnit,
          purchaseUnitConversion: dto.purchaseUnitConversion,
          pricePerUnit: dto.pricePerUnit,
          packedUnits: dto.packedUnits,
          numberOfUnits: dto.numberOfUnits,
          unitsPerPurchase: dto.unitsPerPurchase,
          packingWidth: dto.packingWidth,
          packingHeight: dto.packingHeight,
          packingLength: dto.packingLength,
          purchasePackaging: dto.purchasePackaging,
          inventoryPackaging: dto.inventoryPackaging,
        },
        include: { supplierRel: true },
      });
      this.logger.log(`Market price created: ${price.id}`);

      await this.syncRecipeRecordForGoodType(price, dto.goodType, tenantId);

      return this.serialize(price);
    } catch (error) {
      this.logger.error(`Failed to create market price: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid supplierId provided`);
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(`A market price with this item name already exists`);
      }
      throw error;
    }
  }

  async findAll(tenantId: string, page = 1, limit = 200) {
    this.logger.log(`Fetching market prices for tenant ${tenantId} (page=${page}, limit=${limit})`);
    try {
      const skip = (page - 1) * limit;
      const [prices, total] = await Promise.all([
        this.prisma.marketPrice.findMany({
          where: { tenantId },
          orderBy: { itemName: 'asc' },
          include: { supplierRel: true },
          skip,
          take: limit,
        }),
        this.prisma.marketPrice.count({ where: { tenantId } }),
      ]);
      this.logger.log(`Found ${prices.length}/${total} market prices`);
      return {
        data: prices.map((p) => this.serialize(p)),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch market prices: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAllWithIngredients(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      category?: string;
      goodType?: string;
    } = {},
  ) {
    const { page = 1, limit = 100, search, category, goodType } = options;
    this.logger.log(
      `Fetching market prices with ingredients for tenant ${tenantId} ` +
      `(page=${page}, limit=${limit}, search="${search}", category="${category}", goodType=${goodType})`,
    );

    try {
      const skip = (page - 1) * limit;

      // Build where clause - always filter by tenantId for security
      const where: any = { tenantId };

      // Search filter
      if (search && search.trim()) {
        where.OR = [
          { itemName: { contains: search.trim(), mode: 'insensitive' } },
          { category: { contains: search.trim(), mode: 'insensitive' } },
          { supplier: { contains: search.trim(), mode: 'insensitive' } },
        ];
      }

      // Category filter
      if (category && category.trim()) {
        where.category = { contains: category.trim(), mode: 'insensitive' };
      }

      // GoodType filter
      if (goodType) {
        where.goodType = goodType;
      }

      const [data, total] = await Promise.all([
        this.prisma.marketPrice.findMany({
          where,
          orderBy: { itemName: 'asc' },
          include: {
            supplierRel: true,
            marketPriceCategory: true,
            ingredients: {
              where: { deletedAt: null },
              orderBy: { name: 'asc' },
            },
          },
          skip,
          take: limit,
        }),
        this.prisma.marketPrice.count({ where }),
      ]);

      this.logger.log(`Found ${data.length}/${total} market prices with ingredients`);
      return {
        data: data.map((p) => this.serialize(p)),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch market prices with ingredients: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAllWithPackagings(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      category?: string;
    } = {},
  ) {
    const { page = 1, limit = 100, search, category } = options;
    this.logger.log(
      `Fetching market prices with packagings for tenant ${tenantId} ` +
      `(page=${page}, limit=${limit}, search="${search}", category="${category}")`,
    );

    try {
      const skip = (page - 1) * limit;

      const where: any = { tenantId, goodType: 'Packaging' };

      if (search && search.trim()) {
        where.OR = [
          { itemName: { contains: search.trim(), mode: 'insensitive' } },
          { category: { contains: search.trim(), mode: 'insensitive' } },
          { supplier: { contains: search.trim(), mode: 'insensitive' } },
        ];
      }

      if (category && category.trim()) {
        where.category = { contains: category.trim(), mode: 'insensitive' };
      }

      const [data, total] = await Promise.all([
        this.prisma.marketPrice.findMany({
          where,
          orderBy: { itemName: 'asc' },
          include: {
            supplierRel: true,
            marketPriceCategory: true,
            packagings: {
              where: { deletedAt: null },
              orderBy: { name: 'asc' },
            },
          },
          skip,
          take: limit,
        }),
        this.prisma.marketPrice.count({ where }),
      ]);

      this.logger.log(`Found ${data.length}/${total} market prices with packagings`);
      return {
        data: data.map((p) => this.serialize(p)),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch market prices with packagings: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    this.logger.log(`Fetching market price ${id} for tenant ${tenantId}`);
    const price = await this.prisma.marketPrice.findFirst({
      where: { id, tenantId },
      include: { supplierRel: true },
    });

    if (!price) {
      this.logger.warn(`Market price ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Market price with ID ${id} not found`);
    }

    return this.serialize(price);
  }

  async update(id: string, dto: UpdateMarketPriceDto, tenantId: string) {
    this.logger.log(`Updating market price ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);

    const updateData: any = {};
    if (dto.itemName !== undefined) updateData.itemName = dto.itemName;
    if (dto.unit !== undefined) updateData.unit = dto.unit;
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.goodType !== undefined) updateData.goodType = dto.goodType;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.marketPriceTypeId !== undefined) updateData.marketPriceTypeId = dto.marketPriceTypeId;
    if (dto.marketPriceCategoryId !== undefined) updateData.marketPriceCategoryId = dto.marketPriceCategoryId;
    if (dto.industrialId !== undefined) updateData.industrialId = dto.industrialId;
    if (dto.image !== undefined) updateData.image = await this.storage.resolveImage(dto.image, 'market-prices');
    if (dto.supplier !== undefined) updateData.supplier = dto.supplier;
    if (dto.supplierId !== undefined) updateData.supplierId = dto.supplierId;
    if (dto.supplierItem !== undefined) updateData.supplierItem = dto.supplierItem;
    if (dto.recipeUnit !== undefined) updateData.recipeUnit = dto.recipeUnit;
    if (dto.purchaseUnitConversion !== undefined) updateData.purchaseUnitConversion = dto.purchaseUnitConversion;
    if (dto.pricePerUnit !== undefined) updateData.pricePerUnit = dto.pricePerUnit;
    if (dto.packedUnits !== undefined) updateData.packedUnits = dto.packedUnits;
    if (dto.numberOfUnits !== undefined) updateData.numberOfUnits = dto.numberOfUnits;
    if (dto.unitsPerPurchase !== undefined) updateData.unitsPerPurchase = dto.unitsPerPurchase;
    if (dto.packingWidth !== undefined) updateData.packingWidth = dto.packingWidth;
    if (dto.packingHeight !== undefined) updateData.packingHeight = dto.packingHeight;
    if (dto.packingLength !== undefined) updateData.packingLength = dto.packingLength;
    if (dto.purchasePackaging !== undefined) updateData.purchasePackaging = dto.purchasePackaging;
    if (dto.inventoryPackaging !== undefined) updateData.inventoryPackaging = dto.inventoryPackaging;

    try {
      const price = await this.prisma.marketPrice.update({
        where: { id },
        data: updateData,
        include: { supplierRel: true },
      });
      this.logger.log(`Market price ${id} updated`);

      if (dto.goodType !== undefined) {
        await this.syncRecipeRecordForGoodType(price, dto.goodType, tenantId);
      }
      await this.resyncLinkedRecipeCosts(price, tenantId);

      return this.serialize(price);
    } catch (error) {
      this.logger.error(`Failed to update market price ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid supplierId provided`);
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`Market price with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    this.logger.log(`Deleting market price ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);

    try {
      const result = await this.prisma.marketPrice.delete({ where: { id } });
      this.logger.log(`Market price ${id} deleted`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete market price ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2025') {
        throw new NotFoundException(`Market price with ID ${id} not found`);
      }
      throw error;
    }
  }

  async removeByItemName(itemName: string, tenantId: string) {
    this.logger.log(`Deleting all market prices with itemName "${itemName}" for tenant ${tenantId}`);
    try {
      const result = await this.prisma.marketPrice.deleteMany({
        where: { itemName, tenantId },
      });
      this.logger.log(`Deleted ${result.count} market prices for itemName "${itemName}"`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete by itemName: ${error.message}`, error.stack);
      throw error;
    }
  }

  async bulkCreate(items: CreateMarketPriceDto[], tenantId: string) {
    this.logger.log(`Bulk creating ${items.length} market prices for tenant ${tenantId}`);
    try {
      const results = [];
      for (const dto of items) {
        const image = await this.storage.resolveImage(dto.image, 'market-prices');
        const price = await this.prisma.marketPrice.create({
          data: {
            tenantId,
            itemName: dto.itemName,
            unit: dto.unit,
            price: dto.price,
            goodType: dto.goodType,
            category: dto.category,
            marketPriceTypeId: dto.marketPriceTypeId,
            marketPriceCategoryId: dto.marketPriceCategoryId,
            industrialId: dto.industrialId,
            image,
            supplier: dto.supplier,
            supplierId: dto.supplierId,
            supplierItem: dto.supplierItem,
            recipeUnit: dto.recipeUnit,
            purchaseUnitConversion: dto.purchaseUnitConversion,
            pricePerUnit: dto.pricePerUnit,
            packedUnits: dto.packedUnits,
            numberOfUnits: dto.numberOfUnits,
            unitsPerPurchase: dto.unitsPerPurchase,
            packingWidth: dto.packingWidth,
            packingHeight: dto.packingHeight,
            packingLength: dto.packingLength,
            purchasePackaging: dto.purchasePackaging,
            inventoryPackaging: dto.inventoryPackaging,
          },
        });
        await this.syncRecipeRecordForGoodType(price, dto.goodType, tenantId);
        results.push(this.serialize(price));
      }
      this.logger.log(`Bulk created ${results.length} market prices`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to bulk create: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * `goodType` is free text (any MarketPriceType name a tenant creates, e.g. "Alcools",
   * "Viande", "Test") — 'Packaging' is the only reserved value. Everything else is a
   * recipe ingredient candidate, so this must not require the literal "Food"/"Beverage"
   * strings or a custom good type never gets an Ingredient row and stays invisible in
   * the Menu Item ingredient picker (cf. findAllWithIngredients).
   */
  private async syncRecipeRecordForGoodType(marketPrice: any, goodType: string | undefined, tenantId: string) {
    if (!goodType) return;
    if (goodType === 'Packaging') {
      await this.ensurePackagingForMarketPrice(marketPrice, tenantId);
    } else {
      await this.ensureIngredientForMarketPrice(marketPrice, tenantId);
    }
  }

  /**
   * Formule unique de dérivation du coût recette à partir d'un MarketPrice, réutilisée à la
   * création ET à la resynchronisation. `purchaseUnitConversion` = "combien d'unités d'achat
   * (ex: kg) faut-il pour faire une unité recette (ex: Pc)" (cf. tooltip MarketPriceEditDrawer
   * "Combien de {unit} faut-il pour faire un {recipeUnit} ?") — donc le coût par unité recette
   * est une MULTIPLICATION (prix/unité d'achat × unités d'achat par unité recette), jamais une
   * division. Ex: 11.64 €/kg × 0.02 kg/pièce = 0.23 €/pièce.
   */
  private computeRecipeCosts(marketPrice: any) {
    const price = Number(marketPrice.price) || undefined;
    const purchaseUnitConversion =
      marketPrice.purchaseUnitConversion && Number(marketPrice.purchaseUnitConversion) > 0
        ? Number(marketPrice.purchaseUnitConversion)
        : undefined;
    const pricePerPurchaseUnit = marketPrice.pricePerUnit ? Number(marketPrice.pricePerUnit) : price;
    const costPerRecipeUnit = pricePerPurchaseUnit != null
      ? Math.round(pricePerPurchaseUnit * (purchaseUnitConversion ?? 1) * 10000) / 10000
      : undefined;
    return {
      costPerPurchaseUnit: price,
      costPerRecipeUnit,
      purchaseUnitsPerRecipeUnit: purchaseUnitConversion,
    };
  }

  /**
   * Resynchronise costPerRecipeUnit/costPerPurchaseUnit sur l'Ingredient/Packaging déjà
   * lié à ce MarketPrice. Sans ça, ces champs restent figés à leur valeur de création
   * (cf. ensureIngredientForMarketPrice) alors que menu-items/menu-components/space-menus
   * les lisent comme source de vérité du coût recette — modifier le prix d'un fournisseur
   * ne se répercutait donc jamais sur les menu items qui l'utilisent. Appelé sur CHAQUE
   * update de MarketPrice (pas seulement un changement de prix) pour rester infaillible
   * même si d'autres champs dérivés du coût sont ajoutés plus tard.
   */
  private async resyncLinkedRecipeCosts(marketPrice: any, tenantId: string) {
    const costs = {
      ...this.computeRecipeCosts(marketPrice),
      recipeUnit: marketPrice.recipeUnit || marketPrice.unit || undefined,
      purchaseUnit: marketPrice.unit || undefined,
    };
    try {
      await Promise.all([
        this.prisma.ingredient.updateMany({
          where: { marketPriceId: marketPrice.id, tenantId, deletedAt: null },
          data: costs,
        }),
        this.prisma.packaging.updateMany({
          where: { marketPriceId: marketPrice.id, tenantId, deletedAt: null },
          data: costs,
        }),
      ]);
    } catch (error) {
      this.logger.warn(`Failed to resync recipe costs for market price ${marketPrice.id}: ${error.message}`);
    }
  }

  /**
   * Ensures a corresponding Ingredient exists for a given MarketPrice.
   * Creates one if missing, linking it via marketPriceId.
   */
  private async ensureIngredientForMarketPrice(marketPrice: any, tenantId: string) {
    try {
      const existing = await this.prisma.ingredient.findFirst({
        where: { marketPriceId: marketPrice.id, tenantId, deletedAt: null },
      });
      if (existing) {
        this.logger.log(`Ingredient already exists for market price ${marketPrice.id}: ${existing.id}`);
        return existing;
      }

      const ingredient = await this.prisma.ingredient.create({
        data: {
          tenantId,
          name: marketPrice.itemName,
          recipeUnit: marketPrice.recipeUnit || marketPrice.unit,
          purchaseUnit: marketPrice.unit,
          supplier: marketPrice.supplier || undefined,
          marketPriceId: marketPrice.id,
          ...this.computeRecipeCosts(marketPrice),
          active: true,
        },
      });
      this.logger.log(`Auto-created ingredient ${ingredient.id} for market price ${marketPrice.id}`);
      return ingredient;
    } catch (error) {
      // Non-blocking: log the error but don't fail the market price creation
      this.logger.warn(`Failed to auto-create ingredient for market price ${marketPrice.id}: ${error.message}`);
      return null;
    }
  }

  /**
   * Ensures a corresponding Packaging exists for a given MarketPrice with goodType=Packaging.
   * Creates one if missing, linking it via marketPriceId.
   */
  private async ensurePackagingForMarketPrice(marketPrice: any, tenantId: string) {
    try {
      const existing = await this.prisma.packaging.findFirst({
        where: { marketPriceId: marketPrice.id, tenantId, deletedAt: null },
      });
      if (existing) {
        this.logger.log(`Packaging already exists for market price ${marketPrice.id}: ${existing.id}`);
        return existing;
      }

      const packaging = await this.prisma.packaging.create({
        data: {
          tenantId,
          name: marketPrice.itemName,
          recipeUnit: marketPrice.recipeUnit || marketPrice.unit,
          purchaseUnit: marketPrice.unit,
          supplier: marketPrice.supplier || undefined,
          marketPriceId: marketPrice.id,
          ...this.computeRecipeCosts(marketPrice),
          ingredientCategory: marketPrice.category || undefined,
          active: true,
        },
      });
      this.logger.log(`Auto-created packaging ${packaging.id} for market price ${marketPrice.id}`);
      return packaging;
    } catch (error) {
      // Non-blocking: log the error but don't fail the market price creation
      this.logger.warn(`Failed to auto-create packaging for market price ${marketPrice.id}: ${error.message}`);
      return null;
    }
  }

  /**
   * Sync: create missing Ingredients for all non-Packaging MarketPrices that don't have one.
   * `goodType` is free text (any MarketPriceType name) — 'Packaging' is the only reserved
   * value, cf. syncRecipeRecordForGoodType.
   */
  async syncIngredients(tenantId: string) {
    this.logger.log(`Syncing ingredients for market prices of tenant ${tenantId}`);

    const marketPrices = await this.prisma.marketPrice.findMany({
      where: {
        tenantId,
        goodType: { not: 'Packaging' },
      },
      include: { ingredients: { where: { deletedAt: null }, select: { id: true } } },
    });

    let created = 0;
    let skipped = 0;

    for (const mp of marketPrices) {
      if (mp.ingredients && mp.ingredients.length > 0) {
        skipped++;
        continue;
      }
      const result = await this.ensureIngredientForMarketPrice(mp, tenantId);
      if (result) created++;
      else skipped++;
    }

    this.logger.log(`Sync complete: ${created} ingredients created, ${skipped} skipped (already exist or failed)`);
    return { created, skipped, total: marketPrices.length };
  }

  /**
   * Sync: create missing Packagings for all MarketPrices (Packaging) that don't have one.
   */
  async syncPackagings(tenantId: string) {
    this.logger.log(`Syncing packagings for market prices of tenant ${tenantId}`);

    const marketPrices = await this.prisma.marketPrice.findMany({
      where: { tenantId, goodType: 'Packaging' },
      include: { packagings: { where: { deletedAt: null }, select: { id: true } } },
    });

    let created = 0;
    let skipped = 0;

    for (const mp of marketPrices) {
      if (mp.packagings && mp.packagings.length > 0) {
        skipped++;
        continue;
      }
      const result = await this.ensurePackagingForMarketPrice(mp, tenantId);
      if (result) created++;
      else skipped++;
    }

    this.logger.log(`Sync complete: ${created} packagings created, ${skipped} skipped`);
    return { created, skipped, total: marketPrices.length };
  }

  async deduplicate(tenantId: string) {
    this.logger.log(`Deduplicating market prices for tenant ${tenantId}`);
    try {
      const allPrices = await this.prisma.marketPrice.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });

      const seen = new Map<string, string>();
      const toDelete: string[] = [];

      for (const price of allPrices) {
        const key = `${price.itemName}::${price.supplierId || price.supplier || ''}`;
        if (seen.has(key)) {
          toDelete.push(price.id);
        } else {
          seen.set(key, price.id);
        }
      }

      if (toDelete.length > 0) {
        await this.prisma.marketPrice.deleteMany({
          where: { id: { in: toDelete } },
        });
      }

      this.logger.log(`Deduplicated: removed ${toDelete.length} duplicates`);
      return { removed: toDelete.length, remaining: allPrices.length - toDelete.length };
    } catch (error) {
      this.logger.error(`Failed to deduplicate: ${error.message}`, error.stack);
      throw error;
    }
  }
}
