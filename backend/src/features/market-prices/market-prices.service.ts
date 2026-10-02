import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateMarketPriceDto } from './dto/create-market-price.dto';
import { UpdateMarketPriceDto } from './dto/update-market-price.dto';
import { SupabaseStorageService } from '../../core/supabase/supabase-storage.service';
import { MarketPriceQueryService } from './services/market-price-query.service';
import { MarketPriceRecipeSyncService } from './services/market-price-recipe-sync.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * Prix du marché : création unitaire ou en masse, modification, suppression, dédoublonnage.
 */
@Injectable()
export class MarketPricesService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private readonly marketPriceQueryService: MarketPriceQueryService,
    private readonly marketPriceRecipeSyncService: MarketPriceRecipeSyncService,
  ) {}

  private readonly logger = new Logger(MarketPricesService.name);

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
          storageType: dto.storageType,
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

      await this.marketPriceRecipeSyncService.syncRecipeRecordForGoodType(price, dto.goodType, tenantId);

      return this.marketPriceQueryService.serialize(price);
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

  /**
   * Construit l'objet `data` Prisma d'un update partiel de MarketPrice à partir des champs
   * réellement fournis par le DTO (`!== undefined`) — partagé entre `update()` (édition manuelle)
   * et `bulkCreate()` (upsert par id depuis l'import CSV format packé) pour ne pas dupliquer la
   * liste des ~20 champs mappables.
   */
  private async buildMarketPriceUpdateData(dto: UpdateMarketPriceDto | CreateMarketPriceDto) {
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
    if (dto.storageType !== undefined) updateData.storageType = dto.storageType;
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
    return updateData;
  }

  async update(id: string, dto: UpdateMarketPriceDto, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Updating market price ${id} for tenant ${tenantId}`);
    await this.marketPriceQueryService.findOne(id, tenantId, user);

    const updateData = await this.buildMarketPriceUpdateData(dto);

    try {
      const price = await this.prisma.marketPrice.update({
        where: { id },
        data: updateData,
        include: { supplierRel: true },
      });
      this.logger.log(`Market price ${id} updated`);

      if (dto.goodType !== undefined) {
        await this.marketPriceRecipeSyncService.syncRecipeRecordForGoodType(price, dto.goodType, tenantId);
      }
      await this.marketPriceRecipeSyncService.resyncLinkedRecipeCosts(price, tenantId);

      return this.marketPriceQueryService.serialize(price);
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

  async remove(id: string, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Deleting market price ${id} for tenant ${tenantId}`);
    await this.marketPriceQueryService.findOne(id, tenantId, user);

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

  async removeByItemName(itemName: string, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Deleting all market prices with itemName "${itemName}" for tenant ${tenantId}`);
    try {
      // Un utilisateur restreint ne supprime que les lignes de ses espaces accessibles
      // (+ celles sans fournisseur/fournisseur sans site déclaré) — jamais celles d'un
      // fournisseur desservant un espace auquel il n'a pas droit.
      const where: any = { itemName, tenantId, ...(await this.marketPriceQueryService.spaceScopeFilter(user)) };
      const result = await this.prisma.marketPrice.deleteMany({ where });
      this.logger.log(`Deleted ${result.count} market prices for itemName "${itemName}"`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete by itemName: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Traite chaque ligne indépendamment (pas de transaction Prisma globale) : une ligne en
   * échec ne doit ni bloquer ni faire disparaître les lignes précédentes déjà committées.
   * Retourne un décompte précis (créées/ignorées/en erreur, avec l'index de chaque erreur)
   * pour que l'appelant (import CSV) sache exactement ce qui s'est passé, au lieu de marquer
   * tout le lot en échec dès qu'une seule ligne casse.
   */
  async bulkCreate(items: CreateMarketPriceDto[], tenantId: string) {
    this.logger.log(`Bulk creating ${items.length} market prices for tenant ${tenantId}`);
    const result = {
      created: [] as any[],
      updated: [] as any[],
      skipped: 0,
      errors: [] as Array<{ index: number; itemName?: string; message: string }>,
    };

    for (let index = 0; index < items.length; index++) {
      const dto = items[index];
      try {
        // Import format « packé » (1 ligne = 1 Item, prix fournisseurs empilés avec leur propre
        // Market Price ID) : si le CSV fournit un id ET qu'il correspond à un MarketPrice existant
        // de CE tenant, on met à jour cette ligne au lieu de la recréer/dédoublonner — permet le
        // cycle export (avec ids réels) → édition externe → réimport. Un id présent mais inconnu
        // (cas du tout premier import d'un fichier legacy dont les ids viennent d'un autre système)
        // tombe silencieusement dans le flux de création normal ci-dessous : Prisma générera un
        // nouveau cuid, l'id fourni est simplement ignoré.
        if (dto.id) {
          const existingById = await this.prisma.marketPrice.findFirst({
            where: { id: dto.id, tenantId },
          });
          if (existingById) {
            const updateData = await this.buildMarketPriceUpdateData(dto);
            const updated = await this.prisma.marketPrice.update({
              where: { id: existingById.id },
              data: updateData,
            });
            await this.marketPriceRecipeSyncService.resyncLinkedRecipeCosts(updated, tenantId);
            result.updated.push(this.marketPriceQueryService.serialize(updated));
            continue;
          }
        }

        // Dédoublonnage exact à l'insertion : évite de recréer une ligne identique à chaque
        // réimport du même CSV (cf. BUG connu : aucune contrainte @@unique en base sur
        // MarketPrice). `deduplicate()` (méthode séparée ci-dessous, corrigée par BUG-24)
        // compare désormais les mêmes champs identitaires (nom/fournisseur/prix/unit/quantité) ;
        // on inclut ici aussi unit/price pour ne jamais fusionner deux prix réellement différents
        // pour le même article/fournisseur.
        //
        // Le rapprochement fournisseur ne peut PAS reposer sur `supplierId` seul : les lignes
        // créées manuellement (MarketPriceCreateDrawer) n'enregistrent jamais de `supplier`
        // texte (constaté en base : `supplier` vaut `""`, pas le nom), et les lignes créées par
        // d'anciens imports CSV (avant résolution de supplierId) ont `supplierId = null`.
        // Comparer `supplierId` exact aurait donc raté un vrai doublon dès que sa résolution
        // diffère d'une exécution à l'autre — et dépendre uniquement de la résolution
        // supplierId/nom fournisseur reste fragile si cette résolution échoue pour une raison
        // quelconque côté frontend (liste des fournisseurs pas encore chargée, etc). `supplierItem`
        // (référence article chez CE fournisseur, ex. "PAPRIKA DOUX 1KG") est un signal
        // d'identité au moins aussi fort, toujours envoyé tel quel par l'import CSV et
        // indépendant de toute résolution de FK — on l'ajoute comme troisième alternative.
        const supplierNameTrimmed = (dto.supplier || '').trim();
        const supplierItemTrimmed = (dto.supplierItem || '').trim();
        const supplierMatchOr: any[] = [];
        if (supplierNameTrimmed) {
          supplierMatchOr.push({ supplier: { equals: supplierNameTrimmed, mode: 'insensitive' } });
        }
        if (dto.supplierId) {
          supplierMatchOr.push({ supplierId: dto.supplierId });
        }
        if (supplierItemTrimmed) {
          supplierMatchOr.push({ supplierItem: { equals: supplierItemTrimmed, mode: 'insensitive' } });
        }
        if (supplierMatchOr.length === 0) {
          supplierMatchOr.push({ supplierId: null, supplier: null });
        }

        // `price` est un champ Prisma `Decimal` : le comparer à un `number` JS brut dans un
        // `where` échoue silencieusement pour la plupart des valeurs à décimales (constaté :
        // `price: 9.8` ne matche JAMAIS la ligne existante stockée en Decimal "9.80", alors que
        // `price: "9.8"` (string) ou `price: new Prisma.Decimal(9.8)` matchent correctement —
        // sans ce cast, TOUTE la vérification de doublon ci-dessous est un no-op silencieux dès
        // que le prix a une partie décimale non trivialement représentable en binaire (9.8, 8.54,
        // 9.3…). Toujours convertir en string avant de comparer un Decimal.
        const existing = await this.prisma.marketPrice.findFirst({
          where: {
            tenantId,
            itemName: { equals: dto.itemName, mode: 'insensitive' },
            unit: { equals: dto.unit, mode: 'insensitive' },
            price: String(dto.price),
            OR: supplierMatchOr,
          },
        });
        if (existing) {
          result.skipped++;
          continue;
        }

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
            storageType: dto.storageType,
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
        await this.marketPriceRecipeSyncService.syncRecipeRecordForGoodType(price, dto.goodType, tenantId);
        result.created.push(this.marketPriceQueryService.serialize(price));
      } catch (error) {
        this.logger.warn(
          `Bulk import: item ${index} ("${dto?.itemName}") failed: ${error.message}`,
        );
        result.errors.push({ index, itemName: dto?.itemName, message: error.message || 'Unknown error' });
      }
    }

    this.logger.log(
      `Bulk create complete: ${result.created.length} created, ${result.updated.length} updated, ` +
      `${result.skipped} skipped (duplicates), ${result.errors.length} errors`,
    );
    return result;
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

      // BUG-24 : la clé ne comparait que itemName + fournisseur, donc deux lignes légitimement
      // différentes (même produit/fournisseur mais prix différent, ou conditionnement différent)
      // pouvaient être fusionnées à tort. On resserre la clé pour inclure aussi price/unit/quantity
      // (unitsPerPurchase), comme le faisait une version antérieure du produit — deux lignes ne
      // sont désormais des doublons QUE si TOUS ces champs sont identiques.
      // `price` est un champ Prisma `Decimal` (voir BUG-57 : comparer un Decimal à un `number` JS
      // brut échoue silencieusement dans un `where` Prisma). Ici il ne s'agit pas d'un `where`
      // Prisma mais d'une clé de Map côté JS ; on convertit explicitement via `.toString()`
      // (plutôt que de compter sur la coercition implicite d'un template literal) pour rester
      // cohérent avec le pattern établi par ce fix et garantir une représentation stable.
      for (const price of allPrices) {
        const key = [
          price.itemName,
          price.supplierId || price.supplier || '',
          price.price.toString(),
          price.unit,
          price.unitsPerPurchase ?? '',
        ].join('::');
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
