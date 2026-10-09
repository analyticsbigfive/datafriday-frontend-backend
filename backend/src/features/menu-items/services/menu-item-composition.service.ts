import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { CreateMenuItemDto } from '../dto/create-menu-item.dto';
import { MenuItemCostService } from './menu-item-cost.service';
import { MenuItemSupportService } from './menu-item-support.service';
import { MenuItemQueryService } from './menu-item-query.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * Remplacement de la composition d'un article (composants, ingrédients, emballages, combos).
 */
@Injectable()
export class MenuItemCompositionService {
  constructor(
    private prisma: PrismaService,
    private readonly menuItemCostService: MenuItemCostService,
    private readonly menuItemQueryService: MenuItemQueryService,
    private readonly menuItemSupportService: MenuItemSupportService,
  ) {}

  private readonly logger = new Logger(MenuItemCompositionService.name);

  async replaceComponents(menuItemId: string, components: CreateMenuItemDto['components'], tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Replacing components for menu item ${menuItemId} (tenant ${tenantId})`);
    await this.menuItemQueryService.findOne(menuItemId, tenantId, user);
    const lines = Array.isArray(components) ? components : [];

    try {
      await this.prisma.menuItem.update({
        where: { id: menuItemId },
        data: {
          components: {
            deleteMany: {},
            create: lines.map((l: any) => ({
              componentId: l.componentId,
              numberOfUnits: this.menuItemSupportService.toNumber(l.numberOfUnits),
            })),
          },
        },
      });

      await this.menuItemCostService.refreshCosts(tenantId, { itemIds: [menuItemId] });
      await this.menuItemSupportService.listCache.invalidate(tenantId);
      return this.menuItemQueryService.findOne(menuItemId, tenantId);
    } catch (error) {
      this.logger.error(`Failed to replace components for menu item ${menuItemId}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid componentId in the provided list`);
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(this.menuItemSupportService.describeMenuItemUniqueConstraintError(error));
      }
      throw error;
    }
  }

  async replaceIngredients(menuItemId: string, ingredients: CreateMenuItemDto['ingredients'], tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Replacing ingredients for menu item ${menuItemId} (tenant ${tenantId})`);
    await this.menuItemQueryService.findOne(menuItemId, tenantId, user);
    const lines = Array.isArray(ingredients) ? ingredients : [];

    try {
      await this.prisma.menuItem.update({
        where: { id: menuItemId },
        data: {
          ingredients: {
            deleteMany: {},
            create: lines.map((l: any) => ({
              ingredientId: l.ingredientId,
              numberOfUnits: this.menuItemSupportService.toNumber(l.numberOfUnits),
            })),
          },
        },
      });

      await this.menuItemCostService.refreshCosts(tenantId, { itemIds: [menuItemId] });
      await this.menuItemSupportService.listCache.invalidate(tenantId);
      return this.menuItemQueryService.findOne(menuItemId, tenantId);
    } catch (error) {
      this.logger.error(`Failed to replace ingredients for menu item ${menuItemId}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid ingredientId in the provided list`);
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(this.menuItemSupportService.describeMenuItemUniqueConstraintError(error));
      }
      throw error;
    }
  }

  async replacePackagings(menuItemId: string, packagings: CreateMenuItemDto['packagings'], tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Replacing packagings for menu item ${menuItemId} (tenant ${tenantId})`);
    await this.menuItemQueryService.findOne(menuItemId, tenantId, user);
    const lines = Array.isArray(packagings) ? packagings : [];

    try {
      await this.prisma.menuItem.update({
        where: { id: menuItemId },
        data: {
          packagings: {
            deleteMany: {},
            create: lines.map((l: any) => ({
              packagingId: l.packagingId,
              numberOfUnits: this.menuItemSupportService.toNumber(l.numberOfUnits),
            })),
          },
        },
      });

      await this.menuItemCostService.refreshCosts(tenantId, { itemIds: [menuItemId] });
      await this.menuItemSupportService.listCache.invalidate(tenantId);
      return this.menuItemQueryService.findOne(menuItemId, tenantId);
    } catch (error) {
      this.logger.error(`Failed to replace packagings for menu item ${menuItemId}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid packagingId in the provided list`);
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(this.menuItemSupportService.describeMenuItemUniqueConstraintError(error));
      }
      throw error;
    }
  }

  async replaceComboItems(menuItemId: string, comboItems: CreateMenuItemDto['comboItems'], tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Replacing combo items for menu item ${menuItemId} (tenant ${tenantId})`);
    await this.menuItemQueryService.findOne(menuItemId, tenantId, user);
    const lines = Array.isArray(comboItems) ? comboItems : [];

    try {
      await this.prisma.menuItem.update({
        where: { id: menuItemId },
        data: {
          comboChildren: {
            deleteMany: {},
            create: lines.map((l: any) => ({
              childId: l.childId,
              quantity: this.menuItemSupportService.toNumber(l.quantity),
              unit: l.unit,
              cost: l.cost != null ? Number(l.cost) : undefined,
            })),
          },
        },
      });

      await this.menuItemCostService.refreshComboCost(tenantId, menuItemId);
      await this.menuItemSupportService.listCache.invalidate(tenantId);
      return this.menuItemQueryService.findOne(menuItemId, tenantId);
    } catch (error) {
      this.logger.error(`Failed to replace combo items for menu item ${menuItemId}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid childId in the provided list`);
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(this.menuItemSupportService.describeMenuItemUniqueConstraintError(error));
      }
      throw error;
    }
  }
}
