import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { linksToSpaceIds, spaceLinksSelect } from '../../../shared/pricing/space-links.util';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { MenuItemSupportService } from './menu-item-support.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

const ASSERT_SPACE_ACCESS_MESSAGES = {
  none: "Cet article n'est rattaché à aucun espace — réservé aux comptes à accès complet.",
  denied: "Vous n'avez pas accès à l'espace de cet article.",
};

/**
 * Recettes des articles : composants, ingrédients, emballages et fournisseurs.
 */
@Injectable()
export class MenuItemRecipeService {
  constructor(
    private prisma: PrismaService,
    private spaceAccess: SpaceAccessService,
    private readonly menuItemSupportService: MenuItemSupportService,
  ) {}

  private readonly logger = new Logger(MenuItemRecipeService.name);

  // ── Recette / réarmement plats composés ──────────────────────────────────
  // Endpoint DÉDIÉ (GET /menu-items/:id/recipe + POST /menu-items/recipes).
  // Ne touche PAS au `components` de /menu-items (= MenuItemComponent[]) → aucune
  // régression éditeur de recettes / /space-menus / DTO create-update / Swagger.
  // Voir docs/recipe-endpoint.api.md.
  private readonly recipeInclude = {
    components: { include: { component: true } },
    ingredients: { include: { ingredient: { include: { marketPrice: { select: this.menuItemSupportService.marketPriceSelectNoImage } } } } },
    packagings: { include: { packaging: { include: { marketPrice: { select: this.menuItemSupportService.marketPriceSelectNoImage } } } } },
    comboChildren: { include: { child: true } },
    spaceLinks: spaceLinksSelect,
  };

  /** Normalise vers 'Yes'/'No' (casse/oui-non/booléen). null/'' restent null. */
  private normYesNo(value: unknown): 'Yes' | 'No' | null {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    const s = String(value ?? '').trim().toLowerCase();
    if (s === 'yes' || s === 'true' || s === 'oui' || s === '1') return 'Yes';
    if (s === 'no' || s === 'false' || s === 'non' || s === '0') return 'No';
    return null;
  }

  /** category détectable comme packaging par le front (isPackagingComponent). */
  private isPackagingCategory(category?: string | null) {
    const c = String(category ?? '').toLowerCase();
    return c.includes('packaging') || c.includes('emballage');
  }

  /** Coût de ligne : totalCost déjà calculé (refreshCosts) sinon unitCost × qty. */
  private lineCost(line: any) {
    const total = this.menuItemSupportService.toNumber(line.totalCost, NaN);
    if (Number.isFinite(total)) return total;
    return Math.round(this.menuItemSupportService.toNumber(line.unitCost) * this.menuItemSupportService.toNumber(line.numberOfUnits) * 10000) / 10000;
  }

  /**
   * Fusionne les 4 relations (MenuItemIngredient + MenuItemComponent +
   * MenuItemPackaging + MenuItemCombo) en un seul `components[]` dénormalisé au
   * format contrat. Résout `supplierId` inline via marketPrice (le front
   * court-circuite ainsi le join marketPrice→supplier). Collecte les
   * supplierIds rencontrés.
   * NB: les MenuComponent (sous-recettes) sont retournés comme lignes terminales
   * (`itemType:'Component'`) ; le moteur front `expandMenuItemStock` recurse de
   * lui-même au niveau menu-items (pas d'aplatissement serveur superflu).
   * Idem pour les MenuItemCombo (`itemType:'MenuItem'`) : un combo n'est qu'un
   * panier de refs vers d'autres MenuItem, le front sait déjà les ouvrir
   * (BUG-002/Q18) — sans cette ligne, `components` ressort vide pour un combo
   * dont la composition ne passe QUE par comboChildren, et le front le traite à
   * tort comme un article sans recette.
   */
  private buildRecipeComponents(item: any): { components: any[]; supplierIds: Set<string> } {
    const supplierIds = new Set<string>();
    const components: any[] = [];

    for (const line of item.ingredients || []) {
      const ing = line.ingredient || {};
      const mp = ing.marketPrice || null;
      const supplierId = mp?.supplierId || null;
      if (supplierId) supplierIds.add(supplierId);
      components.push({
        id: line.id,
        sourceId: line.ingredientId,
        name: ing.name ?? null,
        itemType: 'Ingredient',
        numberOfUnits: this.menuItemSupportService.toNumber(line.numberOfUnits),
        unit: ing.recipeUnit ?? 'unit',
        category: ing.ingredientCategory ?? mp?.category ?? null,
        storageType: line.storageType ?? ing.storageType ?? null,
        marketPriceId: ing.marketPriceId ?? null,
        supplierId,
        cost: this.lineCost(line),
      });
    }

    for (const line of item.packagings || []) {
      const pkg = line.packaging || {};
      const mp = pkg.marketPrice || null;
      const supplierId = mp?.supplierId || null;
      if (supplierId) supplierIds.add(supplierId);
      // StorageType DB = Cold|Dry|Frozen (jamais 'material') → on s'appuie sur la
      // `category` pour la détection front, et on force storageType='material'
      // (contrat) pour fiabiliser isPackagingComponent.
      const category = this.isPackagingCategory(pkg.ingredientCategory)
        ? pkg.ingredientCategory
        : 'packaging';
      components.push({
        id: line.id,
        sourceId: line.packagingId,
        name: pkg.name ?? null,
        itemType: 'Packaging',
        numberOfUnits: this.menuItemSupportService.toNumber(line.numberOfUnits),
        unit: pkg.recipeUnit ?? 'unit',
        category,
        storageType: 'material',
        marketPriceId: pkg.marketPriceId ?? null,
        supplierId,
        cost: this.lineCost(line),
      });
    }

    for (const line of item.components || []) {
      const comp = line.component || {};
      components.push({
        id: line.id,
        sourceId: line.componentId,
        name: comp.name ?? null,
        itemType: 'Component',
        numberOfUnits: this.menuItemSupportService.toNumber(line.numberOfUnits),
        unit: comp.unit ?? 'unit',
        category: comp.category ?? null,
        storageType: line.storageType ?? comp.storageType ?? null,
        marketPriceId: null,
        supplierId: null,
        cost: this.lineCost(line),
      });
    }

    for (const line of item.comboChildren || []) {
      const child = line.child || {};
      components.push({
        id: line.id,
        sourceId: line.childId,
        name: child.name ?? null,
        itemType: 'MenuItem',
        numberOfUnits: this.menuItemSupportService.toNumber(line.quantity),
        unit: line.unit ?? 'unit',
        category: null,
        storageType: null,
        marketPriceId: null,
        supplierId: null,
        cost: this.menuItemSupportService.toNumber(line.cost, 0),
      });
    }

    return { components, supplierIds };
  }

