import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * Synchronisation des ingrédients et emballages issus des prix du marché, et recalcul des coûts de recette liés.
 */
@Injectable()
export class MarketPriceRecipeSyncService {
  constructor(
    private prisma: PrismaService,
  ) {}

  private readonly logger = new Logger(MarketPriceRecipeSyncService.name);

  /**
   * `goodType` is free text (any MarketPriceType name a tenant creates, e.g. "Alcools",
   * "Viande", "Test") — 'Packaging' is the only reserved value. Everything else is a
   * recipe ingredient candidate, so this must not require the literal "Food"/"Beverage"
   * strings or a custom good type never gets an Ingredient row and stays invisible in
   * the Menu Item ingredient picker (cf. findAllWithIngredients).
   */
  async syncRecipeRecordForGoodType(marketPrice: any, goodType: string | undefined, tenantId: string) {
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
    // Un prix à 0 est une vraie valeur (produit offert) — seul null/NaN devient undefined.
    const rawPrice = marketPrice.price == null ? NaN : Number(marketPrice.price);
    const price = Number.isFinite(rawPrice) ? rawPrice : undefined;
    const purchaseUnitConversion =
      marketPrice.purchaseUnitConversion && Number(marketPrice.purchaseUnitConversion) > 0
        ? Number(marketPrice.purchaseUnitConversion)
        : undefined;
    const pricePerPurchaseUnit = marketPrice.pricePerUnit != null ? Number(marketPrice.pricePerUnit) : price;
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
   * Resynchronise name/costPerRecipeUnit/costPerPurchaseUnit sur l'Ingredient/Packaging
   * déjà lié à ce MarketPrice. Sans ça, ces champs restent figés à leur valeur de création
   * (cf. ensureIngredientForMarketPrice) alors que menu-items/menu-components/space-menus
   * les lisent comme source de vérité (coût recette, mais aussi le nom affiché côté
   * Logistic — cf. itemRefsForMenuItem dans logistics.service.ts) — modifier un market
   * price existant ne se répercutait donc jamais sur les menu items/le stock qui
   * l'utilisent. Appelé sur CHAQUE update de MarketPrice (pas seulement un changement de
   * prix/nom) pour rester infaillible même si d'autres champs dérivés sont ajoutés plus
   * tard, même motif que storage-types.service.ts (BUG-84) — sauf qu'ici le lien est une
   * vraie FK (marketPriceId), pas un match par ancien nom en texte libre.
   */
  async resyncLinkedRecipeCosts(marketPrice: any, tenantId: string) {
    const costs = {
      name: marketPrice.itemName,
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
      // eslint-disable-next-line no-await-in-loop -- synchronisation manuelle, un ingrédient ou emballage créé à la fois
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
      // eslint-disable-next-line no-await-in-loop -- synchronisation manuelle, un ingrédient ou emballage créé à la fois
      const result = await this.ensurePackagingForMarketPrice(mp, tenantId);
      if (result) created++;
      else skipped++;
    }

    this.logger.log(`Sync complete: ${created} packagings created, ${skipped} skipped`);
    return { created, skipped, total: marketPrices.length };
  }
}
