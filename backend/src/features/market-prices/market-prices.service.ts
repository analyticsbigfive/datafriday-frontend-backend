import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateMarketPriceDto } from './dto/create-market-price.dto';
import { UpdateMarketPriceDto } from './dto/update-market-price.dto';
import { SupabaseStorageService } from '../../core/supabase/supabase-storage.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

@Injectable()
export class MarketPricesService {
  private readonly logger = new Logger(MarketPricesService.name);

  constructor(private prisma: PrismaService, private storage: SupabaseStorageService, private spaceAccess: SpaceAccessService) {}

  /**
   * Lève 403 si `user` n'a accès à aucun des espaces desservis par le fournisseur du prix
   * (`Supplier.sites`). Un prix sans fournisseur lié, ou dont le fournisseur ne déclare aucun
   * site (portée tenant), reste visible/modifiable par quiconque a la permission fonctionnelle.
   */
  private async assertSpaceAccess(sites: string[] | undefined | null, user?: SpaceScopedUser) {
    if (!user || !sites?.length) return;
    if (this.spaceAccess.hasFullAccess(user)) return;
    const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
    if (accessible === 'ALL') return;
    if (sites.some((sid) => accessible.includes(sid))) return;
    throw new ForbiddenException("Vous n'avez pas accès à l'espace du fournisseur de ce prix.");
  }

  /** Filtre Prisma à ajouter au `where` d'une liste : restreint aux prix dont le fournisseur
   * dessert un espace accessible (ou n'a pas de fournisseur / fournisseur sans site déclaré). */
  private async spaceScopeFilter(user?: SpaceScopedUser): Promise<any> {
    if (!user || this.spaceAccess.hasFullAccess(user)) return {};
    const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
    if (accessible === 'ALL') return {};
    return {
      OR: [
        { supplierId: null },
        { supplierRel: { sites: { isEmpty: true } } },
        { supplierRel: { sites: { hasSome: accessible } } },
      ],
    };
  }

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

  async findAll(tenantId: string, page = 1, limit = 200, user?: SpaceScopedUser) {
    this.logger.log(`Fetching market prices for tenant ${tenantId} (page=${page}, limit=${limit})`);
    try {
      const skip = (page - 1) * limit;
      const where: any = { tenantId, ...(await this.spaceScopeFilter(user)) };
      const [prices, total] = await Promise.all([
        this.prisma.marketPrice.findMany({
          where,
          orderBy: { itemName: 'asc' },
          include: { supplierRel: true },
          skip,
          take: limit,
        }),
        this.prisma.marketPrice.count({ where }),
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
    user?: SpaceScopedUser,
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
      const andClauses: any[] = [];
      const scopeFilter = await this.spaceScopeFilter(user);
      if (Object.keys(scopeFilter).length) andClauses.push(scopeFilter);

      // Search filter
      if (search && search.trim()) {
        andClauses.push({
          OR: [
            { itemName: { contains: search.trim(), mode: 'insensitive' } },
            { category: { contains: search.trim(), mode: 'insensitive' } },
            { supplier: { contains: search.trim(), mode: 'insensitive' } },
          ],
        });
      }

      // Category filter
      if (category && category.trim()) {
        where.category = { contains: category.trim(), mode: 'insensitive' };
      }

      // GoodType filter
      if (goodType) {
        where.goodType = goodType;
      }

      if (andClauses.length) where.AND = andClauses;

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
    user?: SpaceScopedUser,
  ) {
    const { page = 1, limit = 100, search, category } = options;
    this.logger.log(
      `Fetching market prices with packagings for tenant ${tenantId} ` +
      `(page=${page}, limit=${limit}, search="${search}", category="${category}")`,
    );

    try {
      const skip = (page - 1) * limit;

      const where: any = { tenantId, goodType: 'Packaging' };
      const andClauses: any[] = [];
      const scopeFilter = await this.spaceScopeFilter(user);
      if (Object.keys(scopeFilter).length) andClauses.push(scopeFilter);

      if (search && search.trim()) {
        andClauses.push({
          OR: [
            { itemName: { contains: search.trim(), mode: 'insensitive' } },
            { category: { contains: search.trim(), mode: 'insensitive' } },
            { supplier: { contains: search.trim(), mode: 'insensitive' } },
          ],
        });
      }

      if (category && category.trim()) {
        where.category = { contains: category.trim(), mode: 'insensitive' };
      }

      if (andClauses.length) where.AND = andClauses;

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

  async findOne(id: string, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Fetching market price ${id} for tenant ${tenantId}`);
    const price = await this.prisma.marketPrice.findFirst({
      where: { id, tenantId },
      include: { supplierRel: true },
    });

    if (!price) {
      this.logger.warn(`Market price ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Market price with ID ${id} not found`);
    }
    await this.assertSpaceAccess(price.supplierRel?.sites, user);

    return this.serialize(price);
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
    await this.findOne(id, tenantId, user);

    const updateData = await this.buildMarketPriceUpdateData(dto);

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

  async remove(id: string, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Deleting market price ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId, user);

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
      const where: any = { itemName, tenantId, ...(await this.spaceScopeFilter(user)) };
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
            await this.resyncLinkedRecipeCosts(updated, tenantId);
            result.updated.push(this.serialize(updated));
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
        result.created.push(this.serialize(price));
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