  /** Charge le dictionnaire fournisseurs (id, name, email, phone←tel, sites). */
  private async loadSuppliers(supplierIds: Set<string>, tenantId: string) {
    if (!supplierIds.size) return [];
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: [...supplierIds] }, tenantId },
      select: { id: true, name: true, email: true, tel: true, sites: true },
    });
    return suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email ?? null,
      phone: s.tel ?? null,
      sites: s.sites ?? [],
    }));
  }

  private toRecipeDto(item: any, components: any[]) {
    return {
      id: item.id,
      name: item.name,
      readyForSale: this.normYesNo(item.readyForSale),
      comboItem: this.normYesNo(item.comboItem),
      numberOfPiecesRecipe: this.menuItemSupportService.toNumber(item.numberOfPiecesRecipe, 1) || 1,
      cost: this.menuItemSupportService.toNumber(item.totalCost, 0),
      components,
      // Ajoutés pour le portage backend de buildConsolidatedInventory (accès invité
      // PIN, 2026-09-08) : ces 3 champs scalaires existent déjà sur `item` (recipeInclude
      // ne restreint pas les colonnes top-level), juste jamais renvoyés jusqu'ici — champ
      // additif, aucun consommateur existant du contrat recette n'est affecté.
      picture: item.picture ?? null,
      inventoryNumberOfUnits: item.inventoryNumberOfUnits ?? null,
      inventoryPackagingType: item.inventoryPackagingType ?? null,
    };
  }

  async getRecipe(id: string, tenantId: string, user?: SpaceScopedUser) {
    this.logger.log(`Fetching recipe for menu item ${id} (tenant ${tenantId})`);
    const item = await this.prisma.menuItem.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: this.recipeInclude,
    });
    if (!item) throw new NotFoundException(`Menu item with ID ${id} not found`);
    await this.spaceAccess.assertCanAccessAny(user, linksToSpaceIds((item as any).spaceLinks), ASSERT_SPACE_ACCESS_MESSAGES);
    const { components, supplierIds } = this.buildRecipeComponents(item);
    const suppliers = await this.loadSuppliers(supplierIds, tenantId);
    return { ...this.toRecipeDto(item, components), suppliers };
  }

  async getRecipes(ids: string[], tenantId: string) {
    const where: any = { tenantId, deletedAt: null };
    if (Array.isArray(ids) && ids.length) where.id = { in: ids };
    this.logger.log(`Fetching recipes for ${ids?.length ?? 'all'} menu item(s) (tenant ${tenantId})`);
    const items = await this.prisma.menuItem.findMany({
      where,
      orderBy: { name: 'asc' },
      include: this.recipeInclude,
    });
    const allSupplierIds = new Set<string>();
    const built = items.map((item) => {
      const { components, supplierIds } = this.buildRecipeComponents(item);
      supplierIds.forEach((s) => allSupplierIds.add(s));
      return this.toRecipeDto(item, components);
    });
    const suppliers = await this.loadSuppliers(allSupplierIds, tenantId);
    return { items: built, suppliers };
  }
}
