import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { StaffingCalculatorService } from '../../staffing/staffing-calculator.service';
import { detectFnbTags } from '../../staffing/fnb-tags.util';
import { PutPerformanceDto, PutStaffDto, PutInventoryDto, PutMenuItemSalesInputDto } from '../dto/builder-v2.dto';
import { BuilderV2SupportService } from './builder-v2-support.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * Réglages d'un élément par configuration : performance, staff et suggestions, ventes par article, inventaire.
 */
@Injectable()
export class BuilderV2ElementSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffingCalculator: StaffingCalculatorService,
    private readonly builderV2SupportService: BuilderV2SupportService,
  ) {}

  async putPerformance(elementId: string, tenantId: string, dto: PutPerformanceDto, configId?: string, user?: SpaceScopedUser) {
    const element = await this.builderV2SupportService.getElementOrThrow(elementId, tenantId, user);
    const targetConfigId = await this.builderV2SupportService.resolveElementConfigId(elementId, configId);
    const data = {
      revenue: dto.revenue ?? 0,
      numberOfPOS: dto.numberOfPOS ?? 0,
      numberOfTransactions: dto.numberOfTransactions ?? 0,
      transactionsPerMinute: dto.transactionsPerMinute ?? 0,
      staffCost: dto.staffCost ?? 0,
      revenuePerEmployee: dto.revenuePerEmployee ?? 0,
    };
    // Pas d'upsert Prisma sur (elementId, configId) : configId peut être null (élément
    // orphelin) et Prisma refuse les null dans une clé unique composée. find+update/create
    // — l'unicité DB (elementId, configId) protège contre les doublons non-null.
    const existing = await this.prisma.elementPerformance.findFirst({
      where: { elementId, configId: targetConfigId },
      select: { id: true },
    });
    const performance = existing
      ? await this.prisma.elementPerformance.update({ where: { id: existing.id }, data })
      : await this.prisma.elementPerformance.create({
          data: { elementId, configId: targetConfigId, ...data },
        });
    await this.builderV2SupportService.invalidate(tenantId, element.zone!.spaceId);
    return performance;
  }

  async putStaff(elementId: string, tenantId: string, dto: PutStaffDto, configId?: string, user?: SpaceScopedUser) {
    const element = await this.builderV2SupportService.getElementOrThrow(elementId, tenantId, user);
    const targetConfigId = await this.builderV2SupportService.resolveElementConfigId(elementId, configId);
    await this.prisma.$transaction([
      this.prisma.elementStaff.deleteMany({ where: { elementId, configId: targetConfigId } }),
      ...(dto.staff.length
        ? [
            this.prisma.elementStaff.createMany({
              data: dto.staff.map((s) => ({
                elementId, configId: targetConfigId,
                position: s.position, count: s.count, hourlyRate: s.hourlyRate ?? null,
                roleId: s.roleId ?? null, source: s.source ?? 'MANUAL',
              })),
            }),
          ]
        : []),
    ]);
    await this.builderV2SupportService.invalidate(tenantId, element.zone!.spaceId);
    return this.prisma.elementStaff.findMany({ where: { elementId, configId: targetConfigId } });
  }

  /**
   * Saisie manuelle "vendu/prévu" par Menu Item pour ce shop, scopée par config (événement) —
   * 11_RH_STAFFING.md §11.16. Même patron delete+recreate que putStaff().
   */
  async getMenuItemSalesInput(elementId: string, tenantId: string, configId?: string, user?: SpaceScopedUser) {
    await this.builderV2SupportService.getElementOrThrow(elementId, tenantId, user);
    const targetConfigId = await this.builderV2SupportService.resolveElementConfigId(elementId, configId);
    return this.prisma.elementMenuItemSalesInput.findMany({ where: { elementId, configId: targetConfigId } });
  }

  async putMenuItemSalesInput(elementId: string, tenantId: string, dto: PutMenuItemSalesInputDto, configId?: string, user?: SpaceScopedUser) {
    const element = await this.builderV2SupportService.getElementOrThrow(elementId, tenantId, user);
    const targetConfigId = await this.builderV2SupportService.resolveElementConfigId(elementId, configId);
    await this.prisma.$transaction([
      this.prisma.elementMenuItemSalesInput.deleteMany({ where: { elementId, configId: targetConfigId } }),
      ...(dto.rows.length
        ? [
            this.prisma.elementMenuItemSalesInput.createMany({
              data: dto.rows.map((r) => ({
                tenantId, elementId, configId: targetConfigId, menuItemId: r.menuItemId,
                quantity: r.quantity ?? null, revenueHt: r.revenueHt ?? null, source: 'MANUAL',
              })),
            }),
          ]
        : []),
    ]);
    await this.builderV2SupportService.invalidate(tenantId, element.zone!.spaceId);
    return this.prisma.elementMenuItemSalesInput.findMany({ where: { elementId, configId: targetConfigId } });
  }

  /**
   * Résout les lignes AUTO issues des associations Rôle↔MenuItem (HrRoleMenuItemRatio) pour cet
   * élément — additionnées (pas maxées) aux suggestions issues des Sinking Rules dans
   * getStaffSuggestions(). "allMenuItems" s'expand sur tout ce que l'utilisateur a saisi pour ce
   * shop (pas besoin d'interroger le catalogue menu séparément — un item sans saisie contribue 0
   * de toute façon).
   */
  private async computeMenuItemRatioOutcomes(
    elementId: string,
    targetConfigId: string | null,
    tenantId: string,
    ratios: Array<{ roleId: string; ratioBasis: string; ratioValue: number; unitQty: number; allMenuItems: boolean; menuItemIds: string[] }>,
  ) {
    if (!ratios.length) return [];
    const salesRows = await this.prisma.elementMenuItemSalesInput.findMany({
      where: { elementId, configId: targetConfigId },
    });
    const sales = salesRows.map((s) => ({
      menuItemId: s.menuItemId,
      quantity: s.quantity ?? 0,
      revenueHt: s.revenueHt ?? 0,
    }));
    const ratioInputs = ratios.map((r) => ({
      roleId: r.roleId,
      ratioBasis: r.ratioBasis as 'REVENUE' | 'QUANTITY',
      ratioValue: r.ratioValue,
      unitQty: r.unitQty,
      targetMenuItemIds: r.allMenuItems ? sales.map((s) => s.menuItemId) : r.menuItemIds,
    }));
    return this.staffingCalculator.applyMenuItemRatios(ratioInputs, sales);
  }

  /**
   * Postes obligatoires pour cet élément selon ses sous-types (auto-remplissage de la section
   * Staff du Builder, 2026-07-30 — révisé le même jour suite retour utilisateur ; généralisé
   * au-delà de F&B le 2026-07-31, même retour utilisateur : le choix du département doit
   * piloter quel sous-type on peut lier, pas rester câblé sur `shop`). Un rôle tagué avec un
   * sous-type présent suffit — pas besoin d'une règle Sinking en plus (`computeStaffSuggestions`,
   * cf. commentaire). Les règles Sinking avec condition d'équipement ne matchent jamais en
   * pratique ici : aucun champ du Builder ne renseigne encore les attributs (nbFriteuses…) sur
   * SpaceElement.attributes — limite assumée, cf. BUG-260-02.
   */
  async getStaffSuggestions(elementId: string, tenantId: string, configId?: string, user?: SpaceScopedUser) {
    const element = await this.builderV2SupportService.getElementOrThrow(elementId, tenantId, user);
    // CFG-2 (généralisé 2026-07-31) : plus limité à STAFFING_ELEMENT_TYPES (shop + legacy
    // fnb_*) — tout département `needsRh=true` peut avoir des rôles auto-suggérés sur ses
    // propres éléments. Les rôles considérés sont scopés au MÊME département que l'élément :
    // un code de sous-type n'est unique QUE par département (ex. `temporary` existe à la fois
    // sur `shop` et `merchshop`) — comparer tenant-wide sans ce scope créerait de faux positifs
    // (garde-fou déjà identifié le 2026-07-30, préservé ici sous une forme généralisée).
    const dept = await this.resolveDepartmentForElementType((element as any).type);
    if (!dept?.needsRh) return [];
    const fnbTags = detectFnbTags((element as any).subtypes);
    const attrs = ((element as any).attributes ?? {}) as Record<string, any>;
    const departmentValues = [dept.code, dept.id].filter(Boolean) as string[];
    const spaceId = element.zone!.spaceId;
    const targetConfigId = await this.builderV2SupportService.resolveElementConfigId(elementId, configId);
    const [roles, rules, menuItemRatios] = await Promise.all([
      this.prisma.hrRole.findMany({ where: { tenantId, department: { in: departmentValues } } }),
      this.prisma.hrSinkingRule.findMany({ where: { tenantId } }),
      this.prisma.hrRoleMenuItemRatio.findMany({ where: { tenantId, spaceId } }),
    ]);
    // Sinking Rules restent tag-scopées (aucun tag présent → []) ; les associations
    // Rôle↔MenuItem (11_RH_STAFFING.md §11.16) sont scopées par espace, pas par tag F&B — elles
    // s'évaluent indépendamment du présent bloc et sont ADDITIONNÉES (pas maxées) au résultat.
    const tagSuggestions =
      fnbTags.size > 0 ? this.staffingCalculator.computeStaffSuggestions(fnbTags, attrs, roles as any, rules as any) : [];
    const ratioOutcomes = await this.computeMenuItemRatioOutcomes(elementId, targetConfigId, tenantId, menuItemRatios as any);
    if (!ratioOutcomes.length) return tagSuggestions;

    const byRoleQty = new Map<string, number>();
    const roleMeta = new Map<string, { roleName: string; hourlyRate: number }>();
    for (const s of tagSuggestions) {
      byRoleQty.set(s.roleId, s.qty);
      roleMeta.set(s.roleId, { roleName: s.roleName, hourlyRate: s.hourlyRate });
    }
    const missingRoleIds = [...new Set(ratioOutcomes.map((o) => o.roleId))].filter((id) => !roleMeta.has(id));
    if (missingRoleIds.length) {
      const extraRoles = await this.prisma.hrRole.findMany({ where: { id: { in: missingRoleIds }, tenantId } });
      for (const r of extraRoles) {
        roleMeta.set(r.id, { roleName: r.name, hourlyRate: this.staffingCalculator.hourlyRateFrom(r.rateType, r.rate) ?? 0 });
      }
    }
    for (const o of ratioOutcomes) {
      byRoleQty.set(o.roleId, (byRoleQty.get(o.roleId) ?? 0) + o.qty);
    }
    return [...byRoleQty.entries()]
      .filter(([roleId]) => roleMeta.has(roleId))
      .map(([roleId, qty]) => ({ roleId, qty, ...roleMeta.get(roleId)! }));
  }

  // Résout le département d'un `SpaceElement.type` — replie d'abord les 5 valeurs legacy F&B
  // pré-`subtypes[]` (jamais réécrites en base, cf. CFG-2 Étape 2/3) sur `shop`, puis résout
  // contre Department (code ou id). Partagé par getStaffSuggestions() ; mapType() a sa propre
  // logique (avec repli TOOL_TYPE_MAP complet) pour la création d'éléments.
  private async resolveDepartmentForElementType(type: string) {
    const key = ['fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream'].includes(type)
      ? 'shop'
      : type;
    return this.prisma.department.findFirst({ where: { OR: [{ code: key }, { id: key }] } });
  }

  async putInventory(elementId: string, tenantId: string, dto: PutInventoryDto, configId?: string, user?: SpaceScopedUser) {
    const element = await this.builderV2SupportService.getElementOrThrow(elementId, tenantId, user);
    const targetConfigId = await this.builderV2SupportService.resolveElementConfigId(elementId, configId);
    await this.prisma.$transaction([
      this.prisma.elementInventory.deleteMany({ where: { elementId, configId: targetConfigId } }),
      ...(dto.inventory.length
        ? [
            this.prisma.elementInventory.createMany({
              data: dto.inventory.map((i) => ({
                elementId, configId: targetConfigId,
                name: i.name, quantity: i.quantity, unit: i.unit ?? null,
                minStock: i.minStock ?? null, maxStock: i.maxStock ?? null,
                isCustom: i.isCustom ?? true, menuItemId: i.menuItemId ?? null,
              })),
            }),
          ]
        : []),
    ]);
    await this.builderV2SupportService.invalidate(tenantId, element.zone!.spaceId);
    return this.prisma.elementInventory.findMany({ where: { elementId, configId: targetConfigId } });
  }
}
