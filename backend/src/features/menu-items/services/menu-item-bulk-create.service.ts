import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../core/database/prisma.service';
import { CreateMenuItemDto } from '../dto/create-menu-item.dto';
import { SupabaseStorageService } from '../../../core/supabase/supabase-storage.service';
import { MenuItemSupportService } from './menu-item-support.service';
import { resolveKitchenFields } from '../../../shared/utils/resolve-kitchen';

// Mapping des valeurs diet frontend → enum Diet Prisma
function mapDiet(diet: string[]): string[] {
  if (!diet?.length) return [];
  const map: Record<string, string> = {
    Vegan: 'Vegan',
    vegan: 'Vegan',
    'Végétarien': 'Vegetarian',
    Vegetarian: 'Vegetarian',
    vegetarian: 'Vegetarian',
    'Sans gluten': 'GlutenFree',
    GlutenFree: 'GlutenFree',
    glutenfree: 'GlutenFree',
    Halal: 'Halal',
    halal: 'Halal',
    Casher: 'Kosher',
    Kosher: 'Kosher',
    kosher: 'Kosher',
  };
  return diet.map(d => map[d] ?? null).filter(Boolean);
}

/**
 * Création d'articles en masse (import).
 */
@Injectable()
export class MenuItemBulkCreateService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
    private readonly menuItemSupportService: MenuItemSupportService,
  ) {}

  private readonly logger = new Logger(MenuItemBulkCreateService.name);

  async bulkCreate(dtos: CreateMenuItemDto[], tenantId: string) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      return { count: 0, items: [], duplicatesCount: 0, duplicates: [] };
    }

    this.logger.log(`Bulk creating ${dtos.length} menu items for tenant ${tenantId}`);
    try {
      // BUG-006 (partie dédup forward) / même famille que BUG-052 (create()::dedupeByName,
      // ligne 271) : bulkCreate n'avait aucun garde-fou par nom — chaque essai/retry de mapping
      // en masse recréait un MenuItem même si un item du même nom existait déjà pour ce tenant,
      // d'où les doublons accumulés (cf. fiche BUG-006). On recherche les noms déjà présents pour
      // ce tenant (trim + insensible à la casse, même pattern que create()) et on réutilise
      // l'existant au lieu d'insérer un doublon ; le même contrôle s'applique aux doublons internes
      // au payload lui-même (deux lignes du même import portant le même nom).
      const existingByName = new Map(
        (
          await this.prisma.menuItem.findMany({
            where: { tenantId, deletedAt: null },
            select: { id: true, name: true, typeId: true, categoryId: true, basePrice: true },
          })
        ).map((m) => [m.name.trim().toLowerCase(), m]),
      );

      type Duplicate = { index: number; name: string; reusedItemId: string; reason: 'existing_tenant_item' | 'duplicate_in_batch' };
      const duplicates: Duplicate[] = [];
      const batchNameToId = new Map<string, string>();
      // Résultat positionnel : une entrée par dto en entrée, dans le même ordre — pour ne pas
      // casser un appelant qui apparie la réponse à sa requête par index (contrat non-breaking).
      const resultByIndex: any[] = new Array(dtos.length).fill(null);
      const toInsert: { dto: CreateMenuItemDto; index: number; id: string }[] = [];

      dtos.forEach((dto, index) => {
        const key = dto.name?.trim().toLowerCase();
        const existing = key ? existingByName.get(key) : undefined;
        if (existing) {
          duplicates.push({ index, name: dto.name, reusedItemId: existing.id, reason: 'existing_tenant_item' });
          resultByIndex[index] = {
            id: existing.id,
            name: existing.name,
            typeId: existing.typeId,
            categoryId: existing.categoryId,
            basePrice: existing.basePrice,
            tenantId,
            spaceIds: [],
            duplicate: true,
          };
          return;
        }
        const batchId = key ? batchNameToId.get(key) : undefined;
        if (batchId) {
          duplicates.push({ index, name: dto.name, reusedItemId: batchId, reason: 'duplicate_in_batch' });
          const original = resultByIndex.find((r) => r?.id === batchId);
          resultByIndex[index] = original ? { ...original, duplicate: true } : { id: batchId, name: dto.name, duplicate: true };
          return;
        }
        const id = randomUUID();
        if (key) batchNameToId.set(key, id);
        toInsert.push({ dto, index, id });
      });

      const insertedItems = await Promise.all(toInsert.map(async ({ dto, id }) => ({
        id,
        tenantId,
        name: dto.name,
        typeId: dto.typeId || null,
        categoryId: dto.categoryId || null,
        brandId: dto.brandId || null,
        displayNameId: dto.displayNameId || null,
        seasonId: dto.seasonId || null,
        isCombo: dto.isCombo ?? false,
        basePrice: dto.basePrice,
        vatRate: dto.vatRate ?? null,
        discountType: dto.discountType ?? null,
        discountValue: dto.discountValue ?? null,
        totalCost: dto.totalCost,
        margin: dto.margin,
        description: dto.description,
        picture: await this.storage.resolveImage(dto.picture, 'menu-items'),
        allergens: dto.allergens || [],
        diet: mapDiet(dto.diet || []) as any[],
        storageType: dto.storageType || [],
        readyForSale: dto.readyForSale,
        kitchenType: null,
        ...(await resolveKitchenFields(this.prisma, dto, tenantId)),
        comboItem: dto.comboItem,
        numberOfPiecesRecipe: dto.numberOfPiecesRecipe,
        componentsData: dto.componentsData,
        inventoryPackagingType: (dto as any).inventoryPackagingType ?? null,
        inventoryNumberOfUnits: (dto as any).inventoryNumberOfUnits ?? null,
        inventoryUnit: (dto as any).inventoryUnit ?? null,
      })));

      if (insertedItems.length) {
        await this.prisma.menuItem.createMany({
          data: insertedItems as any[],
        });
      }

      toInsert.forEach(({ index }, i) => {
        const item = insertedItems[i];
        resultByIndex[index] = {
          id: item.id,
          name: item.name,
          typeId: item.typeId,
          categoryId: item.categoryId,
          basePrice: item.basePrice,
          tenantId: item.tenantId,
          spaceIds: [],
        };
      });

      await this.menuItemSupportService.listCache.invalidate(tenantId);
      if (duplicates.length) {
        this.logger.log(
          `bulkCreate: skipped ${duplicates.length} duplicate name(s) out of ${dtos.length} for tenant ${tenantId} (reused existing item instead of inserting)`,
        );
      }
      return {
        count: insertedItems.length,
        items: resultByIndex,
        duplicatesCount: duplicates.length,
        duplicates,
      };
    } catch (error) {
      this.logger.error(`Failed to bulk create menu items: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        const fieldName = error.meta?.field_name || 'unknown field';
        throw new BadRequestException(`Invalid ID provided. Foreign key constraint failed on: ${fieldName}.`);
      }
      throw error;
    }
  }
}
